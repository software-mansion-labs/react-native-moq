import AVFoundation
import Foundation
import MoQKit

@objc public class MoqImpl: NSObject {
  // MARK: - Singleton

  @objc public static let shared = MoqImpl()
  private override init() {}

  // MARK: - Event callback (set by Moq.mm, called on main actor)

  @objc public var onEvent: ((_ name: String, _ body: [String: Any]) -> Void)?

  // MARK: - Video layer notification

  static let playerChangedNotification = Notification.Name("MoqImpl.playerChanged")

  @MainActor @objc public func videoLayer(for broadcastPath: String) -> AVSampleBufferDisplayLayer? {
    players[broadcastPath]?.videoLayer
  }

  // MARK: - State (readable from any context)

  private(set) var currentState: MoQSessionState = .idle

  // MARK: - Private

  private var session: MoQSession?
  private var targetLatencyMs: UInt64 = 200

  private var players: [String: MoQPlayer] = [:]
  private var playerEventsTasks: [String: Task<Void, Never>] = [:]
  private var statsTimers: [String: Timer] = [:]

  private var stateTask: Task<Void, Never>?
  private var broadcastsTask: Task<Void, Never>?

  // MARK: - Public API

  @objc(connect:prefix:targetLatencyMs:)
  public func connect(url: String, prefix: String, targetLatencyMs: Int) {
    Task { @MainActor in self._connect(url: url, prefix: prefix, targetLatencyMs: UInt64(targetLatencyMs)) }
  }

  @objc public func disconnect() {
    Task { @MainActor in self._disconnect() }
  }

  @objc(play:)
  public func play(broadcastPath: String) {
    Task { @MainActor in
      try? await self.players[broadcastPath]?.play()
    }
  }

  @objc(pause:)
  public func pause(broadcastPath: String) {
    Task { @MainActor in
      await self.players[broadcastPath]?.pause()
    }
  }

  @objc(stopPlayer:)
  public func stopPlayer(broadcastPath: String) {
    Task { @MainActor in
      await self._removePlayer(for: broadcastPath)
    }
  }

  @objc(updateTargetLatency:ms:)
  public func updateTargetLatency(broadcastPath: String, ms: Int) {
    Task { @MainActor in
      self.players[broadcastPath]?.updateTargetLatency(ms: UInt64(ms))
    }
  }

  // MARK: - Private: connect / disconnect

  @MainActor
  private func _connect(url: String, prefix: String, targetLatencyMs: UInt64) {
    guard session == nil else { return }
    self.targetLatencyMs = targetLatencyMs

    let s = MoQSession(url: url, prefix: prefix)
    session = s

    stateTask = Task { @MainActor in
      for await state in s.state {
        self.currentState = state
        self.onEvent?("sessionStateChanged", ["state": state.stringValue])
      }
    }

    broadcastsTask = Task { @MainActor in
      for await event in s.broadcasts {
        switch event {
        case .available(let info): await self._handleBroadcastAvailable(info)
        case .unavailable(let path): await self._handleBroadcastUnavailable(path: path)
        }
      }
    }

    Task { try? await s.connect() }
  }

  @MainActor
  private func _disconnect() {
    stateTask?.cancel(); stateTask = nil
    broadcastsTask?.cancel(); broadcastsTask = nil
    currentState = .idle

    let s = session
    let allPlayers = players
    session = nil
    players = [:]

    for (path, _) in playerEventsTasks {
      playerEventsTasks[path]?.cancel()
    }
    playerEventsTasks = [:]

    for (_, timer) in statsTimers { timer.invalidate() }
    statsTimers = [:]

    NotificationCenter.default.post(name: MoqImpl.playerChangedNotification, object: nil)

    Task {
      for (_, p) in allPlayers { await p.stopAll() }
      await s?.close()
    }
  }

  // MARK: - Private: broadcast events

  @MainActor
  private func _handleBroadcastAvailable(_ info: MoQBroadcastInfo) async {
    let path = info.path
    await _removePlayer(for: path, notifyVideoViews: false)

    var tracks: [any MoQTrackInfo] = []
    if let v = info.videoTracks.first { tracks.append(v) }
    if let a = info.audioTracks.first { tracks.append(a) }

    let p = try? MoQPlayer(tracks: tracks, targetBufferingMs: targetLatencyMs)
    if let p {
      players[path] = p
      NotificationCenter.default.post(
        name: MoqImpl.playerChangedNotification, object: path)
      _observePlayerEvents(p.events, broadcastPath: path)
    }

    onEvent?("broadcastAvailable", [
      "path": path,
      "videoTracks": info.videoTracks.map {
        ["name": $0.name, "codec": $0.config.codec] as [String: Any]
      },
      "audioTracks": info.audioTracks.map {
        ["name": $0.name, "codec": $0.config.codec, "sampleRate": $0.config.sampleRate]
          as [String: Any]
      },
    ])
  }

  @MainActor
  private func _handleBroadcastUnavailable(path: String) async {
    await _removePlayer(for: path)
    onEvent?("broadcastUnavailable", ["path": path])
  }

