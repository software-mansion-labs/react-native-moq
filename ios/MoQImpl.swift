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
    playerRefs[broadcastPath]?.videoLayer
  }

  // MARK: - State (readable from any context)

  private(set) var currentState: SessionState = .idle

  // MARK: - Private

  private var session: Session?
  private var subscription: BroadcastSubscription?
  private var targetLatencyMs: UInt64 = 200

  private var playerRefs: [String: MoQPlayerRef] = [:]
  private var catalogTasks: [String: Task<Void, Never>] = [:]

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
    playerRefs[broadcastPath]?.play()
  }

  @objc(pause:)
  public func pause(broadcastPath: String) {
    playerRefs[broadcastPath]?.pause()
  }

  @objc(stopPlayer:)
  public func stopPlayer(broadcastPath: String) {
    Task { @MainActor in
      await self._removePlayer(for: broadcastPath)
    }
  }

  @objc(updateTargetLatency:ms:)
  public func updateTargetLatency(broadcastPath: String, ms: Int) {
    playerRefs[broadcastPath]?.updateTargetLatency(ms: ms)
  }

  @objc(switchVideoTrack:trackName:)
  public func switchVideoTrack(broadcastPath: String, trackName: String) {
    playerRefs[broadcastPath]?.switchVideoTrack(name: trackName)
  }

  @objc(switchAudioTrack:trackName:)
  public func switchAudioTrack(broadcastPath: String, trackName: String) {
    playerRefs[broadcastPath]?.switchAudioTrack(name: trackName)
  }

  // MARK: - JSI: called from MoQ.mm C++ getPlayer override

  @objc(playerRefForPath:)
  public func playerRef(for path: String) -> MoQPlayerRef? {
    playerRefs[path]
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
    let allRefs = playerRefs
    session = nil
    playerRefs = [:]

    for (path, _) in catalogTasks {
      catalogTasks[path]?.cancel()
    }
    catalogTasks = [:]

    NotificationCenter.default.post(name: MoQImpl.playerChangedNotification, object: nil)

    Task { @MainActor in
      for (_, ref) in allRefs { await ref.stopAll() }
      await s?.close()
    }
  }

  // MARK: - Private: broadcast events

  @MainActor
  private func _handleBroadcastAvailable(_ catalog: Catalog) async {
    let path = catalog.path

    let hadPlayer = playerRefs[path] != nil
    await _removePlayer(for: path, notifyVideoViews: false, cancelCatalogTask: false)

    let videoTrackName = catalog.videoTracks.first?.name
    let audioTrackName = catalog.audioTracks.first?.name

    let p = try? Player(
      catalog: catalog,
      videoTrackName: videoTrackName,
      audioTrackName: audioTrackName,
      targetBufferingMs: targetLatencyMs
    )
    if let p {
      let ref = MoQPlayerRef(player: p, broadcastPath: path, videoTrackName: videoTrackName, audioTrackName: audioTrackName)
      ref.onEvent = { [weak self] name, body in self?.onEvent?(name, body) }
      playerRefs[path] = ref
      NotificationCenter.default.post(
        name: MoQImpl.playerChangedNotification, object: path)
      ref.startObservingEvents()

      if hadPlayer {
        try? await p.play()
      }
    }

    var broadcastAvailableBody: [String: Any] = [
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
    ]
    if let name = videoTrackName { broadcastAvailableBody["initialVideoTrackName"] = name }
    if let name = audioTrackName { broadcastAvailableBody["initialAudioTrackName"] = name }
    onEvent?("broadcastAvailable", broadcastAvailableBody)
  }

  @MainActor
  private func _handleBroadcastUnavailable(path: String) async {
    await _removePlayer(for: path)
    onEvent?("broadcastUnavailable", ["path": path])
  }

  @MainActor
  private func _removePlayer(
    for path: String,
    notifyVideoViews: Bool = true,
    cancelCatalogTask: Bool = true
  ) async {
    if let ref = playerRefs.removeValue(forKey: path) {
      if cancelCatalogTask {
        catalogTasks.removeValue(forKey: path)?.cancel()
      }
      await ref.stopAll()
    }
    if notifyVideoViews {
      NotificationCenter.default.post(
        name: MoQImpl.playerChangedNotification, object: path)
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
