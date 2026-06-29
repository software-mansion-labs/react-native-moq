package com.moq

import android.os.Handler
import android.os.Looper
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.moq.player.PlayerHandle
import com.swmansion.moqkit.Session
import com.swmansion.moqkit.subscribe.Broadcast
import com.swmansion.moqkit.subscribe.Catalog
import com.swmansion.moqkit.subscribe.PlaybackStats
import com.swmansion.moqkit.subscribe.Player
import com.swmansion.moqkit.subscribe.StallStats
import com.swmansion.moqkit.subscribe.TrackSubscription
import java.time.Duration
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

private const val AUDIO_KEY_SUFFIX = "_audio"

class MoQModule(reactContext: ReactApplicationContext) : NativeMoQSpec(reactContext) {

  private val moduleScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
  private val mainHandler = Handler(Looper.getMainLooper())

  // Per-session state. Each useSession on the JS side corresponds to one
  // entry here; two sessions can subscribe / publish independently.
  private class SessionContext(val id: String, val session: Session) {
    var targetLatencyMs: Int = 200
    var state: Session.State = Session.State.Idle
    var stateJob: Job? = null
    val subscriptions = ConcurrentHashMap<String, MoQPrefixSubscription>()
    val prefixForPath = ConcurrentHashMap<String, String>()
    val catalogs = ConcurrentHashMap<String, Catalog>()
    // Live broadcasts per path so raw-track subscriptions (audio chunks, data
    // tracks) can call `subscribeTrack` after a broadcast appears.
    val broadcasts = ConcurrentHashMap<String, Broadcast>()
    // Raw-track sinks keyed by "path|track", ref-counted across JS subscribers.
    val trackSinks = ConcurrentHashMap<String, TrackSink>()
  }

  private val contexts = ConcurrentHashMap<String, SessionContext>()

  // MARK: - Companion: shared handle map and listeners for VideoView

  companion object {
    const val NAME = NativeMoQSpec.NAME

    // Connected sessions, exposed to PublisherModule so it can attach a
    // Publisher to one of them. Updated whenever the session reaches the
    // Connected state and cleared on disconnect/error.
    private val connectedSessions = ConcurrentHashMap<String, Session>()

    fun connectedSession(sessionId: String): Session? = connectedSessions[sessionId]

    // Player handles keyed by (sessionId, broadcastPath). Two sessions may
    // surface the same broadcastPath; they get distinct player handles.
    private fun playerKey(sessionId: String, broadcastPath: String) =
      "$sessionId $broadcastPath"

    val playerHandles = ConcurrentHashMap<String, PlayerHandle>()

    fun playerHandle(sessionId: String, broadcastPath: String): PlayerHandle? =
      playerHandles[playerKey(sessionId, broadcastPath)]

    fun setPlayerHandle(sessionId: String, broadcastPath: String, handle: PlayerHandle) {
      playerHandles[playerKey(sessionId, broadcastPath)] = handle
    }

    fun removePlayerHandle(sessionId: String, broadcastPath: String): PlayerHandle? =
      playerHandles.remove(playerKey(sessionId, broadcastPath))

    private val playerChangeListeners =
      ConcurrentHashMap<String, CopyOnWriteArrayList<() -> Unit>>()

    fun addPlayerListener(sessionId: String, broadcastPath: String, listener: () -> Unit) {
      playerChangeListeners.getOrPut(playerKey(sessionId, broadcastPath)) {
        CopyOnWriteArrayList()
      }.add(listener)
    }

    fun removePlayerListener(sessionId: String, broadcastPath: String, listener: () -> Unit) {
      playerChangeListeners[playerKey(sessionId, broadcastPath)]?.remove(listener)
    }

    fun notifyPlayerChanged(sessionId: String?, broadcastPath: String?) {
      if (sessionId == null && broadcastPath == null) {
        playerChangeListeners.values.forEach { list -> list.forEach { it() } }
      } else if (sessionId != null && broadcastPath == null) {
        // All players for this session changed (e.g. session unsubscribe-all).
        val prefix = "$sessionId "
        playerChangeListeners.forEach { (key, list) ->
          if (key.startsWith(prefix)) list.forEach { it() }
        }
      } else if (sessionId != null && broadcastPath != null) {
        playerChangeListeners[playerKey(sessionId, broadcastPath)]?.forEach { it() }
      }
    }

    fun Session.State.toStringValue(): String =
      when (this) {
        Session.State.Idle -> "idle"
        Session.State.Connecting -> "connecting"
        Session.State.Connected -> "connected"
        Session.State.Closed -> "closed"
        is Session.State.Error -> "error:${this.message}"
      }
  }