  @MainActor
  private func _removePlayer(for path: String, notifyVideoViews: Bool = true) async {
    if let p = players.removeValue(forKey: path) {
      playerEventsTasks.removeValue(forKey: path)?.cancel()
      _stopStatsPolling(for: path)
      await p.stopAll()
    }
    if notifyVideoViews {
      NotificationCenter.default.post(
        name: MoqImpl.playerChangedNotification, object: path)
    }
  }

  // MARK: - Private: player events

  @MainActor
  private func _observePlayerEvents(
    _ events: AsyncStream<MoQPlayerEvent>, broadcastPath: String
  ) {
    playerEventsTasks[broadcastPath]?.cancel()
    playerEventsTasks[broadcastPath] = Task { @MainActor in
      for await event in events {
        switch event {
        case .trackPlaying(let kind):
          self._startStatsPolling(for: broadcastPath)
          self.onEvent?("playerEvent", [
            "broadcastPath": broadcastPath, "type": "trackPlaying",
            "trackKind": kind.rawValue,
          ])
        case .trackPaused(let kind):
          self.onEvent?("playerEvent", [
            "broadcastPath": broadcastPath, "type": "trackPaused",
            "trackKind": kind.rawValue,
          ])
        case .trackStopped(let kind):
          self.onEvent?("playerEvent", [
            "broadcastPath": broadcastPath, "type": "trackStopped",
            "trackKind": kind.rawValue,
          ])
        case .allTracksStopped:
          self._stopStatsPolling(for: broadcastPath)
          self.onEvent?("playerEvent", [
            "broadcastPath": broadcastPath, "type": "allTracksStopped",
          ])
        case .error(let kind, let message):
          self.onEvent?("playerEvent", [
            "broadcastPath": broadcastPath, "type": "error",
            "trackKind": kind.rawValue, "message": message,
          ])
        case .trackSwitched(let kind):
          self.onEvent?("playerEvent", [
            "broadcastPath": broadcastPath, "type": "trackSwitched",
            "trackKind": kind.rawValue,
          ])
        }
      }
    }
  }

  // MARK: - Private: stats polling

  @MainActor
  private func _startStatsPolling(for broadcastPath: String) {
    guard statsTimers[broadcastPath] == nil else { return }
    statsTimers[broadcastPath] = Timer.scheduledTimer(
      withTimeInterval: 0.5, repeats: true
    ) { [players, onEvent] _ in
      Task { @MainActor [players, onEvent] in
        guard let stats = players[broadcastPath]?.stats else { return }
        var dict = stats.asDictionary()
        dict["broadcastPath"] = broadcastPath
        onEvent?("playbackStatsUpdated", dict)
      }
    }
  }

  @MainActor
  private func _stopStatsPolling(for broadcastPath: String) {
    statsTimers.removeValue(forKey: broadcastPath)?.invalidate()
  }
}

// MARK: - MoQSessionState helpers

extension MoQSessionState {
  var stringValue: String {
    switch self {
    case .idle: return "idle"
    case .connecting: return "connecting"
    case .connected: return "connected"
    case .closed: return "closed"
    case .error(let message): return "error:\(message)"
    }
  }

  init(stringValue: String) {
    if stringValue.hasPrefix("error:") {
      self = .error(String(stringValue.dropFirst(6)))
    } else {
      switch stringValue {
      case "connecting": self = .connecting
      case "connected": self = .connected
      case "closed": self = .closed
      default: self = .idle
      }
    }
  }
}

// MARK: - PlaybackStats → Dictionary

extension PlaybackStats {
  func asDictionary() -> [String: Any] {
    var d: [String: Any] = [:]
    if let v = videoLatencyMs { d["videoLatencyMs"] = v }
    if let v = audioLatencyMs { d["audioLatencyMs"] = v }
    if let v = videoBitrateKbps { d["videoBitrateKbps"] = v }
    if let v = audioBitrateKbps { d["audioBitrateKbps"] = v }
    if let v = videoFps { d["videoFps"] = v }
    if let v = videoJitterBufferMs { d["videoJitterBufferMs"] = v }
    if let v = audioRingBufferMs { d["audioRingBufferMs"] = v }
    if let v = timeToFirstVideoFrameMs { d["timeToFirstVideoFrameMs"] = v }
    if let v = timeToFirstAudioFrameMs { d["timeToFirstAudioFrameMs"] = v }
    if let v = videoFramesDropped { d["videoFramesDropped"] = Double(v) }
    if let v = audioFramesDropped { d["audioFramesDropped"] = Double(v) }
    if let s = videoStalls {
      d["videoStalls"] = [
        "count": Double(s.count), "totalDurationMs": s.totalDurationMs,
        "rebufferingRatio": s.rebufferingRatio,
      ]
    }
    if let s = audioStalls {
      d["audioStalls"] = [
        "count": Double(s.count), "totalDurationMs": s.totalDurationMs,
        "rebufferingRatio": s.rebufferingRatio,
      ]
    }
    return d
  }
}
