import AVFoundation
import Foundation
import MoQKit

@objc public class MoQImpl: NSObject {
  // MARK: - Singleton

  @objc public static let shared = MoQImpl()
  private override init() {}

  // MARK: - Event callback (set by MoQ.mm, called on main actor)

  @objc public var onEvent: ((_ name: String, _ body: [String: Any]) -> Void)?

  // MARK: - Video layer notification

  static let playerChangedNotification = Notification.Name("MoQImpl.playerChanged")

  @MainActor @objc public func videoLayer(for broadcastPath: String) -> AVSampleBufferDisplayLayer? {
    players[broadcastPath]?.videoLayer
  }

  // MARK: - State (readable from any context)

  private(set) var currentState: SessionState = .idle

  // MARK: - Private

  private var session: Session?
  private var subscription: BroadcastSubscription?
  private var targetLatencyMs: UInt64 = 200

  private var players: [String: Player] = [:]
  private var broadcastCatalogs: [String: Catalog] = [:]
  private var pendingVideoTrackName: [String: String] = [:]
  private var pendingAudioTrackName: [String: String] = [:]
  private var playerEventsTasks: [String: Task<Void, Never>] = [:]
  private var catalogTasks: [String: Task<Void, Never>] = [:]
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

  @objc(switchVideoTrack:trackName:)
  public func switchVideoTrack(broadcastPath: String, trackName: String) {
    Task { @MainActor in
      guard let player = self.players[broadcastPath] else { return }
      self.pendingVideoTrackName[broadcastPath] = trackName
      try? await player.switchTrack(to: trackName)
    }
  }

  @objc(switchAudioTrack:trackName:)
  public func switchAudioTrack(broadcastPath: String, trackName: String) {
    Task { @MainActor in
      guard let player = self.players[broadcastPath] else { return }
      self.pendingAudioTrackName[broadcastPath] = trackName
      try? await player.switchAudioTrack(to: trackName)
    }
  }

  // MARK: - Private: connect / disconnect

  @MainActor
  private func _connect(url: String, prefix: String, targetLatencyMs: UInt64) {
    guard session == nil else { return }
    self.targetLatencyMs = targetLatencyMs

    let s = Session(url: url)
    session = s

    stateTask = Task { @MainActor in
      for await state in s.state {
        self.currentState = state
        self.onEvent?("sessionStateChanged", ["state": state.stringValue])
      }
    }

    Task { @MainActor in
      try? await s.connect()
      guard let sub = try? await s.subscribe(prefix: prefix) else { return }
      self.subscription = sub
      self.broadcastsTask = Task { @MainActor in
        for await broadcast in sub.broadcasts {
          let path = broadcast.path
          self.catalogTasks[path] = Task { @MainActor in
            for await catalog in broadcast.catalogs() {
              await self._handleBroadcastAvailable(catalog)
            }
            await self._handleBroadcastUnavailable(path: path)
          }
        }
      }
    }
  }

  @MainActor
  private func _disconnect() {
    stateTask?.cancel(); stateTask = nil
    broadcastsTask?.cancel(); broadcastsTask = nil
    subscription?.cancel(); subscription = nil
    currentState = .idle

    let s = session
    let allPlayers = players
    session = nil
    players = [:]
    broadcastCatalogs = [:]
    pendingVideoTrackName = [:]
    pendingAudioTrackName = [:]

    for (path, _) in playerEventsTasks {
      playerEventsTasks[path]?.cancel()
    }
    playerEventsTasks = [:]

    for (path, _) in catalogTasks {
      catalogTasks[path]?.cancel()
    }
    catalogTasks = [:]

    for (_, timer) in statsTimers { timer.invalidate() }
    statsTimers = [:]

    NotificationCenter.default.post(name: MoQImpl.playerChangedNotification, object: nil)

    Task {
      for (_, p) in allPlayers { await p.stopAll() }
      await s?.close()
    }
  }

  // MARK: - Private: broadcast events

  @MainActor
  private func _handleBroadcastAvailable(_ catalog: Catalog) async {
    let path = catalog.path

    if players[path] == nil {
      await _removePlayer(for: path, notifyVideoViews: false)
      broadcastCatalogs[path] = catalog

      let sortedVideo = catalog.videoTracks.sorted {
        let a = $0.config.coded.map { UInt64($0.width) * UInt64($0.height) } ?? 0
        let b = $1.config.coded.map { UInt64($0.width) * UInt64($0.height) } ?? 0
        return a > b
      }
      let videoTrackName = sortedVideo.first?.name
      let audioTrackName = catalog.audioTracks.first?.name

      let p = try? Player(
        catalog: catalog,
        videoTrackName: videoTrackName,
        audioTrackName: audioTrackName,
        targetBufferingMs: targetLatencyMs
      )
      if let p {
        players[path] = p
        NotificationCenter.default.post(
          name: MoQImpl.playerChangedNotification, object: path)
        _observePlayerEvents(p.events, broadcastPath: path)
      }
    } else {
      broadcastCatalogs[path] = catalog
    }

    onEvent?("broadcastAvailable", [
      "path": path,
      "videoTracks": catalog.videoTracks.map { t -> [String: Any] in
        var d: [String: Any] = ["name": t.name, "codec": t.config.codec]
        if let size = t.config.coded {
          d["width"] = size.width
          d["height"] = size.height
        }
        if let bitrate = t.config.bitrate { d["bitrate"] = bitrate }
        if let fps = t.config.framerate { d["framerate"] = fps }
        return d
      },
      "audioTracks": catalog.audioTracks.map { t -> [String: Any] in
        var d: [String: Any] = [
          "name": t.name,
          "codec": t.config.codec,
          "sampleRate": t.config.sampleRate,
          "channelCount": t.config.channelCount,
        ]
        if let bitrate = t.config.bitrate { d["bitrate"] = bitrate }
        return d
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
      broadcastCatalogs.removeValue(forKey: path)
      pendingVideoTrackName.removeValue(forKey: path)
      pendingAudioTrackName.removeValue(forKey: path)
      playerEventsTasks.removeValue(forKey: path)?.cancel()
      catalogTasks.removeValue(forKey: path)?.cancel()
      _stopStatsPolling(for: path)
      await p.stopAll()
    }
    if notifyVideoViews {
      NotificationCenter.default.post(
        name: MoQImpl.playerChangedNotification, object: path)
    }
  }

  // MARK: - Private: player events

  @MainActor
  private func _observePlayerEvents(
    _ events: AsyncStream<PlayerEvent>, broadcastPath: String
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
          var body: [String: Any] = [
            "broadcastPath": broadcastPath, "type": "trackSwitched",
            "trackKind": kind.rawValue,
          ]
          switch kind {
          case .video:
            if let name = self.pendingVideoTrackName.removeValue(forKey: broadcastPath) {
              body["trackName"] = name
            }
          case .audio:
            if let name = self.pendingAudioTrackName.removeValue(forKey: broadcastPath) {
              body["trackName"] = name
            }
          @unknown default:
            break
          }
          self.onEvent?("playerEvent", body)
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

// MARK: - SessionState helpers

extension SessionState {
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
