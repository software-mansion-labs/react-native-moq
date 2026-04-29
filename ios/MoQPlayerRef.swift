import AVFoundation
import MoQKit

@objc public class MoQPlayerRef: NSObject {
  let player: Player
  @objc public let broadcastPath: String

  var pendingVideoTrackName: String?
  var pendingAudioTrackName: String?
  var eventsTask: Task<Void, Never>?
  var statsTimer: Timer?
  var onEvent: ((String, [String: Any]) -> Void)?

  init(player: Player, broadcastPath: String) {
    self.player = player
    self.broadcastPath = broadcastPath
  }

  @MainActor var videoLayer: AVSampleBufferDisplayLayer? { player.videoLayer }

  // MARK: - Playback controls (called from C++ / ObjC)

  @objc public func play() {
    Task { @MainActor in try? await self.player.play() }
  }

  @objc public func pause() {
    Task { @MainActor in await self.player.pause() }
  }

  @objc public func stop() {
    Task { @MainActor in await self.stopAll() }
  }

  @objc(updateTargetLatencyMs:)
  public func updateTargetLatency(ms: Int) {
    Task { @MainActor in
      player.updateTargetLatency(ms: UInt64(ms))
    }
  }

  @objc(switchVideoTrackName:)
  public func switchVideoTrack(name: String) {
    Task { @MainActor in
      self.pendingVideoTrackName = name
      try? await self.player.switchTrack(to: name)
    }
  }

  @objc(switchAudioTrackName:)
  public func switchAudioTrack(name: String) {
    Task { @MainActor in
      self.pendingAudioTrackName = name
      try? await self.player.switchAudioTrack(to: name)
    }
  }

  // MARK: - Event observation

  @MainActor
  func startObservingEvents() {
    eventsTask?.cancel()
    eventsTask = Task { @MainActor in
      for await event in self.player.events {
        switch event {
        case .trackPlaying(let kind):
          self.startStatsPolling()
          self.onEvent?("playerEvent", [
            "broadcastPath": self.broadcastPath, "type": "trackPlaying",
            "trackKind": kind.rawValue,
          ])
        case .trackPaused(let kind):
          self.onEvent?("playerEvent", [
            "broadcastPath": self.broadcastPath, "type": "trackPaused",
            "trackKind": kind.rawValue,
          ])
        case .trackStopped(let kind):
          self.onEvent?("playerEvent", [
            "broadcastPath": self.broadcastPath, "type": "trackStopped",
            "trackKind": kind.rawValue,
          ])
        case .allTracksStopped:
          self.stopStatsPolling()
          self.onEvent?("playerEvent", [
            "broadcastPath": self.broadcastPath, "type": "allTracksStopped",
          ])
        case .error(let kind, let message):
          self.onEvent?("playerEvent", [
            "broadcastPath": self.broadcastPath, "type": "error",
            "trackKind": kind.rawValue, "message": message,
          ])
        case .trackSwitched(let kind):
          var body: [String: Any] = [
            "broadcastPath": self.broadcastPath, "type": "trackSwitched",
            "trackKind": kind.rawValue,
          ]
          switch kind {
          case .video:
            if let name = self.pendingVideoTrackName {
              body["trackName"] = name
              self.pendingVideoTrackName = nil
            }
          case .audio:
            if let name = self.pendingAudioTrackName {
              body["trackName"] = name
              self.pendingAudioTrackName = nil
            }
          @unknown default:
            break
          }
          self.onEvent?("playerEvent", body)
        }
      }
    }
  }

  // MARK: - Stats polling

  @MainActor
  func startStatsPolling() {
    guard statsTimer == nil else { return }
    let path = broadcastPath
    statsTimer = Timer.scheduledTimer(
      withTimeInterval: 0.5, repeats: true
    ) { [weak self] _ in
      Task { @MainActor in
        guard let self = self else { return }
        var dict = self.player.stats.asDictionary()
        dict["broadcastPath"] = path
        self.onEvent?("playbackStatsUpdated", dict)
      }
    }
  }

  @MainActor
  func stopStatsPolling() {
    statsTimer?.invalidate()
    statsTimer = nil
  }

  // MARK: - Full stop (awaitable, called on MainActor)

  @MainActor
  func stopAll() async {
    eventsTask?.cancel(); eventsTask = nil
    statsTimer?.invalidate(); statsTimer = nil
    await player.stopAll()
  }
}
