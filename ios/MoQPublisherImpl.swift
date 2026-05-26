import AVFoundation
import Foundation
import MoQKit

// Shared identifiers used by the host app side AND the Broadcast Upload
// Extension's MoQReplayKitBroadcastSampleHandler subclass. Both sides MUST
// agree on these — they're documented in the README so integrators can wire
// up their extension to the same keys.
public enum MoQScreenBroadcastSharedKeys {
  // Key under which the host writes the full ReplayKitBroadcastConfiguration
  // (JSON-encoded). The extension's sample handler reads this on launch.
  public static let configurationKey = "com.swmansion.moq.screenBroadcast.config"
  // Key under which the extension writes its current state for the host to
  // observe: { "state": "...", "error": "..." }.
  public static let stateKey = "com.swmansion.moq.screenBroadcast.state"
  // Darwin notification posted by the extension whenever the state key
  // changes, so the host can react without polling.
  public static let stateNotificationName = "com.swmansion.moq.screenBroadcast.stateChanged"
}

@objc public class MoQPublisherImpl: NSObject {
  @objc public static let shared = MoQPublisherImpl()
  private override init() {}

  @objc public var onEvent: ((_ name: String, _ body: [String: Any]) -> Void)?

  // MARK: - Private state (MainActor)

  // Per-session publisher context. Camera and microphone are owned by
  // MoQCameraImpl / MoQMicrophoneImpl respectively; the publisher just
  // references them and lets the underlying impls handle refcounting.
  private final class PublisherContext {
    let sessionId: String
    let publisher: Publisher
    var stateTask: Task<Void, Never>?
    var eventsTask: Task<Void, Never>?
    var trackStateTasks: [Task<Void, Never>] = []

    init(sessionId: String, publisher: Publisher) {
      self.sessionId = sessionId
      self.publisher = publisher
    }
  }

  private var publishers: [String: PublisherContext] = [:]

  // App Group identifier currently configured for screen broadcasting. We keep
  // it so we can read state written by the Broadcast Upload Extension and clear
  // the descriptor when the host calls stopScreenBroadcast().
  private var screenAppGroupIdentifier: String?
  private var screenBroadcastDarwinObserver: UnsafeMutableRawPointer?

  // MARK: - Objc bridge

  @objc(publishWithSessionId:path:tracksJson:)
  public func publish(sessionId: String, path: String, tracksJson: String) {
    let tracks = Self.parseTracks(tracksJson)
    Task { @MainActor in
      await self._publish(sessionId: sessionId, path: path, tracks: tracks)
    }
  }

  @objc(stopWithSessionId:)
  public func stop(sessionId: String) {
    Task { @MainActor in await self._stop(sessionId: sessionId) }
  }

  @objc(configureScreenBroadcast:optsJson:)
  public func configureScreenBroadcast(url: String, optsJson: String) {
    Task { @MainActor in self._configureScreenBroadcast(url: url, optsJson: optsJson) }
  }

  @objc public func stopScreenBroadcast() {
    Task { @MainActor in self._stopScreenBroadcast() }
  }

  // MARK: - Publish

  @MainActor
  private func _publish(sessionId: String, path: String, tracks: [TrackDescriptor]) async {
    guard publishers[sessionId] == nil else { return }
    guard let s = MoQImpl.shared.currentSession(forSessionId: sessionId) else {
      emitPublisherState(sessionId: sessionId, state: "error:session is not connected")
      return
    }

    do {
      let pub = try Publisher()
      let ctx = PublisherContext(sessionId: sessionId, publisher: pub)
      publishers[sessionId] = ctx

      var publishedTracks: [PublishedTrack] = []

      for descriptor in tracks {
        switch descriptor {
        case .camera(let name, let config):
          let cam = try await MoQCameraImpl.shared.waitForCameraCapture()
          publishedTracks.append(
            pub.addVideoTrack(name: name, source: cam, config: config))
        case .microphone(let name, let config):
          let mic = try await MoQMicrophoneImpl.shared.waitForMicrophone()
          publishedTracks.append(
            pub.addAudioTrack(name: name, source: mic, config: config))
        }
      }

      try await s.publish(path: path, publisher: pub)
      try await pub.start()

      observePublisher(ctx, tracks: publishedTracks)
    } catch {
      publishers.removeValue(forKey: sessionId)
      emitPublisherState(sessionId: sessionId, state: "error:\(error.localizedDescription)")
      await _stop(sessionId: sessionId)
    }
  }