  // MARK: - NativeMoQSpec

  override fun addListener(eventName: String) {}

  override fun removeListeners(count: Double) {}

  override fun connect(sessionId: String, url: String, targetLatencyMs: Double) {
    val latencyMs = targetLatencyMs.toInt()
    contexts[sessionId]?.let { existing ->
      when (existing.state) {
        // The session terminated on its own (network drop, relay reset, a
        // publish that errored the connection). Its context lingers dead, so
        // without this a second connect() would no-op and the user could never
        // power the session back on. Tear it down and reconnect fresh.
        Session.State.Closed, is Session.State.Error -> disconnect(sessionId)
        // idle / connecting / connected — already live, leave it.
        else -> return
      }
    }
    moduleScope.launch {
      val s = Session(url = url, parentScope = moduleScope)
      val ctx = SessionContext(id = sessionId, session = s)
      ctx.targetLatencyMs = latencyMs
      contexts[sessionId] = ctx

      ctx.stateJob = launch {
        s.state.collect { state ->
          ctx.state = state
          if (state == Session.State.Connected) {
            connectedSessions[sessionId] = s
          } else {
            connectedSessions.remove(sessionId)
          }
          val map = Arguments.createMap()
          map.putString("sessionId", sessionId)
          map.putString("state", state.toStringValue())
          emitEvent("sessionStateChanged", map)
        }
      }

      try {
        s.connect()
      } catch (_: Exception) {}
    }
  }

  override fun disconnect(sessionId: String) {
    val ctx = contexts.remove(sessionId) ?: return
    ctx.stateJob?.cancel()
    ctx.stateJob = null
    connectedSessions.remove(sessionId)

    unsubscribeAll(ctx)
    ctx.session.close()
  }

  override fun subscribe(sessionId: String, prefix: String) {
    val ctx = contexts[sessionId] ?: return
    // Idempotent: a JS-side ref-count already ensures this call only fires
    // once per (session, prefix) going from 0 → 1 subscribers, but guard
    // anyway in case the relay had pending state.
    if (ctx.subscriptions.containsKey(prefix)) return

    val latencyMs = ctx.targetLatencyMs
    val s = ctx.session

    moduleScope.launch {
      val sub = try {
        s.subscribe(prefix = prefix)
      } catch (_: Exception) { return@launch }

      // Bail out if the user disconnected or already subscribed while we awaited.
      val currentCtx = contexts[sessionId]
      if (currentCtx == null || currentCtx.session !== s ||
        currentCtx.subscriptions.containsKey(prefix)
      ) {
        sub.close()
        return@launch
      }

      val ps = MoQPrefixSubscription(
        prefix = prefix,
        subscription = sub,
        scope = moduleScope,
        onBroadcastAvailable = { p, broadcast, catalog ->
          handleBroadcastAvailable(sessionId, p, broadcast, catalog, latencyMs)
        },
        onBroadcastUnavailable = { p, path ->
          handleBroadcastUnavailable(sessionId, p, path)
        },
      )
      currentCtx.subscriptions[prefix] = ps
      ps.start()
    }
  }

  override fun unsubscribe(sessionId: String, prefix: String) {
    val ctx = contexts[sessionId] ?: return
    val ps = ctx.subscriptions.remove(prefix) ?: return
    val paths = ps.cancel()

    // Tear down players for the paths this prefix owned.  We don't emit
    // broadcastUnavailable events here — the JS-side useBroadcasts already
    // cleared its local state synchronously when its ref count hit zero.
    for (path in paths) {
      if (ctx.prefixForPath[path] == prefix) {
        ctx.prefixForPath.remove(path)
        ctx.catalogs.remove(path)
        ctx.broadcasts.remove(path)
        removeTrackSinks(ctx, path)
        removePlayer(sessionId, path, notify = false)
        removePlayer(sessionId, path + AUDIO_KEY_SUFFIX, notify = false)
      }
    }
    mainHandler.post { notifyPlayerChanged(sessionId, null) }
  }

  private fun unsubscribeAll(ctx: SessionContext) {
    for (prefix in ctx.subscriptions.keys.toList()) {
      val ps = ctx.subscriptions.remove(prefix) ?: continue
      val paths = ps.cancel()
      for (path in paths) {
        if (ctx.prefixForPath[path] == prefix) {
          ctx.prefixForPath.remove(path)
          ctx.catalogs.remove(path)
          ctx.broadcasts.remove(path)
          removeTrackSinks(ctx, path)
          removePlayer(ctx.id, path, notify = false)
          removePlayer(ctx.id, path + AUDIO_KEY_SUFFIX, notify = false)
        }
      }
    }
    mainHandler.post { notifyPlayerChanged(ctx.id, null) }
  }

