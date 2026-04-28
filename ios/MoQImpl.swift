import AVFoundation
import Foundation
import MoQKit

@objc public class MoQImpl: NSObject {
  // MARK: - Singleton

  @objc public static let shared = MoQImpl()
  private override init() {}

  // MARK: - Event callback

  @objc public var onEvent: ((_ name: String, _ body: [String: Any]) -> Void)?

  // MARK: - Video layer lookup (called by MoQVideoView on main thread)

  @MainActor @objc public func videoLayer(forHandleId handleId: Int) -> AVSampleBufferDisplayLayer? {
    playerLock.withLock { playerById[handleId]?.videoLayer }
  }

  // MARK: - State

  private(set) var currentState: SessionState = .idle

  // MARK: - Private: catalogs (lock-protected — written from @MainActor tasks, read from JS thread)

  private let catalogLock = NSLock()
  private var catalogByPath: [String: Catalog] = [:]

  // MARK: - Private: player registry (lock-protected — written from JS thread, read from main thread)

  private let playerLock = NSLock()
  private var playerById: [Int: Player] = [:]
  private var pathById: [Int: String] = [:]
  private var nextId: Int = 1

  // MARK: - Private: observation tasks (JS-thread-only, tasks never access these dicts)

  private var eventTasks: [Int: Task<Void, Never>] = [:]
  private var statsTasks: [Int: Task<Void, Never>] = [:]

  // MARK: - Private: session (@MainActor)

  private var session: Session?
  private var subscription: BroadcastSubscription?
  private var targetLatencyMs: UInt64 = 200
  private var stateTask: Task<Void, Never>?
  private var broadcastsTask: Task<Void, Never>?
  private var catalogTasks: [String: Task<Void, Never>] = [:]

  // MARK: - Public API

  @objc(connect:prefix:targetLatencyMs:)
  public func connect(url: String, prefix: String, targetLatencyMs: Int) {
    Task { @MainActor in self._connect(url: url, prefix: prefix, targetLatencyMs: UInt64(targetLatencyMs)) }
  }

  @objc public func disconnect() {
    Task { @MainActor in self._disconnect() }
  }

  /// Returns a non-zero handle on success, or 0 if the catalog is not yet available.
  @MainActor @objc(createPlayer:)
  public func createPlayer(broadcastPath: String) -> Int {
    let catalog = catalogLock.withLock { catalogByPath[broadcastPath] }

    guard let catalog,
          let player = try? Player(
            catalog: catalog,
            videoTrackName: catalog.videoTracks.first?.name,
            audioTrackName: catalog.audioTracks.first?.name,
            targetBufferingMs: targetLatencyMs
          ) else { return 0 }

    let id = playerLock.withLock { () -> Int in
      let id = nextId; nextId += 1
      playerById[id] = player
      pathById[id] = broadcastPath
      return id
    }

    eventTasks[id] = Task.detached { [weak self] in
      for await event in await player.events { self?.handlePlayerEvent(event, handleId: id) }
    }

    return id
  }

  @objc(releasePlayer:)
  public func releasePlayer(handleId: Int) {
    eventTasks.removeValue(forKey: handleId)?.cancel()
    statsTasks.removeValue(forKey: handleId)?.cancel()

    let player = playerLock.withLock { () -> Player? in
      let p = playerById.removeValue(forKey: handleId)
      pathById.removeValue(forKey: handleId)
      return p
    }

    Task { await player?.stopAll() }
  }

  @objc(play:)
  public func play(handleId: Int) {
    let p = playerLock.withLock { playerById[handleId] }
    Task { try? await p?.play() }
  }

  @objc(pause:)
  public func pause(handleId: Int) {
    let p = playerLock.withLock { playerById[handleId] }
    Task { await p?.pause() }
  }

  @MainActor @objc(updateTargetLatency:ms:)
  public func updateTargetLatency(handleId: Int, ms: Int) {
    let p = playerLock.withLock { playerById[handleId] }
    p?.updateTargetLatency(ms: UInt64(ms))
  }

  @objc(switchVideoTrack:trackName:)
  public func switchVideoTrack(handleId: Int, trackName: String) {
    let p = playerLock.withLock { playerById[handleId] }
    guard let p else { return }
    Task { try? await p.switchTrack(to: trackName) }
    onEvent?("playerEvent", ["handleId": handleId, "type": "trackSwitched", "trackKind": "video", "trackName": trackName])
  }

