import AVFoundation
import Foundation
import MoQKit

private let audioKeySuffix = "_audio"

@objc public class MoQImpl: NSObject {
  // MARK: - Singleton

  @objc public static let shared = MoQImpl()
  private override init() {}

  // MARK: - Event callback (set by MoQ.mm, called on main actor)

  @objc public var onEvent: ((_ name: String, _ body: [String: Any]) -> Void)?

  // MARK: - Video layer notification

  // userInfo carries the (sessionId, broadcastPath) pair so VideoView can
  // tell whether it's the one whose layer just changed. A nil object means
  // "every player went away for one session" (sent on disconnect).
  static let playerChangedNotification = Notification.Name("MoQImpl.playerChanged")
  static let playerChangedSessionIdKey = "sessionId"
  static let playerChangedBroadcastPathKey = "broadcastPath"

  @MainActor @objc public func videoLayer(forSessionId sessionId: String, broadcastPath: String) -> AVSampleBufferDisplayLayer? {
    contexts[sessionId]?.playerRefs[broadcastPath]?.videoLayer
  }

  // Exposed for PublisherImpl, which reuses the host session instead of
  // opening its own. nil until the JS `useSession` for this id has called
  // connect() and the relay has accepted the session.
  @MainActor public func currentSession(forSessionId sessionId: String) -> Session? {
    guard let ctx = contexts[sessionId], case .connected = ctx.state else {
      return nil
    }
    return ctx.session
  }

  // MARK: - Private state

  // Per-session context. Each useSession on the JS side corresponds to one of
  // these. Two sessions can coexist (subscribe + publish to the same relay,
  // talk to two different relays, etc.) so all state below is partitioned by
  // sessionId.
  private final class SessionContext {
    let id: String
    let session: Session
    var targetLatencyMs: UInt64 = 200
    var state: SessionState = .idle

    var stateTask: Task<Void, Never>?
    var subscriptions: [String: MoQPrefixSubscription] = [:]
    var prefixForPath: [String: String] = [:]
    var playerRefs: [String: PlayerRef] = [:]
    var catalogs: [String: Catalog] = [:]

    init(id: String, session: Session) {
      self.id = id
      self.session = session
    }
  }

  private var contexts: [String: SessionContext] = [:]

  // MARK: - Objc bridge

  @objc(connectWithSessionId:url:targetLatencyMs:)
  public func connect(sessionId: String, url: String, targetLatencyMs: Int) {
    Task { @MainActor in
      self._connect(
        sessionId: sessionId, url: url, targetLatencyMs: UInt64(targetLatencyMs))
    }
  }

  @objc(disconnectWithSessionId:)
  public func disconnect(sessionId: String) {
    Task { @MainActor in self._disconnect(sessionId: sessionId) }
  }

  @objc(subscribeWithSessionId:prefix:)
  public func subscribe(sessionId: String, prefix: String) {
    Task { @MainActor in self._subscribe(sessionId: sessionId, prefix: prefix) }
  }

  @objc(unsubscribeWithSessionId:prefix:)
  public func unsubscribe(sessionId: String, prefix: String) {
    Task { @MainActor in await self._unsubscribe(sessionId: sessionId, prefix: prefix) }
  }

  // All control methods route through MainActor so they observe writes from
  // _handleBroadcastAvailable / _createAudioOnlyPlayer in submission order.
  // Without this, a follow-up play(audioKey) right after createAudioOnlyPlayer
  // would race the create Task and find an empty playerRefs map.

  @objc(playWithSessionId:broadcastPath:)
  public func play(sessionId: String, broadcastPath: String) {
    Task { @MainActor in self.contexts[sessionId]?.playerRefs[broadcastPath]?.play() }
  }

  @objc(pauseWithSessionId:broadcastPath:)
  public func pause(sessionId: String, broadcastPath: String) {
    Task { @MainActor in self.contexts[sessionId]?.playerRefs[broadcastPath]?.pause() }
  }

  @objc(stopPlayerWithSessionId:broadcastPath:)
  public func stopPlayer(sessionId: String, broadcastPath: String) {
    Task { @MainActor in
      await self._removePlayer(sessionId: sessionId, path: broadcastPath)
    }
  }

  @objc(updateTargetLatencyWithSessionId:broadcastPath:ms:)
  public func updateTargetLatency(sessionId: String, broadcastPath: String, ms: Int) {
    Task { @MainActor in
      self.contexts[sessionId]?.playerRefs[broadcastPath]?.updateTargetLatency(ms: ms)
    }
  }

  @objc(switchVideoTrackWithSessionId:broadcastPath:trackName:)
  public func switchVideoTrack(sessionId: String, broadcastPath: String, trackName: String) {
    Task { @MainActor in
      self.contexts[sessionId]?.playerRefs[broadcastPath]?.switchVideoTrack(name: trackName)
    }
  }

  @objc(switchAudioTrackWithSessionId:broadcastPath:trackName:)
  public func switchAudioTrack(sessionId: String, broadcastPath: String, trackName: String) {
    Task { @MainActor in
      self.contexts[sessionId]?.playerRefs[broadcastPath]?.switchAudioTrack(name: trackName)
    }
  }