  @MainActor
  private func observePublisher(_ ctx: PublisherContext, tracks: [PublishedTrack]) {
    let pub = ctx.publisher
    let sid = ctx.sessionId
    ctx.stateTask = Task { @MainActor in
      for await state in pub.state {
        switch state {
        case .idle: break
        case .publishing: self.emitPublisherState(sessionId: sid, state: "publishing")
        case .stopped: self.emitPublisherState(sessionId: sid, state: "stopped")
        case .error(let msg): self.emitPublisherState(sessionId: sid, state: "error:\(msg)")
        }
      }
    }

    ctx.eventsTask = Task { @MainActor in
      for await event in pub.events {
        switch event {
        case .trackStarted(let name):
          self.onEvent?(
            "publisherTrackStateChanged",
            ["sessionId": sid, "name": name, "state": "active"])
        case .trackStopped(let name):
          self.onEvent?(
            "publisherTrackStateChanged",
            ["sessionId": sid, "name": name, "state": "stopped"])
        case .error(let name, let msg):
          self.onEvent?(
            "publisherTrackStateChanged",
            ["sessionId": sid, "name": name, "state": "stopped", "error": msg])
        }
      }
    }

    for track in tracks {
      let name = track.name
      let task = Task { @MainActor in
        for await state in track.state {
          self.onEvent?(
            "publisherTrackStateChanged",
            ["sessionId": sid, "name": name, "state": Self.trackStateString(state)])
        }
      }
      ctx.trackStateTasks.append(task)
    }
  }

  @MainActor
  private func _stop(sessionId: String) async {
    guard let ctx = publishers.removeValue(forKey: sessionId) else { return }

    ctx.stateTask?.cancel()
    ctx.eventsTask?.cancel()
    ctx.trackStateTasks.forEach { $0.cancel() }

    emitPublisherState(sessionId: sessionId, state: "idle")

    // Tear down the publisher off the main thread — pub.stop() may block on
    // encoder flush. The Session is owned by MoQImpl and stays alive across
    // publish cycles, so we don't close it here. The camera/mic captures are
    // owned by their respective impls and stay alive as long as a hook is
    // mounted, so we don't stop them either.
    let pub = ctx.publisher
    Task.detached {
      pub.stop()
    }
  }

  // MARK: - Screen broadcast (Broadcast Upload Extension)

