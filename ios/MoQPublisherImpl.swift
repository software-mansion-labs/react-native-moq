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

  // Notification posted whenever the shared AVCaptureSession is created or
  // torn down. MoQCameraPreviewView observes this to (re)attach its layer.
  static let cameraSessionChangedNotification = Notification.Name(
    "MoQPublisherImpl.cameraSessionChanged")

  @MainActor @objc public func currentCaptureSession() -> AVCaptureSession? {
    cameraCapture?.captureSession
  }

  // MARK: - Private state (MainActor)

  private var cameraCapture: CameraCapture?
  private var cameraPosition: CameraPosition = .front
  private var previewRefCount: Int = 0

  // Per-session publisher context. Multiple sessions can host concurrent
  // publishers; the camera and microphone are shared as singletons since the
  // device only has one each, but each session owns its own Publisher and
  // observation tasks.
  private final class PublisherContext {
    let sessionId: String
    let publisher: Publisher
    var stateTask: Task<Void, Never>?
    var eventsTask: Task<Void, Never>?
    var trackStateTasks: [Task<Void, Never>] = []
    var usesCamera: Bool = false
    var ownsMicrophone: Bool = false

    init(sessionId: String, publisher: Publisher) {
      self.sessionId = sessionId
      self.publisher = publisher
    }
  }

  private var publishers: [String: PublisherContext] = [:]
  private var microphone: MicrophoneCapture?
  // Ref count for who currently uses the shared microphone (one per active
  // mic-enabled publisher). Lets us stop the mic only when the last publisher
  // that needed it has stopped.
  private var microphoneRefCount: Int = 0
  // True while any publish() is in flight (used to keep the shared camera
  // alive even after preview is unmounted).
  private var publishing: Bool { !publishers.isEmpty }

  // App Group identifier currently configured for screen broadcasting. We keep
  // it so we can read state written by the Broadcast Upload Extension and clear
  // the descriptor when the host calls stopScreenBroadcast().
  private var screenAppGroupIdentifier: String?
  private var screenBroadcastDarwinObserver: UnsafeMutableRawPointer?

  // MARK: - Objc bridge

  @objc(startPreview:)
  public func startPreview(cameraPosition: String) {
    Task { @MainActor in
      await self._startPreview(position: Self.parsePosition(cameraPosition))
    }
  }

  @objc public func stopPreview() {
    Task { @MainActor in self._stopPreview() }
  }

  @objc public func flipCamera() {
    Task { @MainActor in self._flipCamera() }
  }

  @objc(publishWithSessionId:path:optsJson:)
  public func publish(sessionId: String, path: String, optsJson: String) {
    let opts = Self.parseOpts(optsJson)
    Task { @MainActor in
      await self._publish(sessionId: sessionId, path: path, opts: opts)
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

  // Mirror moq-kit's iOS demo CodecConfigView gating — return only codecs
  // whose encoder will actually initialize on this device.
  @objc public func supportedCodecs() -> [String: [String]] {
    let video = VideoEncoderConfig.supportedCodecs().map { codec -> String in
      switch codec {
      case .h264: return "h264"
      case .h265: return "h265"
      @unknown default: return ""
      }
    }.filter { !$0.isEmpty }
    let audio = AudioEncoderConfig.supportedCodecs().map { codec -> String in
      switch codec {
      case .opus: return "opus"
      case .aac: return "aac"
      @unknown default: return ""
      }
    }.filter { !$0.isEmpty }
    return ["video": video, "audio": audio]
  }

  // MARK: - Preview

  @MainActor
  private func _startPreview(position: CameraPosition) async {
    previewRefCount += 1
    cameraPosition = position
    if cameraCapture != nil { return }

    let cam = CameraCapture(camera: Camera(position: position))
    cameraCapture = cam
    NotificationCenter.default.post(
      name: MoQPublisherImpl.cameraSessionChangedNotification, object: nil)

    do {
      try await cam.start()
    } catch {
      cameraCapture = nil
      NotificationCenter.default.post(
        name: MoQPublisherImpl.cameraSessionChangedNotification, object: nil)
      broadcastCameraError(error)
    }
  }

  @MainActor
  private func _stopPreview() {
    if previewRefCount > 0 { previewRefCount -= 1 }
    // Keep the camera running while publishing — it's the live source.
    if previewRefCount == 0, !publishing {
      cameraCapture?.stop()
      cameraCapture = nil
      NotificationCenter.default.post(
        name: MoQPublisherImpl.cameraSessionChangedNotification, object: nil)
    }
  }

  @MainActor
  private func _flipCamera() {
    let new: CameraPosition = cameraPosition == .front ? .back : .front
    cameraPosition = new
    guard let cam = cameraCapture else { return }
    do {
      try cam.switch(to: Camera(position: new))
    } catch {
      broadcastCameraError(error)
    }
  }

  // MARK: - Publish

  @MainActor
  private func _publish(sessionId: String, path: String, opts: PublishOpts) async {
    guard publishers[sessionId] == nil else { return }
    guard let s = MoQImpl.shared.currentSession(forSessionId: sessionId) else {
      emitPublisherState(sessionId: sessionId, state: "error:session is not connected")
      return
    }

    Self.configurePublishingAudioSession()

    var didStartMic = false

    do {
      let pub = try Publisher()
      let ctx = PublisherContext(sessionId: sessionId, publisher: pub)
      ctx.usesCamera = opts.cameraEnabled
      ctx.ownsMicrophone = opts.micEnabled
      publishers[sessionId] = ctx

      var tracks: [PublishedTrack] = []

      if opts.cameraEnabled {
        let cam: CameraCapture
        if let existing = cameraCapture {
          cam = existing
        } else {
          cam = CameraCapture(camera: Camera(position: cameraPosition))
          cameraCapture = cam
          try await cam.start()
          NotificationCenter.default.post(
            name: MoQPublisherImpl.cameraSessionChangedNotification, object: nil)
        }
        let videoConfig = VideoEncoderConfig(
          codec: opts.videoCodec,
          width: opts.width,
          height: opts.height,
          maxFrameRate: opts.framerate
        )
        tracks.append(pub.addVideoTrack(name: "camera", source: cam, config: videoConfig))
      }

      if opts.micEnabled {
        let mic: MicrophoneCapture
        if let existing = microphone {
          mic = existing
        } else {
          mic = MicrophoneCapture()
          microphone = mic
          try await mic.start()
        }
        didStartMic = true
        microphoneRefCount += 1
        let audioConfig = AudioEncoderConfig(
          codec: opts.audioCodec,
          sampleRate: opts.audioSampleRate
        )
        tracks.append(pub.addAudioTrack(name: "mic", source: mic, config: audioConfig))
      }

      try await s.publish(path: path, publisher: pub)
      try await pub.start()

      observePublisher(ctx, tracks: tracks)
    } catch {
      if didStartMic {
        microphoneRefCount -= 1
        if microphoneRefCount <= 0 {
          microphoneRefCount = 0
          microphone?.stop(); microphone = nil
        }
      }
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

    if ctx.ownsMicrophone {
      microphoneRefCount -= 1
      if microphoneRefCount <= 0 {
        microphoneRefCount = 0
        microphone?.stop()
        microphone = nil
      }
    }

    // Stop the camera if neither preview nor any other publisher needs it.
    let cameraStillUsed = previewRefCount > 0 || publishers.values.contains { $0.usesCamera }
    if !cameraStillUsed {
      cameraCapture?.stop()
      cameraCapture = nil
      NotificationCenter.default.post(
        name: MoQPublisherImpl.cameraSessionChangedNotification, object: nil)
    }

    emitPublisherState(sessionId: sessionId, state: "idle")
    if publishers.isEmpty {
      Self.configurePlaybackAudioSession()
    }

    // Tear down the publisher off the main thread — pub.stop() may block on
    // encoder flush. The Session is owned by MoQImpl and stays alive across
    // publish cycles, so we don't close it here.
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

  // Camera errors aren't bound to a particular publish session — they may
  // happen during preview before anyone called publish(). Broadcast the error
  // to every active publisher so each one transitions to the error state; if
  // none are active, drop it (the preview itself doesn't have a state surface).
  private func broadcastCameraError(_ error: Error) {
    let msg = "error:\(error.localizedDescription)"
    for sid in publishers.keys {
      emitPublisherState(sessionId: sid, state: msg)
    }
  }

  private func emitPublisherState(sessionId: String, state: String) {
    onEvent?("publisherStateChanged", ["sessionId": sessionId, "state": state])
  }

  private static func parsePosition(_ raw: String) -> CameraPosition {
    raw == "back" ? .back : .front
  }

  private static func trackStateString(_ state: PublishedTrackState) -> String {
    switch state {
    case .idle: return "idle"
    case .starting: return "starting"
    case .active: return "active"
    case .stopped: return "stopped"
    }
  }

  private struct PublishOpts {
    var cameraEnabled: Bool = true
    var micEnabled: Bool = true
    var videoCodec: VideoCodec = .h265
    var width: Int32 = 1280
    var height: Int32 = 720
    var framerate: Double = 30
    var audioCodec: MoQKit.AudioCodec = .opus
    var audioSampleRate: Double = 48_000
  }

  private static func parseOpts(_ json: String) -> PublishOpts {
    var opts = PublishOpts()
    guard
      let data = json.data(using: .utf8),
      let dict = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    else {
      // Default: H.265 if supported, else H.264 — same heuristic as MoQDemo.
      if !VideoEncoderConfig.supportedCodecs().contains(.h265) { opts.videoCodec = .h264 }
      return opts
    }
    if let v = dict["cameraEnabled"] as? Bool { opts.cameraEnabled = v }
    if let v = dict["micEnabled"] as? Bool { opts.micEnabled = v }
    if let v = dict["videoCodec"] as? String, let parsed = VideoCodec(rawValue: v) {
      opts.videoCodec = parsed
    } else if !VideoEncoderConfig.supportedCodecs().contains(.h265) {
      opts.videoCodec = .h264
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

  static func configurePublishingAudioSession() {
    let s = AVAudioSession.sharedInstance()
    try? s.setCategory(
      .playAndRecord, mode: .videoRecording,
      options: [.defaultToSpeaker, .allowBluetoothHFP])
    try? s.setActive(true)
  }

  static func configurePlaybackAudioSession() {
    let s = AVAudioSession.sharedInstance()
    try? s.setCategory(.playback, mode: .moviePlayback, options: [])
    try? s.setActive(true)
  }
}