  override fun play(sessionId: String, broadcastPath: String) {
    val handle = playerHandle(sessionId, broadcastPath) ?: return
    handle.play()
    // `play()` builds moq-kit's playback pipeline; a VideoView surface that
    // arrived while it was still being built (or on a different thread —
    // `Player.playbackPipeline` isn't volatile) is dropped, so the video track
    // never starts even though audio plays. Re-deliver the surface now that the
    // pipeline exists. Posting to the main thread provides the happens-before
    // barrier so the surface push observes the freshly-built pipeline. (The
    // player-recreation path in handleBroadcastAvailable already does this.)
    mainHandler.post { notifyPlayerChanged(sessionId, broadcastPath) }
  }

  override fun pause(sessionId: String, broadcastPath: String) {
    playerHandle(sessionId, broadcastPath)?.pause()
  }

  override fun stopPlayer(sessionId: String, broadcastPath: String) {
    removePlayer(sessionId, broadcastPath)
  }

  override fun updateTargetLatency(sessionId: String, broadcastPath: String, ms: Double) {
    playerHandle(sessionId, broadcastPath)?.updateTargetLatency(ms.toInt())
  }

  override fun switchVideoTrack(sessionId: String, broadcastPath: String, trackName: String) {
    playerHandle(sessionId, broadcastPath)?.switchVideoTrack(trackName)
    // `switchTrack()` rebuilds moq-kit's video pipeline for the new rendition;
    // re-deliver the surface afterwards so the freshly-built pipeline sees it
    // (same non-volatile `Player.playbackPipeline` race the `play()` path guards
    // against). Posting to the main thread provides the happens-before barrier.
    mainHandler.post { notifyPlayerChanged(sessionId, broadcastPath) }
  }

  override fun switchAudioTrack(sessionId: String, broadcastPath: String, trackName: String) {
    playerHandle(sessionId, broadcastPath)?.switchAudioTrack(trackName)
  }

  override fun setVolume(sessionId: String, broadcastPath: String, volume: Double) {
    playerHandle(sessionId, broadcastPath)?.setVolume(volume.toFloat())
  }

  override fun createAudioOnlyPlayer(sessionId: String, broadcastPath: String) {
    val ctx = contexts[sessionId] ?: return
    val catalog = ctx.catalogs[broadcastPath] ?: return
    val audioTrackName = catalog.audioTracks.firstOrNull()?.name ?: return
    val audioKey = broadcastPath + AUDIO_KEY_SUFFIX

    // Run synchronously so `playerHandles[(sessionId, audioKey)]` is populated
    // before this call returns to JS — otherwise a follow-up `play(audioKey)`
    // from the hook's setup callback would no-op against an empty map.
    removePlayer(sessionId, audioKey, notify = false)

    val p = try {
      Player(
        catalog = catalog,
        videoTrackName = null,
        audioTrackName = audioTrackName,
        targetBuffering = Duration.ofMillis(ctx.targetLatencyMs.toLong()),
        parentScope = moduleScope,
      )
    } catch (_: Exception) { return }

    val handle = PlayerHandle(p, sessionId, audioKey, moduleScope, mainHandler)
    handle.onEvent = { name, map -> emitEvent(name, map) }
    setPlayerHandle(sessionId, audioKey, handle)
    handle.startObservingEvents()
  }

  override fun subscribeTrackObjects(
    sessionId: String, broadcastPath: String, trackName: String
  ) {
    val ctx = contexts[sessionId] ?: return
    val key = "$broadcastPath|$trackName"

    // Already streaming this track — share the one subscription.
    ctx.trackSinks[key]?.let {
      it.refCount.incrementAndGet()
      return
    }

    // The JS layer only subscribes for a broadcast it already saw become
    // available, so the broadcast should be present; if not, no-op.
    val broadcast = ctx.broadcasts[broadcastPath] ?: return
    val subscription = try {
      broadcast.subscribeTrack(trackName)
    } catch (_: Exception) {
      return
    }

    val sink = TrackSink(subscription)
    val prev = ctx.trackSinks.putIfAbsent(key, sink)
    if (prev != null) {
      // Lost a race with another subscribe — reuse the existing sink.
      prev.refCount.incrementAndGet()
      subscription.close()
      return
    }

    sink.job = moduleScope.launch {
      try {
        subscription.objects.collect { obj ->
          val map = Arguments.createMap()
          map.putString("sessionId", sessionId)
          map.putString("broadcastPath", broadcastPath)
          map.putString("trackName", trackName)
          map.putString("data", Base64.encodeToString(obj.payload, Base64.NO_WRAP))
          map.putDouble("groupSequence", obj.groupSequence.toDouble())
          map.putDouble("objectIndex", obj.objectIndex.toDouble())
          emitEvent("trackObject", map)
        }
      } catch (_: Exception) {
        // Stream ended or errored — close() handles teardown.
      }
    }
  }