  @objc(setVolumeWithSessionId:broadcastPath:volume:)
  public func setVolume(sessionId: String, broadcastPath: String, volume: Float) {
    Task { @MainActor in
      self.contexts[sessionId]?.playerRefs[broadcastPath]?.setVolume(volume)
    }
  }

  @objc(createAudioOnlyPlayerWithSessionId:broadcastPath:)
  public func createAudioOnlyPlayer(sessionId: String, broadcastPath: String) {
    Task { @MainActor in
      await self._createAudioOnlyPlayer(sessionId: sessionId, broadcastPath: broadcastPath)
    }
  }

  // MARK: - JSI: called from MoQ.mm C++ getPlayer override

  @objc(playerRefForSessionId:broadcastPath:)
  public func playerRef(forSessionId sessionId: String, broadcastPath: String) -> PlayerRef? {
    contexts[sessionId]?.playerRefs[broadcastPath]
  }

  // MARK: - Private: connect / disconnect

  @MainActor
  private func _connect(sessionId: String, url: String, targetLatencyMs: UInt64) {
    guard contexts[sessionId] == nil else { return }

    let s = Session(url: url)
    let ctx = SessionContext(id: sessionId, session: s)
    ctx.targetLatencyMs = targetLatencyMs
    contexts[sessionId] = ctx

    ctx.stateTask = Task { @MainActor in
      for await state in s.state {
        guard let ctx = self.contexts[sessionId] else { break }
        ctx.state = state
        self.onEvent?(
          "sessionStateChanged",
          ["sessionId": sessionId, "state": state.stringValue])
      }
    }

    Task { @MainActor in
      try? await s.connect()
    }
  }

  @MainActor
  private func _subscribe(sessionId: String, prefix: String) {
    guard let ctx = contexts[sessionId] else { return }
    // Idempotent: a JS-side ref-count already ensures this call only fires
    // once per (session, prefix) going from 0 → 1 subscribers, but guard
    // anyway in case the relay had pending state.
    if ctx.subscriptions[prefix] != nil { return }

    let s = ctx.session
    Task { @MainActor in
      guard let sub = try? await s.subscribe(prefix: prefix) else { return }
      // Bail out if the user disconnected or already subscribed while we awaited.
      guard let ctx = self.contexts[sessionId], ctx.session === s,
        ctx.subscriptions[prefix] == nil
      else {
        sub.cancel()
        return
      }
      let ps = MoQPrefixSubscription(
        prefix: prefix,
        subscription: sub,
        onBroadcastAvailable: { [weak self] prefix, catalog in
          await self?._handleBroadcastAvailable(
            sessionId: sessionId, prefix: prefix, catalog: catalog)
        },
        onBroadcastUnavailable: { [weak self] prefix, path in
          await self?._handleBroadcastUnavailable(
            sessionId: sessionId, prefix: prefix, path: path)
        }
      )
      ctx.subscriptions[prefix] = ps
      ps.start()
    }
  }

  @MainActor
  private func _unsubscribe(sessionId: String, prefix: String) async {
    guard let ctx = contexts[sessionId],
      let ps = ctx.subscriptions.removeValue(forKey: prefix)
    else { return }
    let paths = ps.cancel()

    // Tear down players for the paths this prefix owned.  We don't emit
    // broadcastUnavailable events here — the JS-side useBroadcasts already
    // cleared its local state synchronously when its ref count hit zero.
    for path in paths where ctx.prefixForPath[path] == prefix {
      ctx.prefixForPath.removeValue(forKey: path)
      ctx.catalogs.removeValue(forKey: path)
      await _removePlayer(sessionId: sessionId, path: path, cancelCatalogTask: false)
      await _removePlayer(
        sessionId: sessionId, path: path + audioKeySuffix,
        notifyVideoViews: false, cancelCatalogTask: false)
    }
  }

  @MainActor
  private func _unsubscribeAll(sessionId: String) async {
    guard let ctx = contexts[sessionId] else { return }
    for prefix in Array(ctx.subscriptions.keys) {
      await _unsubscribe(sessionId: sessionId, prefix: prefix)
    }
  }

  @MainActor
  private func _disconnect(sessionId: String) {
    guard let ctx = contexts[sessionId] else { return }
    ctx.stateTask?.cancel(); ctx.stateTask = nil
    ctx.state = .idle

    let s = ctx.session
    contexts.removeValue(forKey: sessionId)

    Task { @MainActor in
      // Unsubscribe needs the context to still exist; recreate a minimal one
      // briefly so the existing unsubscribe path can tear subscriptions down.
      let temp = SessionContext(id: sessionId, session: s)
      temp.subscriptions = ctx.subscriptions
      temp.prefixForPath = ctx.prefixForPath
      temp.playerRefs = ctx.playerRefs
      temp.catalogs = ctx.catalogs
      self.contexts[sessionId] = temp
      await self._unsubscribeAll(sessionId: sessionId)
      self.contexts.removeValue(forKey: sessionId)
      await s.close()
    }
  }