  @MainActor
  private func _configureScreenBroadcast(url: String, optsJson: String) {
    let opts = Self.parseScreenOpts(optsJson)
    guard let appGroup = opts.appGroupIdentifier else {
      emitScreenBroadcastState("error:appGroupIdentifier is required on iOS")
      return
    }
    guard !opts.path.isEmpty else {
      emitScreenBroadcastState("error:path is required")
      return
    }

    let descriptor = ReplayKitBroadcastDescriptor(
      relayURL: url, broadcastPath: opts.path)
    let configuration = ReplayKitBroadcastConfiguration(
      descriptor: descriptor,
      videoTrackName: "screen",
      appAudioTrackName: opts.appAudio ? "screen-audio" : nil,
      micAudioTrackName: opts.mic ? "screen-mic" : nil,
      videoEncoder: VideoEncoderConfig(
        codec: opts.videoCodec,
        width: opts.width,
        height: opts.height,
        maxFrameRate: opts.framerate),
      appAudioEncoder: AudioEncoderConfig(
        codec: opts.audioCodec,
        sampleRate: opts.audioSampleRate),
      micAudioEncoder: AudioEncoderConfig(
        codec: opts.audioCodec,
        sampleRate: opts.audioSampleRate))

    do {
      // Write both: the standard descriptor (used by MoQReplayKitBroadcastSampleHandler's
      // default config path) AND our full configuration override (read by the
      // example's SampleHandler subclass, which overrides makeReplayKitBroadcastConfiguration).
      let store = ReplayKitBroadcastDescriptorStore(appGroupIdentifier: appGroup)
      try store.save(descriptor)

      guard let defaults = UserDefaults(suiteName: appGroup) else {
        emitScreenBroadcastState(
          "error:App Group \(appGroup) is not accessible to the host app")
        return
      }
      let encoded = try JSONEncoder().encode(configuration)
      defaults.set(encoded, forKey: MoQScreenBroadcastSharedKeys.configurationKey)

      // (Re)attach the Darwin observer for state notifications from the extension.
      setupScreenBroadcastStateObserver(appGroup: appGroup)
      screenAppGroupIdentifier = appGroup

      // Re-emit whatever state the extension last reported (or "idle" if none).
      emitCurrentScreenBroadcastState()
    } catch {
      emitScreenBroadcastState("error:\(error.localizedDescription)")
    }
  }

  @MainActor
  private func _stopScreenBroadcast() {
    // We cannot programmatically stop a ReplayKit broadcast from the host — the
    // user (or the extension itself) controls that. What we CAN do is clear the
    // shared descriptor so the next launch fails fast, and locally signal idle.
    if let appGroup = screenAppGroupIdentifier,
      let defaults = UserDefaults(suiteName: appGroup)
    {
      defaults.removeObject(forKey: MoQScreenBroadcastSharedKeys.configurationKey)
      try? ReplayKitBroadcastDescriptorStore(appGroupIdentifier: appGroup).clear()
    }
    teardownScreenBroadcastStateObserver()
    screenAppGroupIdentifier = nil
    emitScreenBroadcastState("idle")
  }

