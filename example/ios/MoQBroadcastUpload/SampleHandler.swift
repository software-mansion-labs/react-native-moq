import Foundation
import MoQKit
import ReplayKit

// Shared identifiers with the host app's MoQPublisherImpl. Kept in lockstep
// with MoQScreenBroadcastSharedKeys (ios/MoQPublisherImpl.swift). The host
// writes the configuration here and we read it back; we write state to the
// state key and post a Darwin notification so the host can update its UI.
private enum SharedKeys {
  static let appGroupIdentifier = "group.moq.example.screenbroadcast"
  static let configurationKey = "com.swmansion.moq.screenBroadcast.config"
  static let stateKey = "com.swmansion.moq.screenBroadcast.state"
  static let stateNotificationName = "com.swmansion.moq.screenBroadcast.stateChanged"
}

// MoQKit-provided base handles the Session/Publisher lifecycle for us — we
// just need to surface the right configuration and report state changes back
// to the host app process.
class SampleHandler: MoQReplayKitBroadcastSampleHandler {
  override var replayKitAppGroupIdentifier: String? {
    SharedKeys.appGroupIdentifier
  }

  // Override the default lookup (descriptor-only) to read the full
  // ReplayKitBroadcastConfiguration that the host wrote to the App Group.
  // Falls back to the base implementation (setupInfo or descriptor store) if
  // our key isn't present.
  override func makeReplayKitBroadcastConfiguration(
    setupInfo: [String: NSObject]?
  ) throws -> ReplayKitBroadcastConfiguration {
    if let defaults = UserDefaults(suiteName: SharedKeys.appGroupIdentifier),
      let data = defaults.data(forKey: SharedKeys.configurationKey)
    {
      return try JSONDecoder().decode(ReplayKitBroadcastConfiguration.self, from: data)
    }
    return try super.makeReplayKitBroadcastConfiguration(setupInfo: setupInfo)
  }

  override func replayKitDidStartPublishing(
    configuration: ReplayKitBroadcastConfiguration
  ) {
    writeState(["state": "broadcasting"])
  }

  override func replayKitDidStopPublishing() {
    writeState(["state": "stopped"])
  }

  override func replayKitNSError(from error: Error) -> NSError {
    writeState(["state": "error", "error": error.localizedDescription])
    return super.replayKitNSError(from: error)
  }

  override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
    writeState(["state": "connecting"])
    super.broadcastStarted(withSetupInfo: setupInfo)
  }

  private func writeState(_ payload: [String: Any]) {
    guard let defaults = UserDefaults(suiteName: SharedKeys.appGroupIdentifier),
      let data = try? JSONSerialization.data(withJSONObject: payload)
    else { return }
    defaults.set(data, forKey: SharedKeys.stateKey)
    CFNotificationCenterPostNotification(
      CFNotificationCenterGetDarwinNotifyCenter(),
      CFNotificationName(SharedKeys.stateNotificationName as CFString),
      nil, nil, true)
  }
}