  @objc(switchAudioTrack:trackName:)
  public func switchAudioTrack(handleId: Int, trackName: String) {
    let p = playerLock.withLock { playerById[handleId] }
    guard let p else { return }
    Task { try? await p.switchAudioTrack(to: trackName) }
    onEvent?("playerEvent", ["handleId": handleId, "type": "trackSwitched", "trackKind": "audio", "trackName": trackName])
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
              self._handleBroadcastAvailable(catalog)
            }
            self._handleBroadcastUnavailable(path: path)
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

    let s = session; session = nil

    for (_, t) in catalogTasks { t.cancel() }
    catalogTasks = [:]

    catalogLock.withLock { catalogByPath = [:] }

    let allPlayers = playerLock.withLock { () -> [Int: Player] in
      let all = playerById; playerById = [:]; pathById = [:]
      return all
    }

    for (id, _) in allPlayers {
      eventTasks.removeValue(forKey: id)?.cancel()
      statsTasks.removeValue(forKey: id)?.cancel()
    }

    Task {
      for (_, p) in allPlayers { await p.stopAll() }
      await s?.close()
    }
  }

  // MARK: - Private: broadcast events

  @MainActor
  private func _handleBroadcastAvailable(_ catalog: Catalog) {
    let path = catalog.path
    catalogLock.withLock { catalogByPath[path] = catalog }

    // Release any players built from an older catalog of this path.
    let stale = playerLock.withLock { pathById.filter { $0.value == path }.map { $0.key } }
    stale.forEach { releasePlayer(handleId: $0) }

    onEvent?("broadcastAvailable", [
      "path": path,
      "videoTracks": catalog.videoTracks.map { t -> [String: Any] in
        var d: [String: Any] = ["name": t.name, "codec": t.config.codec]
        if let size = t.config.coded { d["width"] = size.width; d["height"] = size.height }
        if let b = t.config.bitrate { d["bitrate"] = b }
        if let f = t.config.framerate { d["framerate"] = f }
        return d
      },
      "audioTracks": catalog.audioTracks.map { t -> [String: Any] in
        var d: [String: Any] = [
          "name": t.name, "codec": t.config.codec,
          "sampleRate": t.config.sampleRate, "channelCount": t.config.channelCount,
        ]
        if let b = t.config.bitrate { d["bitrate"] = b }
        return d
      },
    ])
  }

  @MainActor
  private func _handleBroadcastUnavailable(path: String) {
    _ = catalogLock.withLock { catalogByPath.removeValue(forKey: path) }
    catalogTasks.removeValue(forKey: path)?.cancel()

    let handles = playerLock.withLock { pathById.filter { $0.value == path }.map { $0.key } }
    handles.forEach { releasePlayer(handleId: $0) }

    onEvent?("broadcastUnavailable", ["path": path])
  }

  // MARK: - Private: player event handling

  private func handlePlayerEvent(_ event: PlayerEvent, handleId: Int) {
    switch event {
    case .trackPlaying(let kind):
      startStatsTask(handleId: handleId)
      onEvent?("playerEvent", ["handleId": handleId, "type": "trackPlaying", "trackKind": kind.rawValue])
    case .trackPaused(let kind):
      onEvent?("playerEvent", ["handleId": handleId, "type": "trackPaused", "trackKind": kind.rawValue])
    case .trackStopped(let kind):
      onEvent?("playerEvent", ["handleId": handleId, "type": "trackStopped", "trackKind": kind.rawValue])
    case .allTracksStopped:
      statsTasks.removeValue(forKey: handleId)?.cancel()
      onEvent?("playerEvent", ["handleId": handleId, "type": "allTracksStopped"])
    case .error(let kind, let message):
      onEvent?("playerEvent", ["handleId": handleId, "type": "error", "trackKind": kind.rawValue, "message": message])
    case .trackSwitched:
      break // emitted eagerly from switchVideoTrack / switchAudioTrack
    }
  }

  // MARK: - Private: stats task

  private func startStatsTask(handleId: Int) {
    guard statsTasks[handleId] == nil else { return }
    statsTasks[handleId] = Task.detached { [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(nanoseconds: 500_000_000)
        guard let self else { break }
        let p = self.playerLock.withLock { self.playerById[handleId] }
        guard let stats = p?.stats else { continue }
        var dict = stats.asDictionary()
        dict["handleId"] = handleId
        self.onEvent?("playbackStatsUpdated", dict)
      }
    }
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
      d["videoStalls"] = ["count": Double(s.count), "totalDurationMs": s.totalDurationMs, "rebufferingRatio": s.rebufferingRatio]
    }
    if let s = audioStalls {
      d["audioStalls"] = ["count": Double(s.count), "totalDurationMs": s.totalDurationMs, "rebufferingRatio": s.rebufferingRatio]
    }
    return d
  }
}