  @MainActor
  private func setupScreenBroadcastStateObserver(appGroup: String) {
    teardownScreenBroadcastStateObserver()

    // Darwin notifications are process-wide and don't carry user info, so the
    // host reads the latest state out of App Group UserDefaults whenever the
    // extension fires this.
    let observer = Unmanaged.passUnretained(self).toOpaque()
    screenBroadcastDarwinObserver = observer
    CFNotificationCenterAddObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      observer,
      { _, observer, _, _, _ in
        guard let observer else { return }
        let impl = Unmanaged<MoQPublisherImpl>.fromOpaque(observer).takeUnretainedValue()
        Task { @MainActor in impl.emitCurrentScreenBroadcastState() }
      },
      MoQScreenBroadcastSharedKeys.stateNotificationName as CFString,
      nil,
      .deliverImmediately)
  }

  @MainActor
  private func teardownScreenBroadcastStateObserver() {
    guard let observer = screenBroadcastDarwinObserver else { return }
    CFNotificationCenterRemoveObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      observer,
      CFNotificationName(MoQScreenBroadcastSharedKeys.stateNotificationName as CFString),
      nil)
    screenBroadcastDarwinObserver = nil
  }

  @MainActor
  private func emitCurrentScreenBroadcastState() {
    guard
      let appGroup = screenAppGroupIdentifier,
      let defaults = UserDefaults(suiteName: appGroup),
      let data = defaults.data(forKey: MoQScreenBroadcastSharedKeys.stateKey),
      let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let state = payload["state"] as? String
    else {
      emitScreenBroadcastState("idle")
      return
    }
    if let error = payload["error"] as? String, state == "error" {
      emitScreenBroadcastState("error:\(error)")
    } else {
      emitScreenBroadcastState(state)
    }
  }

  private func emitScreenBroadcastState(_ state: String) {
    onEvent?("screenBroadcastStateChanged", ["state": state])
  }

  private struct ScreenBroadcastOpts {
    var path: String = ""
    var appGroupIdentifier: String?
    var appAudio: Bool = true
    var mic: Bool = true
    var videoCodec: VideoCodec = .h265
    // ReplayKitBroadcastPipeline overrides width/height/maxFrameRate with the
    // device's screen metrics at start time; these are placeholders that just
    // need to be valid VideoEncoderConfig values.
    var width: Int32 = 1920
    var height: Int32 = 1080
    var framerate: Double = 60
    var audioCodec: MoQKit.AudioCodec = .opus
    var audioSampleRate: Double = 48_000
  }

  private static func parseScreenOpts(_ json: String) -> ScreenBroadcastOpts {
    var opts = ScreenBroadcastOpts()
    if !VideoEncoderConfig.supportedCodecs().contains(.h265) { opts.videoCodec = .h264 }
    guard
      let data = json.data(using: .utf8),
      let dict = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    else { return opts }
    if let v = dict["path"] as? String { opts.path = v }
    if let v = dict["appGroupIdentifier"] as? String { opts.appGroupIdentifier = v }
    if let v = dict["appAudio"] as? Bool { opts.appAudio = v }
    if let v = dict["mic"] as? Bool { opts.mic = v }
    if let v = dict["videoCodec"] as? String, let parsed = VideoCodec(rawValue: v) {
      opts.videoCodec = parsed
    }
    if let v = dict["width"] as? NSNumber { opts.width = v.int32Value }
    if let v = dict["height"] as? NSNumber { opts.height = v.int32Value }
    if let v = dict["framerate"] as? NSNumber { opts.framerate = v.doubleValue }
    if let v = dict["audioCodec"] as? String, let parsed = MoQKit.AudioCodec(rawValue: v) {
      opts.audioCodec = parsed
    }
    if let v = dict["audioSampleRate"] as? NSNumber { opts.audioSampleRate = v.doubleValue }
    return opts
  }

  // MARK: - Helpers

  private func emitPublisherState(sessionId: String, state: String) {
    onEvent?("publisherStateChanged", ["sessionId": sessionId, "state": state])
  }

  private static func trackStateString(_ state: PublishedTrackState) -> String {
    switch state {
    case .idle: return "idle"
    case .starting: return "starting"
    case .active: return "active"
    case .stopped: return "stopped"
    }
  }

  // MARK: - Track parsing

  private enum TrackDescriptor {
    case camera(name: String, config: VideoEncoderConfig)
    case microphone(name: String, config: AudioEncoderConfig)
  }

  private static func parseTracks(_ json: String) -> [TrackDescriptor] {
    guard
      let data = json.data(using: .utf8),
      let arr = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]]
    else { return [] }

    var out: [TrackDescriptor] = []
    for entry in arr {
      guard
        let type = entry["type"] as? String,
        let name = entry["name"] as? String,
        let enc = entry["encoder"] as? [String: Any]
      else { continue }
      switch type {
      case "camera":
        let codec = (enc["codec"] as? String).flatMap(VideoCodec.init(rawValue:)) ?? .h264
        let width = (enc["width"] as? NSNumber)?.int32Value ?? 1280
        let height = (enc["height"] as? NSNumber)?.int32Value ?? 720
        let framerate = (enc["framerate"] as? NSNumber)?.doubleValue ?? 30
        out.append(.camera(
          name: name,
          config: VideoEncoderConfig(
            codec: codec, width: width, height: height, maxFrameRate: framerate)))
      case "microphone":
        let codec = (enc["codec"] as? String)
          .flatMap(MoQKit.AudioCodec.init(rawValue:)) ?? .opus
        let sampleRate = (enc["sampleRate"] as? NSNumber)?.doubleValue ?? 48_000
        out.append(.microphone(
          name: name,
          config: AudioEncoderConfig(codec: codec, sampleRate: sampleRate)))
      default: continue
      }
    }
    return out
  }
}
