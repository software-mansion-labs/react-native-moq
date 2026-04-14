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

  @objc @MainActor public var videoLayer: AVSampleBufferDisplayLayer? {
    player?.videoLayer
  }

  // MARK: - State (readable from any context)

  private(set) var currentState: MoQSessionState = .idle

  // MARK: - Private

  private var session: MoQSession?
  private var player: MoQPlayer?
  private var targetLatencyMs: UInt64 = 200

  private var stateTask: Task<Void, Never>?
  private var broadcastsTask: Task<Void, Never>?
  private var playerEventsTask: Task<Void, Never>?
  private var statsTimer: Timer?

  // MARK: - Public API

  @objc(connect:prefix:)
  public func connect(url: String, prefix: String) {
    Task { @MainActor in self._connect(url: url, prefix: prefix) }
  }

  @objc public func disconnect() {
    Task { @MainActor in self._disconnect() }
  }

  @objc public func play() {
    Task { @MainActor in
      try? await self.player?.play()
    }
  }

  @objc public func pause() {
    Task { @MainActor in
      await self.player?.pause()
    }
  }

  @objc public func stopAll() {
    Task { @MainActor in
      await self.player?.stopAll()
    }
  }

  @objc(updateTargetLatencyMs:)
  public func updateTargetLatency(ms: Int) {
    targetLatencyMs = UInt64(ms)
    Task { @MainActor in
      self.player?.updateTargetLatency(ms: UInt64(ms))
    }
  }

  // MARK: - Private: connect / disconnect

  @MainActor
  private func _connect(url: String, prefix: String) {
    guard session == nil else { return }

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
    playerEventsTask?.cancel(); playerEventsTask = nil
    _stopStatsPolling()
    currentState = .idle

    let s = session
    let p = player
    session = nil
    player = nil
    NotificationCenter.default.post(name: MoqImpl.playerChangedNotification, object: self)

    Task {
      await p?.stopAll()
      await s?.close()
    }
  }

  // MARK: - Private: broadcast events

  @MainActor
  private func _handleBroadcastAvailable(_ info: MoQBroadcastInfo) async {
    if let existing = player {
      await existing.stopAll()
      player = nil
      _stopStatsPolling()
    }

    var tracks: [any MoQTrackInfo] = []
    if let v = info.videoTracks.first { tracks.append(v) }
    if let a = info.audioTracks.first { tracks.append(a) }

    let p = try? MoQPlayer(tracks: tracks, targetBufferingMs: targetLatencyMs)
    player = p
    NotificationCenter.default.post(name: MoqImpl.playerChangedNotification, object: self)

    if let p {
      _observePlayerEvents(p.events)
      try? await p.play()
    }

    onEvent?("broadcastAvailable", [
      "path": info.path,
      "videoTracks": info.videoTracks.map { ["name": $0.name, "codec": $0.config.codec] as [String: Any] },
      "audioTracks": info.audioTracks.map {
        ["name": $0.name, "codec": $0.config.codec, "sampleRate": $0.config.sampleRate] as [String: Any]
      },
    ])
  }

  @MainActor
  private func _handleBroadcastUnavailable(path: String) async {
    await player?.stopAll()
    player = nil
    _stopStatsPolling()
    NotificationCenter.default.post(name: MoqImpl.playerChangedNotification, object: self)
    onEvent?("broadcastUnavailable", ["path": path])
  }

  // MARK: - Private: player events

  @MainActor
  private func _observePlayerEvents(_ events: AsyncStream<MoQPlayerEvent>) {
    playerEventsTask?.cancel()
    playerEventsTask = Task { @MainActor in
      for await event in events {
        switch event {
        case .trackPlaying(let kind):
          self._startStatsPolling()
          self.onEvent?("playerEvent", ["type": "trackPlaying", "trackKind": kind.rawValue])
        case .trackPaused(let kind):
          self.onEvent?("playerEvent", ["type": "trackPaused", "trackKind": kind.rawValue])
        case .trackStopped(let kind):
          self.onEvent?("playerEvent", ["type": "trackStopped", "trackKind": kind.rawValue])
        case .allTracksStopped:
          self._stopStatsPolling()
          self.onEvent?("playerEvent", ["type": "allTracksStopped"])
        case .error(let kind, let message):
          self.onEvent?("playerEvent", [
            "type": "error", "trackKind": kind.rawValue, "message": message,
          ])
        case .trackSwitched(let kind):
          self.onEvent?("playerEvent", ["type": "trackSwitched", "trackKind": kind.rawValue])
        }
      }
    }
  }

  // MARK: - Private: stats polling

  @MainActor
  private func _startStatsPolling() {
    guard statsTimer == nil else { return }
    statsTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
      Task { @MainActor [weak self] in
        guard let self, let stats = self.player?.stats else { return }
        self.onEvent?("playbackStatsUpdated", stats.asDictionary())
      }
    }
  }

  @MainActor
  private func _stopStatsPolling() {
    statsTimer?.invalidate()
    statsTimer = nil
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