  override fun unsubscribeTrackObjects(
    sessionId: String, broadcastPath: String, trackName: String
  ) {
    val ctx = contexts[sessionId] ?: return
    val key = "$broadcastPath|$trackName"
    val sink = ctx.trackSinks[key] ?: return
    if (sink.refCount.decrementAndGet() <= 0) {
      ctx.trackSinks.remove(key)
      sink.close()
    }
  }

  private fun removeTrackSinks(ctx: SessionContext, path: String) {
    val prefix = "$path|"
    for (key in ctx.trackSinks.keys.filter { it.startsWith(prefix) }) {
      ctx.trackSinks.remove(key)?.close()
    }
  }

  // Decoded-PCM audio (moq-kit AudioDataStream) is iOS-only for now; moq-kit has
  // no Android decoded-audio API yet. Throw so JS callers get a clear signal
  // rather than a silent stream that never delivers. The JS layer also guards on
  // Platform.OS, so this is a backstop.
  override fun subscribeAudioData(
    sessionId: String, broadcastPath: String, trackName: String, sampleFormat: String
  ) {
    throw UnsupportedOperationException(
      "Decoded audio chunks (PCM) are not supported on Android yet; use the " +
        "default encoded format instead."
    )
  }

  override fun unsubscribeAudioData(
    sessionId: String, broadcastPath: String, trackName: String, sampleFormat: String
  ) {
    // No-op: subscribeAudioData never succeeds on Android, so there is nothing
    // to tear down.
  }

  override fun invalidate() {
    super.invalidate()
    for (id in contexts.keys.toList()) disconnect(id)
    moduleScope.cancel()
  }

  // MARK: - Broadcast events

  private fun handleBroadcastAvailable(
    sessionId: String, prefix: String, broadcast: Broadcast, catalog: Catalog,
    targetLatencyMs: Int
  ) {
    val ctx = contexts[sessionId] ?: return
    val path = catalog.path

    ctx.catalogs[path] = catalog
    ctx.prefixForPath[path] = prefix
    ctx.broadcasts[path] = broadcast

    val hadPlayer = playerHandle(sessionId, path) != null
    removePlayer(sessionId, path, notify = false)

    val videoTrackName = catalog.videoTracks.firstOrNull()?.name
    val audioTrackName = catalog.audioTracks.firstOrNull()?.name

    val p = try {
      Player(
        catalog = catalog,
        videoTrackName = videoTrackName,
        audioTrackName = audioTrackName,
        targetBuffering = Duration.ofMillis(targetLatencyMs.toLong()),
        parentScope = moduleScope,
      )
    } catch (_: Exception) { null }

    if (p != null) {
      val handle = PlayerHandle(p, sessionId, path, moduleScope, mainHandler)
      handle.onEvent = { name, map -> emitEvent(name, map) }
      setPlayerHandle(sessionId, path, handle)
      handle.startObservingEvents()

      if (hadPlayer) {
        p.play()
      }

      // Re-create the audio-only player if one was previously active.
      val audioKey = path + AUDIO_KEY_SUFFIX
      if (playerHandle(sessionId, audioKey) != null) {
        createAudioOnlyPlayer(sessionId, path)
      }

      mainHandler.post { notifyPlayerChanged(sessionId, path) }
    }

    val videoArray = Arguments.createArray()
    catalog.videoTracks.forEach { track ->
      val item = Arguments.createMap()
      item.putString("name", track.name)
      item.putString("codec", track.config.codec)
      track.config.coded?.let { size ->
        item.putInt("width", size.width.toInt())
        item.putInt("height", size.height.toInt())
      }
      track.config.bitrate?.let { item.putDouble("bitrate", it.toDouble()) }
      track.config.framerate?.let { item.putDouble("framerate", it) }
      videoArray.pushMap(item)
    }
    val audioArray = Arguments.createArray()
    catalog.audioTracks.forEach { track ->
      val item = Arguments.createMap()
      item.putString("name", track.name)
      item.putString("codec", track.config.codec)
      item.putInt("sampleRate", track.config.sampleRate.toInt())
      item.putInt("channelCount", track.config.channelCount.toInt())
      track.config.bitrate?.let { item.putDouble("bitrate", it.toDouble()) }
      audioArray.pushMap(item)
    }
    val map = Arguments.createMap()
    map.putString("sessionId", sessionId)
    map.putString("prefix", prefix)
    map.putString("path", path)
    videoTrackName?.let { map.putString("initialVideoTrackName", it) }
    audioTrackName?.let { map.putString("initialAudioTrackName", it) }
    map.putArray("videoTracks", videoArray)
    map.putArray("audioTracks", audioArray)
    emitEvent("broadcastAvailable", map)
  }

