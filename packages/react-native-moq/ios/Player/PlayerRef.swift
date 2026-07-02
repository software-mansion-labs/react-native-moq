import AVFoundation
import MoQKit

@objc public class PlayerRef: NSObject {
  let player: Player
  @objc public let sessionId: String
  @objc public let broadcastPath: String

  var currentVideoTrackName: String?
  var currentAudioTrackName: String?
  var pendingVideoTrackName: String?
  var pendingAudioTrackName: String?
  var eventsSubscription: PlayerEventSubscription?
  var statsTimer: Timer?
  var onEvent: ((String, [String: Any]) -> Void)?

  init(player: Player, sessionId: String, broadcastPath: String, videoTrackName: String? = nil, audioTrackName: String? = nil) {
    self.player = player
    self.sessionId = sessionId
    self.broadcastPath = broadcastPath
    self.currentVideoTrackName = videoTrackName
    self.currentAudioTrackName = audioTrackName
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
      player.updateTargetLatency(.milliseconds(ms))
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

  @objc(setVolume:)
  public func setVolume(_ volume: Float) {
    Task { @MainActor in
      self.player.setVolume(volume)
    }
  }

  // MARK: - Event observation

  // MoQKit 0.2.0's session-level events are folded onto the per-track
  // types usePlayer acts on; unknown types are ignored by JS.
  @MainActor
  func startObservingEvents() {
    eventsSubscription?.cancel()
    eventsSubscription = player.subscribeEvents { [weak self] event in
      guard let self = self else { return }
      let sid = self.sessionId
      let path = self.broadcastPath

      func emit(_ type: String, _ extra: [String: Any] = [:]) {
        var body: [String: Any] = ["sessionId": sid, "broadcastPath": path, "type": type]
        for (key, value) in extra { body[key] = value }
        self.onEvent?("playerEvent", body)
      }
      func trackFields(_ track: PlayerTrackEvent) -> [String: Any] {
        var fields: [String: Any] = ["trackKind": track.kind.rawValue]
        if let name = track.trackName { fields["trackName"] = name }
        return fields
      }

      switch event.type {
      case .playerInit:
        emit("playerInit")
      case .playerDestroy:
        emit("playerDestroy")
      case .playbackRequest:
        emit("playbackRequest")
      case .playbackStart(let playing):
        emit("playbackStart", trackFields(playing.track))
      case .playbackPause:
        emit("trackPaused")
      case .playbackResume:
        emit("trackPlaying")
      case .playbackEnd:
        self.stopStatsPolling()
        emit("allTracksStopped")
      case .trackSubscribeStart(let track):
        emit("trackSubscribeStart", trackFields(track))
      case .trackReady(let ready):
        emit("trackReady", trackFields(ready.track))
      case .trackPlaying(let playing):
        self.startStatsPolling()
        emit("trackPlaying", trackFields(playing.track))
      case .trackSubscribeError(let error), .decodeError(let error):
        var fields = trackFields(error.track)
        fields["message"] = error.message
        emit("error", fields)
      case .trackSubscribeEnd(let track):
        emit("trackStopped", trackFields(track))
      case .trackSelect(let selection):
        var fields: [String: Any] = ["trackKind": selection.kind.rawValue]
        if let name = selection.trackName { fields["trackName"] = name }
        emit("trackSelect", fields)
      case .trackSwitch(let track):
        var fields: [String: Any] = ["trackKind": track.kind.rawValue]
        switch track.kind {
        case .video:
          let name = track.trackName ?? self.pendingVideoTrackName ?? self.currentVideoTrackName
          if let name = name {
            fields["trackName"] = name
            self.currentVideoTrackName = name
          }
          self.pendingVideoTrackName = nil
        case .audio:
          let name = track.trackName ?? self.pendingAudioTrackName ?? self.currentAudioTrackName
          if let name = name {
            fields["trackName"] = name
            self.currentAudioTrackName = name
          }
          self.pendingAudioTrackName = nil
        @unknown default:
          break
        }
        emit("trackSwitched", fields)
      case .trackStallStart(let track):
        emit("trackStallStart", trackFields(track))
      case .trackStallEnd(let track):
        emit("trackStallEnd", trackFields(track))
      case .rebufferStart(let track):
        emit("rebufferStart", trackFields(track))
      case .rebufferEnd(let track):
        emit("rebufferEnd", trackFields(track))
      }
    }
  }

  // MARK: - Stats polling

  @MainActor
  func startStatsPolling() {
    guard statsTimer == nil else { return }
    let path = broadcastPath
    let sid = sessionId
    statsTimer = Timer.scheduledTimer(
      withTimeInterval: 0.5, repeats: true
    ) { [weak self] _ in
      Task { @MainActor in
        guard let self = self else { return }
        var dict = self.player.stats.asDictionary()
        dict["sessionId"] = sid
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
    eventsSubscription?.cancel(); eventsSubscription = nil
    statsTimer?.invalidate(); statsTimer = nil
    await player.stopAll()
  }
}
