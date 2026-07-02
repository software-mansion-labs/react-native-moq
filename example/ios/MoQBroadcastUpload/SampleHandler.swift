import Foundation
import MoQKit
import ReplayKit

// Shared identifiers, kept in lockstep with MoQScreenBroadcastSharedKeys
// (ios/ScreenBroadcast/ScreenBroadcastImpl.swift). Host writes config; we read
// it and write state back, posting a Darwin notification so the host can update.
private enum SharedKeys {
  static let appGroupIdentifier = "group.moq.example.screenbroadcast"
  static let configurationKey = "com.swmansion.moq.screenBroadcast.config"
  static let stateKey = "com.swmansion.moq.screenBroadcast.state"
  static let stateNotificationName = "com.swmansion.moq.screenBroadcast.stateChanged"
}

// The MoQKit base handles the Session/Publisher lifecycle; we only supply
// configuration and report state changes back to the host process.
class SampleHandler: MoQReplayKitBroadcastSampleHandler {
  override var replayKitAppGroupIdentifier: String? {
    SharedKeys.appGroupIdentifier
  }

  // Read the full ReplayKitBroadcastConfiguration the host wrote to the App
  // Group, falling back to the base implementation if our key isn't present.
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