  private fun handleBroadcastUnavailable(sessionId: String, prefix: String, path: String) {
    val ctx = contexts[sessionId] ?: return
    // If the prefix's subscription was already torn down (e.g. by unsubscribe)
    // we already handled cleanup; skip double-emit / double-tear-down.
    if (ctx.prefixForPath[path] != prefix) return

    removePlayer(sessionId, path)
    removePlayer(sessionId, path + AUDIO_KEY_SUFFIX, notify = false)
    ctx.catalogs.remove(path)
    ctx.prefixForPath.remove(path)
    ctx.broadcasts.remove(path)
    removeTrackSinks(ctx, path)
    val map = Arguments.createMap()
    map.putString("sessionId", sessionId)
    map.putString("prefix", prefix)
    map.putString("path", path)
    emitEvent("broadcastUnavailable", map)
  }

  private fun removePlayer(sessionId: String, path: String, notify: Boolean = true) {
    val handle = removePlayerHandle(sessionId, path) ?: return
    // Cancel the catalog job so it stops emitting events for this path.
    contexts[sessionId]?.let { ctx ->
      ctx.prefixForPath[path]?.let { owningPrefix ->
        ctx.subscriptions[owningPrefix]?.cancelCatalogJob(path)
      }
    }
    handle.close()
    if (notify) {
      mainHandler.post { notifyPlayerChanged(sessionId, path) }
    }
  }

  // MARK: - Helpers

  private fun emitEvent(name: String, params: WritableMap) {
    reactApplicationContext.emitDeviceEvent(name, params)
  }

  // Owns a single moq-kit TrackSubscription plus the coroutine draining its
  // object flow, ref-counted across JS subscribers to the same (path, track).
  private class TrackSink(private val subscription: TrackSubscription) {
    var job: Job? = null
    val refCount = AtomicInteger(1)

    fun close() {
      job?.cancel()
      job = null
      subscription.close()
    }
  }
}

// MARK: - PlaybackStats → WritableMap

fun PlaybackStats.toWritableMap(): WritableMap {
  val map = Arguments.createMap()
  videoLatency?.let { map.putDouble("videoLatencyMs", it.toMillisDouble()) }
  audioLatency?.let { map.putDouble("audioLatencyMs", it.toMillisDouble()) }
  videoBitrateKbps?.let { map.putDouble("videoBitrateKbps", it) }
  audioBitrateKbps?.let { map.putDouble("audioBitrateKbps", it) }
  videoFps?.let { map.putDouble("videoFps", it) }
  videoJitterBuffer?.let { map.putDouble("videoJitterBufferMs", it.toMillisDouble()) }
  audioRingBuffer?.let { map.putDouble("audioRingBufferMs", it.toMillisDouble()) }
  timeToFirst.videoFrame?.let { map.putDouble("timeToFirstVideoFrameMs", it.toMillisDouble()) }
  timeToFirst.audioFrame?.let { map.putDouble("timeToFirstAudioFrameMs", it.toMillisDouble()) }
  videoFramesDropped?.let { map.putDouble("videoFramesDropped", it.toDouble()) }
  audioFramesDropped?.let { map.putDouble("audioFramesDropped", it.toDouble()) }
  videoStalls?.let { map.putMap("videoStalls", it.toWritableMap()) }
  audioStalls?.let { map.putMap("audioStalls", it.toWritableMap()) }
  return map
}

private fun StallStats.toWritableMap(): WritableMap {
  val map = Arguments.createMap()
  map.putDouble("count", count.toDouble())
  map.putDouble("totalDurationMs", totalDuration.toMillisDouble())
  map.putDouble("rebufferingRatio", rebufferingRatio)
  return map
}

// MoQKit 0.2.0 reports timing as java.time.Duration instead of bare millisecond
// Doubles. The JS-facing stats payload stays in ms, so convert here.
private fun Duration.toMillisDouble(): Double = toNanos() / 1_000_000.0