  // MARK: - Private: broadcast events

  @MainActor
  private func _handleBroadcastAvailable(
    sessionId: String, prefix: String, catalog: Catalog
  ) async {
    guard let ctx = contexts[sessionId] else { return }
    let path = catalog.path

    ctx.catalogs[path] = catalog
    ctx.prefixForPath[path] = prefix

    let hadPlayer = ctx.playerRefs[path] != nil
    await _removePlayer(
      sessionId: sessionId, path: path, notifyVideoViews: false,
      cancelCatalogTask: false)

    let videoTrackName = catalog.videoTracks.first?.name
    let audioTrackName = catalog.audioTracks.first?.name

    let p = try? Player(
      catalog: catalog,
      videoTrackName: videoTrackName,
      audioTrackName: audioTrackName,
      targetBufferingMs: ctx.targetLatencyMs
    )
    if let p {
      let ref = PlayerRef(
        player: p, sessionId: sessionId, broadcastPath: path,
        videoTrackName: videoTrackName, audioTrackName: audioTrackName)
      ref.onEvent = { [weak self] name, body in self?.onEvent?(name, body) }
      ctx.playerRefs[path] = ref
      postPlayerChanged(sessionId: sessionId, broadcastPath: path)
      ref.startObservingEvents()

      if hadPlayer {
        try? await p.play()
      }

      // Re-create the audio-only player if one was previously active.
      let audioKey = path + audioKeySuffix
      if ctx.playerRefs[audioKey] != nil {
        await _createAudioOnlyPlayer(sessionId: sessionId, broadcastPath: path)
      }
    }

    var broadcastAvailableBody: [String: Any] = [
      "sessionId": sessionId,
      "prefix": prefix,
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
  private func _handleBroadcastUnavailable(
    sessionId: String, prefix: String, path: String
  ) async {
    guard let ctx = contexts[sessionId] else { return }
    // If the prefix's subscription was already torn down (e.g. by _unsubscribe)
    // the catalog task may still call into here once after cancellation.  Skip
    // double-emit / double-tear-down.
    guard ctx.prefixForPath[path] == prefix else { return }

    await _removePlayer(sessionId: sessionId, path: path)
    await _removePlayer(
      sessionId: sessionId, path: path + audioKeySuffix,
      notifyVideoViews: false, cancelCatalogTask: false)
    ctx.catalogs.removeValue(forKey: path)
    ctx.prefixForPath.removeValue(forKey: path)
    onEvent?(
      "broadcastUnavailable",
      ["sessionId": sessionId, "prefix": prefix, "path": path])
  }

  @MainActor
  private func _createAudioOnlyPlayer(sessionId: String, broadcastPath: String) async {
    guard let ctx = contexts[sessionId],
      let catalog = ctx.catalogs[broadcastPath],
      let audioTrackName = catalog.audioTracks.first?.name
    else { return }

    let audioKey = broadcastPath + audioKeySuffix
    await _removePlayer(
      sessionId: sessionId, path: audioKey, notifyVideoViews: false,
      cancelCatalogTask: false)

    let p = try? Player(
      catalog: catalog,
      videoTrackName: nil,
      audioTrackName: audioTrackName,
      targetBufferingMs: ctx.targetLatencyMs
    )
    if let p {
      let ref = PlayerRef(
        player: p, sessionId: sessionId, broadcastPath: audioKey,
        videoTrackName: nil, audioTrackName: audioTrackName)
      ref.onEvent = { [weak self] name, body in self?.onEvent?(name, body) }
      ctx.playerRefs[audioKey] = ref
      ref.startObservingEvents()
    }
  }

  @MainActor
  private func _removePlayer(
    sessionId: String,
    path: String,
    notifyVideoViews: Bool = true,
    cancelCatalogTask: Bool = true
  ) async {
    guard let ctx = contexts[sessionId] else { return }
    if let ref = ctx.playerRefs.removeValue(forKey: path) {
      if cancelCatalogTask, let owningPrefix = ctx.prefixForPath[path] {
        ctx.subscriptions[owningPrefix]?.cancelCatalogTask(for: path)
      }
      await ref.stopAll()
    }
    if notifyVideoViews {
      postPlayerChanged(sessionId: sessionId, broadcastPath: path)
    }
  }

  private func postPlayerChanged(sessionId: String, broadcastPath: String?) {
    var userInfo: [String: Any] = [Self.playerChangedSessionIdKey: sessionId]
    if let path = broadcastPath {
      userInfo[Self.playerChangedBroadcastPathKey] = path
    }
    NotificationCenter.default.post(
      name: MoQImpl.playerChangedNotification, object: nil, userInfo: userInfo)
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
    case .error(let error): return "error:\(error.description)"
    }
  }

  init(stringValue: String) {
    if stringValue.hasPrefix("error:") {
      self = .error(.connectionFailed(String(stringValue.dropFirst(6))))
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
