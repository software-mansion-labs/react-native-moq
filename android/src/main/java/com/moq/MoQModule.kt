package com.moq

import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.swmansion.moqkit.Session
import com.swmansion.moqkit.subscribe.Catalog
import com.swmansion.moqkit.subscribe.PlaybackStats
import com.swmansion.moqkit.subscribe.Player
import com.swmansion.moqkit.subscribe.StallStats
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
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

  private var session: Session? = null
  private var stateJob: Job? = null

  private var targetLatencyMs: Int = 200
  private val catalogs = ConcurrentHashMap<String, Catalog>()

  // One MoQPrefixSubscription per active prefix.  JS-side ref-counting in
  // useBroadcasts ensures that calls to subscribe/unsubscribe are balanced.
  private val subscriptions = ConcurrentHashMap<String, MoQPrefixSubscription>()
  // path → prefix that introduced it.  Players are still keyed by path; when
  // the owning prefix's subscription tears down we tear down the player too.
  // Overlapping prefixes that match the same broadcast are not supported and
  // give last-writer-wins on player ownership.
  private val prefixForPath = ConcurrentHashMap<String, String>()

  // MARK: - Companion: shared handle map and listeners for MoQVideoView

  companion object {
    const val NAME = NativeMoQSpec.NAME

    val playerHandles = ConcurrentHashMap<String, MoQPlayerHandle>()
    private val playerChangeListeners =
      ConcurrentHashMap<String, CopyOnWriteArrayList<() -> Unit>>()

    fun addPlayerListener(broadcastPath: String, listener: () -> Unit) {
      playerChangeListeners.getOrPut(broadcastPath) { CopyOnWriteArrayList() }.add(listener)
    }

    fun removePlayerListener(broadcastPath: String, listener: () -> Unit) {
      playerChangeListeners[broadcastPath]?.remove(listener)
    }

    fun notifyPlayerChanged(broadcastPath: String?) {
      if (broadcastPath == null) {
        playerChangeListeners.values.forEach { list -> list.forEach { it() } }
      } else {
        playerChangeListeners[broadcastPath]?.forEach { it() }
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

  override fun connect(url: String, targetLatencyMs: Double) {
    val latencyMs = targetLatencyMs.toInt()
    this.targetLatencyMs = latencyMs
    if (session != null) return
    moduleScope.launch {
      val s = Session(url = url, parentScope = moduleScope)
      session = s

      stateJob = launch {
        s.state.collect { state ->
          val map = Arguments.createMap()
          map.putString("state", state.toStringValue())
          emitEvent("sessionStateChanged", map)
        }
      }

      try {
        s.connect()
      } catch (_: Exception) {}
    }
  }

  override fun disconnect() {
    stateJob?.cancel()
    stateJob = null
    unsubscribeAll()

    val s = session
    session = null

    s?.close()
  }

  override fun subscribe(prefix: String) {
    val s = session ?: return
    // Idempotent: a JS-side ref-count already ensures this call only fires
    // once per prefix going from 0 → 1 subscribers, but guard anyway in case
    // the relay had pending state.
    if (subscriptions.containsKey(prefix)) return

    val latencyMs = targetLatencyMs

    moduleScope.launch {
      val sub = try {
        s.subscribe(prefix = prefix)
      } catch (_: Exception) { return@launch }

      // Bail out if the user disconnected or already subscribed while we awaited.
      if (session !== s || subscriptions.containsKey(prefix)) {
        sub.close()
        return@launch
      }

      val ps = MoQPrefixSubscription(
        prefix = prefix,
        subscription = sub,
        scope = moduleScope,
        onBroadcastAvailable = { p, catalog ->
          handleBroadcastAvailable(p, catalog, latencyMs)
        },
        onBroadcastUnavailable = { p, path ->
          handleBroadcastUnavailable(p, path)
        },
      )
      subscriptions[prefix] = ps
      ps.start()
    }
  }

  override fun unsubscribe(prefix: String) {
    val ps = subscriptions.remove(prefix) ?: return
    val paths = ps.cancel()

    // Tear down players for the paths this prefix owned.  We don't emit
    // broadcastUnavailable events here — the JS-side useBroadcasts already
    // cleared its local state synchronously when its ref count hit zero.
    for (path in paths) {
      if (prefixForPath[path] == prefix) {
        prefixForPath.remove(path)
        catalogs.remove(path)
        removePlayer(path, notify = false)
        removePlayer(path + AUDIO_KEY_SUFFIX, notify = false)
      }
    }
    mainHandler.post { notifyPlayerChanged(null) }
  }

  private fun unsubscribeAll() {
    for (prefix in subscriptions.keys.toList()) {
      unsubscribe(prefix)
    }
  }

  override fun play(broadcastPath: String) {
    playerHandles[broadcastPath]?.play()
  }

  override fun pause(broadcastPath: String) {
    playerHandles[broadcastPath]?.pause()
  }

  override fun stopPlayer(broadcastPath: String) {
    removePlayer(broadcastPath)
  }

  override fun updateTargetLatency(broadcastPath: String, ms: Double) {
    playerHandles[broadcastPath]?.updateTargetLatency(ms.toInt())
  }

  override fun switchVideoTrack(broadcastPath: String, trackName: String) {
    playerHandles[broadcastPath]?.switchVideoTrack(trackName)
  }

  override fun switchAudioTrack(broadcastPath: String, trackName: String) {
    playerHandles[broadcastPath]?.switchAudioTrack(trackName)
  }

  override fun createAudioOnlyPlayer(broadcastPath: String) {
    val catalog = catalogs[broadcastPath] ?: return
    val audioTrackName = catalog.audioTracks.firstOrNull()?.name ?: return
    val audioKey = broadcastPath + AUDIO_KEY_SUFFIX

    // Run synchronously so `playerHandles[audioKey]` is populated before this
    // call returns to JS — otherwise a follow-up `play(audioKey)` from the
    // hook's setup callback would no-op against an empty map.
    removePlayer(audioKey, notify = false)

    val p = try {
      Player(
        catalog = catalog,
        videoTrackName = null,
        audioTrackName = audioTrackName,
        targetLatencyMs = targetLatencyMs,
        parentScope = moduleScope,
      )
    } catch (_: Exception) { return }

    val handle = MoQPlayerHandle(p, audioKey, moduleScope, mainHandler)
    handle.onEvent = { name, map -> emitEvent(name, map) }
    playerHandles[audioKey] = handle
    handle.startObservingEvents()
  }

  override fun invalidate() {
    super.invalidate()
    disconnect()
    moduleScope.cancel()
  }

  // MARK: - Broadcast events

  private fun handleBroadcastAvailable(prefix: String, catalog: Catalog, targetLatencyMs: Int) {
    val path = catalog.path

    catalogs[path] = catalog
    prefixForPath[path] = prefix

    val hadPlayer = playerHandles[path] != null
    removePlayer(path, notify = false)

    val videoTrackName = catalog.videoTracks.firstOrNull()?.name
    val audioTrackName = catalog.audioTracks.firstOrNull()?.name

    val p = try {
      Player(
        catalog = catalog,
        videoTrackName = videoTrackName,
        audioTrackName = audioTrackName,
        targetLatencyMs = targetLatencyMs,
        parentScope = moduleScope,
      )
    } catch (_: Exception) { null }

    if (p != null) {
      val handle = MoQPlayerHandle(p, path, moduleScope, mainHandler)
      handle.onEvent = { name, map -> emitEvent(name, map) }
      playerHandles[path] = handle
      handle.startObservingEvents()

      if (hadPlayer) {
        p.play()
      }

      // Re-create the audio-only player if one was previously active.
      val audioKey = path + AUDIO_KEY_SUFFIX
      if (playerHandles[audioKey] != null) {
        createAudioOnlyPlayer(path)
      }

      mainHandler.post { notifyPlayerChanged(path) }
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
    map.putString("prefix", prefix)
    map.putString("path", path)
    videoTrackName?.let { map.putString("initialVideoTrackName", it) }
    audioTrackName?.let { map.putString("initialAudioTrackName", it) }
    map.putArray("videoTracks", videoArray)
    map.putArray("audioTracks", audioArray)
    emitEvent("broadcastAvailable", map)
  }

  private fun handleBroadcastUnavailable(prefix: String, path: String) {
    // If the prefix's subscription was already torn down (e.g. by unsubscribe)
    // we already handled cleanup; skip double-emit / double-tear-down.
    if (prefixForPath[path] != prefix) return

    removePlayer(path)
    removePlayer(path + AUDIO_KEY_SUFFIX, notify = false)
    catalogs.remove(path)
    prefixForPath.remove(path)
    val map = Arguments.createMap()
    map.putString("prefix", prefix)
    map.putString("path", path)
    emitEvent("broadcastUnavailable", map)
  }

  private fun removePlayer(path: String, notify: Boolean = true) {
    val handle = playerHandles.remove(path) ?: return
    // Cancel the catalog job so it stops emitting events for this path.
    prefixForPath[path]?.let { owningPrefix ->
      subscriptions[owningPrefix]?.cancelCatalogJob(path)
    }
    handle.close()
    if (notify) {
      mainHandler.post { notifyPlayerChanged(path) }
    }
  }

  // MARK: - Helpers

  private fun emitEvent(name: String, params: WritableMap) {
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(name, params)
  }
}

// MARK: - PlaybackStats → WritableMap

fun PlaybackStats.toWritableMap(): WritableMap {
  val map = Arguments.createMap()
  videoLatencyMs?.let { map.putDouble("videoLatencyMs", it) }
  audioLatencyMs?.let { map.putDouble("audioLatencyMs", it) }
  videoBitrateKbps?.let { map.putDouble("videoBitrateKbps", it) }
  audioBitrateKbps?.let { map.putDouble("audioBitrateKbps", it) }
  videoFps?.let { map.putDouble("videoFps", it) }
  videoJitterBufferMs?.let { map.putDouble("videoJitterBufferMs", it) }
  audioRingBufferMs?.let { map.putDouble("audioRingBufferMs", it) }
  timeToFirstVideoFrameMs?.let { map.putDouble("timeToFirstVideoFrameMs", it) }
  timeToFirstAudioFrameMs?.let { map.putDouble("timeToFirstAudioFrameMs", it) }
  videoFramesDropped?.let { map.putDouble("videoFramesDropped", it.toDouble()) }
  audioFramesDropped?.let { map.putDouble("audioFramesDropped", it.toDouble()) }
  videoStalls?.let { map.putMap("videoStalls", it.toWritableMap()) }
  audioStalls?.let { map.putMap("audioStalls", it.toWritableMap()) }
  return map
}

private fun StallStats.toWritableMap(): WritableMap {
  val map = Arguments.createMap()
  map.putDouble("count", count.toDouble())
  map.putDouble("totalDurationMs", totalDurationMs)
  map.putDouble("rebufferingRatio", rebufferingRatio)
  return map
}
