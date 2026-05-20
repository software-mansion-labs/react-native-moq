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

  private var session: Session?
  private var publisher: Publisher?
  private var microphone: MicrophoneCapture?

  private var sessionStateTask: Task<Void, Never>?
  private var publisherStateTask: Task<Void, Never>?
  private var publisherEventsTask: Task<Void, Never>?
  private var trackStateTasks: [Task<Void, Never>] = []

  // True while publish() is in flight, even before session reaches .connected.
  private var publishing: Bool = false

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

  @objc(publish:path:optsJson:)
  public func publish(url: String, path: String, optsJson: String) {
    let opts = Self.parseOpts(optsJson)
    Task { @MainActor in
      await self._publish(url: url, path: path, opts: opts)
    }
  }

  @objc public func stop() {
    Task { @MainActor in await self._stop() }
  }

  @objc(configureScreenBroadcast:optsJson:)
  public func configureScreenBroadcast(url: String, optsJson: String) {
    Task { @MainActor in self._configureScreenBroadcast(url: url, optsJson: optsJson) }
  }

  @objc public func stopScreenBroadcast() {
    Task { @MainActor in self._stopScreenBroadcast() }
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
      emitPublisherState("error:\(error.localizedDescription)")
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
      emitPublisherState("error:\(error.localizedDescription)")
    }
  }

  // MARK: - Publish

  @MainActor
  private func _publish(url: String, path: String, opts: PublishOpts) async {
    guard !publishing else { return }
    publishing = true

    Self.configurePublishingAudioSession()

    let s = Session(url: url)
    session = s

    sessionStateTask = Task { @MainActor in
      for await state in s.state {
        switch state {
        case .idle: self.emitPublisherState("idle")
        case .connecting: self.emitPublisherState("connecting")
        case .connected: break  // wait for publisher state to drive UI
        case .closed: self.emitPublisherState("stopped")
        case .error(let e): self.emitPublisherState("error:\(e.description)")
        }
      }
    }

    do {
      try await s.connect()

      let pub = try Publisher()
      publisher = pub

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
        let mic = MicrophoneCapture()
        microphone = mic
        try await mic.start()
        let audioConfig = AudioEncoderConfig(
          codec: opts.audioCodec,
          sampleRate: opts.audioSampleRate
        )
        tracks.append(pub.addAudioTrack(name: "mic", source: mic, config: audioConfig))
      }

      try await s.publish(path: path, publisher: pub)
      try await pub.start()

      observePublisher(pub, tracks: tracks)
    } catch {
      emitPublisherState("error:\(error.localizedDescription)")
      await _stop()
    }
  }

  @MainActor
  private func observePublisher(_ pub: Publisher, tracks: [PublishedTrack]) {
    publisherStateTask = Task { @MainActor in
      for await state in pub.state {
        switch state {
        case .idle: break
        case .publishing: self.emitPublisherState("publishing")
        case .stopped: self.emitPublisherState("stopped")
        case .error(let msg): self.emitPublisherState("error:\(msg)")
        }
      }
    }

    publisherEventsTask = Task { @MainActor in
      for await event in pub.events {
        switch event {
        case .trackStarted(let name):
          self.onEvent?("publisherTrackStateChanged", ["name": name, "state": "active"])
        case .trackStopped(let name):
          self.onEvent?("publisherTrackStateChanged", ["name": name, "state": "stopped"])
        case .error(let name, let msg):
          self.onEvent?(
            "publisherTrackStateChanged",
            ["name": name, "state": "stopped", "error": msg])
        }
      }
    }

    for track in tracks {
      let name = track.name
      let task = Task { @MainActor in
        for await state in track.state {
          self.onEvent?(
            "publisherTrackStateChanged",
            ["name": name, "state": Self.trackStateString(state)])
        }
      }
      trackStateTasks.append(task)
    }
  }

  @MainActor
  private func _stop() async {
    let wasPublishing = publishing
    publishing = false

    sessionStateTask?.cancel(); sessionStateTask = nil
    publisherStateTask?.cancel(); publisherStateTask = nil
    publisherEventsTask?.cancel(); publisherEventsTask = nil
    trackStateTasks.forEach { $0.cancel() }
    trackStateTasks.removeAll()

    let pub = publisher
    let sess = session
    publisher = nil
    session = nil

    microphone?.stop()
    microphone = nil

    // Stop the camera if the preview view is no longer mounted.
    if previewRefCount == 0 {
      cameraCapture?.stop()
      cameraCapture = nil
      NotificationCenter.default.post(
        name: MoQPublisherImpl.cameraSessionChangedNotification, object: nil)
    }

    if wasPublishing { emitPublisherState("idle") }
    Self.configurePlaybackAudioSession()

    // Tear down publisher/session off the main thread — pub.stop() may block
    // on encoder flush.
    Task.detached {
      pub?.stop()
      await sess?.close()
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

  private func emitPublisherState(_ state: String) {
    onEvent?("publisherStateChanged", ["state": state])
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
