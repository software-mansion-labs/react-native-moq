import Foundation
import MoQKit

// Identifiers shared by the host and the Broadcast Upload Extension; both sides
// MUST agree on these (also documented in the README).
public enum MoQScreenBroadcastSharedKeys {
  // Host writes the JSON ReplayKitBroadcastConfiguration; extension reads it on launch.
  public static let configurationKey = "com.swmansion.moq.screenBroadcast.config"
  // Extension writes its state here: { "state": "...", "error": "..." }.
  public static let stateKey = "com.swmansion.moq.screenBroadcast.state"
  // Darwin notification posted when the state key changes, so the host avoids polling.
  public static let stateNotificationName = "com.swmansion.moq.screenBroadcast.stateChanged"
}

@objc public class ScreenBroadcastImpl: NSObject {
  @objc public static let shared = ScreenBroadcastImpl()
  private override init() {}

  @objc public var onEvent: ((_ name: String, _ body: [String: Any]) -> Void)?

  // Kept to read extension-written state and clear the descriptor on stop().
  private var appGroupIdentifier: String?
  private var darwinObserver: UnsafeMutableRawPointer?

  @objc(configureWithUrl:optsJson:)
  public func configure(url: String, optsJson: String) {
    Task { @MainActor in self._configure(url: url, optsJson: optsJson) }
  }

  @objc public func stop() {
    Task { @MainActor in self._stop() }
  }

  @MainActor
  private func _configure(url: String, optsJson: String) {
    let opts = Self.parseOpts(optsJson)
    guard let appGroup = opts.appGroupIdentifier else {
      emitState("error:appGroupIdentifier is required on iOS")
      return
    }
    guard !opts.path.isEmpty else {
      emitState("error:path is required")
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
      // Write both the standard descriptor and our full configuration override
      // (read by a SampleHandler that overrides makeReplayKitBroadcastConfiguration).
      let store = ReplayKitBroadcastDescriptorStore(appGroupIdentifier: appGroup)
      try store.save(descriptor)

      guard let defaults = UserDefaults(suiteName: appGroup) else {
        emitState("error:App Group \(appGroup) is not accessible to the host app")
        return
      }
      let encoded = try JSONEncoder().encode(configuration)
      defaults.set(encoded, forKey: MoQScreenBroadcastSharedKeys.configurationKey)

      setupStateObserver(appGroup: appGroup)
      appGroupIdentifier = appGroup

      emitCurrentState()
    } catch {
      emitState("error:\(error.localizedDescription)")
    }
  }

  @MainActor
  private func _stop() {
    // Can't stop a ReplayKit broadcast from the host; just clear the shared
    // descriptor so the next launch fails fast, and signal idle locally.
    if let appGroup = appGroupIdentifier,
      let defaults = UserDefaults(suiteName: appGroup)
    {
      defaults.removeObject(forKey: MoQScreenBroadcastSharedKeys.configurationKey)
      try? ReplayKitBroadcastDescriptorStore(appGroupIdentifier: appGroup).clear()
    }
    teardownStateObserver()
    appGroupIdentifier = nil
    emitState("idle")
  }

  @MainActor
  private func setupStateObserver(appGroup: String) {
    teardownStateObserver()

    // Darwin notifications carry no user info, so read state from App Group
    // UserDefaults when the extension fires this.
    let observer = Unmanaged.passUnretained(self).toOpaque()
    darwinObserver = observer
    CFNotificationCenterAddObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      observer,
      { _, observer, _, _, _ in
        guard let observer else { return }
        let impl = Unmanaged<ScreenBroadcastImpl>.fromOpaque(observer).takeUnretainedValue()
        Task { @MainActor in impl.emitCurrentState() }
      },
      MoQScreenBroadcastSharedKeys.stateNotificationName as CFString,
      nil,
      .deliverImmediately)
  }

  @MainActor
  private func teardownStateObserver() {
    guard let observer = darwinObserver else { return }
    CFNotificationCenterRemoveObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      observer,
      CFNotificationName(MoQScreenBroadcastSharedKeys.stateNotificationName as CFString),
      nil)
    darwinObserver = nil
  }

  @MainActor
  private func emitCurrentState() {
    guard
      let appGroup = appGroupIdentifier,
      let defaults = UserDefaults(suiteName: appGroup),
      let data = defaults.data(forKey: MoQScreenBroadcastSharedKeys.stateKey),
      let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let state = payload["state"] as? String
    else {
      emitState("idle")
      return
    }
    if let error = payload["error"] as? String, state == "error" {
      emitState("error:\(error)")
    } else {
      emitState(state)
    }
  }

  private func emitState(_ state: String) {
    onEvent?("screenBroadcastStateChanged", ["state": state])
  }

  private struct Opts {
    var path: String = ""
    var appGroupIdentifier: String?
    var appAudio: Bool = true
    var mic: Bool = true
    var videoCodec: VideoCodec = .h265
    // Placeholders; ReplayKitBroadcastPipeline overrides these with the device's
    // screen metrics at start time.
    var width: Int32 = 1920
    var height: Int32 = 1080
    var framerate: Double = 60
    var audioCodec: MoQKit.AudioCodec = .opus
    var audioSampleRate: Double = 48_000
  }

  private static func parseOpts(_ json: String) -> Opts {
    var opts = Opts()
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
}
