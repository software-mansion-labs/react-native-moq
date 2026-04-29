package com.moq

import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.swmansion.moqkit.Session
import com.swmansion.moqkit.subscribe.BroadcastSubscription
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

class MoQModule(reactContext: ReactApplicationContext) : NativeMoQSpec(reactContext) {

  private val moduleScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
  private val mainHandler = Handler(Looper.getMainLooper())

  private var session: Session? = null
  private var subscription: BroadcastSubscription? = null
  private var stateJob: Job? = null
  private var broadcastsJob: Job? = null

  // MARK: - Companion: shared handle maps and listeners for MoQVideoView

  companion object {
    const val NAME = NativeMoQSpec.NAME

    val playerHandlesById = ConcurrentHashMap<Int, MoQPlayerHandle>()
    private val playerIdsByPath = ConcurrentHashMap<String, Int>()
    private val playerChangeListeners =
      ConcurrentHashMap<Int, CopyOnWriteArrayList<() -> Unit>>()

    fun addPlayerListener(playerId: Int, listener: () -> Unit) {
      playerChangeListeners.getOrPut(playerId) { CopyOnWriteArrayList() }.add(listener)
    }

    fun removePlayerListener(playerId: Int, listener: () -> Unit) {
      playerChangeListeners[playerId]?.remove(listener)
    }

    fun notifyPlayerChanged(playerId: Int?) {
      if (playerId == null) {
        playerChangeListeners.values.forEach { list -> list.forEach { it() } }
      } else {
        playerChangeListeners[playerId]?.forEach { it() }
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

  override fun connect(url: String, prefix: String, targetLatencyMs: Double) {
    val latencyMs = targetLatencyMs.toInt()
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

      val sub = s.subscribe(prefix = prefix)
      subscription = sub

      broadcastsJob = launch {
        sub.broadcasts.collect { broadcast ->
          val path = broadcast.path
          launch {
            broadcast.use { broadcast ->
              broadcast.catalogs().collect { catalog ->
                handleBroadcastAvailable(catalog, latencyMs)
              }
            }
            handleBroadcastUnavailable(path)
          }
        }
      }
    }
  }

  override fun disconnect() {
    stateJob?.cancel()
    stateJob = null
    broadcastsJob?.cancel()
    broadcastsJob = null

    subscription?.close()
    subscription = null

    playerIdsByPath.keys.toList().forEach { path -> removePlayer(path, notify = false) }
    playerHandlesById.clear()
    playerIdsByPath.clear()

    val s = session
    session = null

    mainHandler.post { notifyPlayerChanged(null) }

    s?.close()
  }

  override fun play(playerId: Double) {
    playerHandlesById[playerId.toInt()]?.play()
  }

  override fun pause(playerId: Double) {
    playerHandlesById[playerId.toInt()]?.pause()
  }

  override fun stopPlayer(playerId: Double) {
    val id = playerId.toInt()
    val path = playerHandlesById[id]?.broadcastPath ?: return
    removePlayer(path)
  }

  override fun updateTargetLatency(playerId: Double, ms: Double) {
    playerHandlesById[playerId.toInt()]?.updateTargetLatency(ms.toInt())
  }

  override fun switchVideoTrack(playerId: Double, trackName: String) {
    playerHandlesById[playerId.toInt()]?.switchVideoTrack(trackName)
  }

  override fun switchAudioTrack(playerId: Double, trackName: String) {
    // Audio track switching is not supported on Android
  }

  override fun invalidate() {
    super.invalidate()
    disconnect()
    moduleScope.cancel()
  }

  // MARK: - Broadcast events

  private fun handleBroadcastAvailable(catalog: Catalog, targetLatencyMs: Int) {
    val path = catalog.path

    val hadPlayer = playerIdsByPath[path] != null
    removePlayer(path, notify = false)

    val sortedVideo = catalog.videoTracks.sortedByDescending {
      it.config.coded?.let { d -> d.width.toLong() * d.height.toLong() } ?: 0L
    }
    val videoTrackName = sortedVideo.firstOrNull()?.name
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
      playerIdsByPath[path] = handle.playerId
      playerHandlesById[handle.playerId] = handle
      handle.startObservingEvents()

      if (hadPlayer) {
        p.play()
      }

      mainHandler.post { notifyPlayerChanged(handle.playerId) }
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
    map.putString("path", path)
    playerIdsByPath[path]?.let { map.putInt("playerId", it) }
    map.putArray("videoTracks", videoArray)
    map.putArray("audioTracks", audioArray)
    emitEvent("broadcastAvailable", map)
  }

  private fun handleBroadcastUnavailable(path: String) {
    removePlayer(path)
    val map = Arguments.createMap()
    map.putString("path", path)
    emitEvent("broadcastUnavailable", map)
  }

  private fun removePlayer(path: String, notify: Boolean = true) {
    val id = playerIdsByPath.remove(path)
    val removed = id?.let { playerHandlesById.remove(it) }
    removed?.close()
    if (notify && id != null) {
      mainHandler.post { notifyPlayerChanged(id) }
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
