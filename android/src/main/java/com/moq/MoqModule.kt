package com.moq

import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.swmansion.moqkit.MoQBroadcastEvent
import com.swmansion.moqkit.MoQBroadcastInfo
import com.swmansion.moqkit.MoQPlayer
import com.swmansion.moqkit.MoQSession
import com.swmansion.moqkit.MoQTrackInfo
import com.swmansion.moqkit.PlaybackStats
import com.swmansion.moqkit.StallStats
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class MoqModule(reactContext: ReactApplicationContext) : NativeMoqSpec(reactContext) {

  private val moduleScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
  private val mainHandler = Handler(Looper.getMainLooper())

  private var session: MoQSession? = null
  private var stateJob: Job? = null
  private var broadcastsJob: Job? = null

  private val playerEventJobs = ConcurrentHashMap<String, Job>()
  private val statsRunnables = ConcurrentHashMap<String, Runnable>()

  // MARK: - Companion: shared player map and listeners for MoqVideoView

  companion object {
    const val NAME = NativeMoqSpec.NAME

    val players = ConcurrentHashMap<String, MoQPlayer>()
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

    fun MoQSession.State.toStringValue(): String =
      when (this) {
        MoQSession.State.Idle -> "idle"
        MoQSession.State.Connecting -> "connecting"
        MoQSession.State.Connected -> "connected"
        MoQSession.State.Closed -> "closed"
        is MoQSession.State.Error -> "error:${this.message}"
      }
  }

  // MARK: - NativeMoqSpec

  override fun addListener(eventName: String) {}

  override fun removeListeners(count: Double) {}

  override fun connect(url: String, prefix: String, targetLatencyMs: Double) {
    val latencyMs = targetLatencyMs.toInt()
    moduleScope.launch {
      val s = MoQSession(url = url, parentScope = moduleScope)
      session = s

      stateJob = launch {
        s.state.collect { state ->
          val map = Arguments.createMap()
          map.putString("state", state.toStringValue())
          emitEvent("sessionStateChanged", map)
        }
      }

      broadcastsJob = launch {
        s.broadcasts.collect { event ->
          when (event) {
            is MoQBroadcastEvent.Available -> handleBroadcastAvailable(event.info, latencyMs)
            is MoQBroadcastEvent.Unavailable -> handleBroadcastUnavailable(event.path)
          }
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
    broadcastsJob?.cancel()
    broadcastsJob = null

    playerEventJobs.keys.toList().forEach { path -> removePlayer(path, notify = false) }

    val s = session
    session = null

    mainHandler.post { notifyPlayerChanged(null) }

    s?.close()
  }

  override fun play(broadcastPath: String) {
    players[broadcastPath]?.play()
  }

  override fun pause(broadcastPath: String) {
    players[broadcastPath]?.pause()
  }

  override fun stopPlayer(broadcastPath: String) {
    removePlayer(broadcastPath)
  }

  override fun updateTargetLatency(broadcastPath: String, ms: Double) {
    players[broadcastPath]?.updateTargetLatency(ms.toInt())
  }

  override fun invalidate() {
    super.invalidate()
    disconnect()
    moduleScope.cancel()
  }

  // MARK: - Broadcast events

  private fun handleBroadcastAvailable(info: MoQBroadcastInfo, targetLatencyMs: Int) {
    removePlayer(info.path, notify = false)

    val tracks = mutableListOf<MoQTrackInfo>()
    info.videoTracks.firstOrNull()?.let { tracks.add(it) }
    info.audioTracks.firstOrNull()?.let { tracks.add(it) }

    val p = MoQPlayer(
      tracks = tracks,
      targetLatencyMs = targetLatencyMs,
      parentScope = moduleScope,
    )
    players[info.path] = p
    observePlayerEvents(p, info.path)

    mainHandler.post {
      notifyPlayerChanged(info.path)
    }

    val videoArray = Arguments.createArray()
    info.videoTracks.forEach { track ->
      val item = Arguments.createMap()
      item.putString("name", track.name)
      item.putString("codec", track.config.codec)
      videoArray.pushMap(item)
    }
    val audioArray = Arguments.createArray()
    info.audioTracks.forEach { track ->
      val item = Arguments.createMap()
      item.putString("name", track.name)
      item.putString("codec", track.config.codec)
      item.putInt("sampleRate", track.config.sampleRate.toInt())
      audioArray.pushMap(item)
    }
    val map = Arguments.createMap()
    map.putString("path", info.path)
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
    playerEventJobs.remove(path)?.cancel()
    stopStatsPolling(path)
    players.remove(path)?.stop()
    if (notify) {
      mainHandler.post { notifyPlayerChanged(path) }
    }
  }

  // MARK: - Player events

  private fun observePlayerEvents(p: MoQPlayer, broadcastPath: String) {
    playerEventJobs[broadcastPath]?.cancel()
    playerEventJobs[broadcastPath] = moduleScope.launch {
      p.events.collect { event ->
        val map = Arguments.createMap()
        map.putString("broadcastPath", broadcastPath)
        when (event) {
          is MoQPlayer.Event.TrackPlaying -> {
            map.putString("type", "trackPlaying")
            map.putString("trackKind", event.kind)
            startStatsPolling(p, broadcastPath)
          }
          is MoQPlayer.Event.TrackPaused -> {
            map.putString("type", "trackPaused")
            map.putString("trackKind", event.kind)
          }
          is MoQPlayer.Event.TrackStopped -> {
            map.putString("type", "trackStopped")
            map.putString("trackKind", event.kind)
          }
          MoQPlayer.Event.AllTracksStopped -> {
            map.putString("type", "allTracksStopped")
            stopStatsPolling(broadcastPath)
          }
          is MoQPlayer.Event.Error -> {
            map.putString("type", "error")
            map.putString("trackKind", event.kind)
            map.putString("message", event.message)
          }
        }
        emitEvent("playerEvent", map)
      }
    }
  }

  // MARK: - Stats polling

  private fun startStatsPolling(player: MoQPlayer, broadcastPath: String) {
    stopStatsPolling(broadcastPath)
    val runnable = object : Runnable {
      override fun run() {
        player.stats?.let { stats ->
          val map = stats.toWritableMap()
          map.putString("broadcastPath", broadcastPath)
          emitEvent("playbackStatsUpdated", map)
        }
        mainHandler.postDelayed(this, 500)
      }
    }
    statsRunnables[broadcastPath] = runnable
    mainHandler.postDelayed(runnable, 500)
  }

  private fun stopStatsPolling(broadcastPath: String) {
    statsRunnables.remove(broadcastPath)?.let { mainHandler.removeCallbacks(it) }
  }

  // MARK: - Helpers

  private fun emitEvent(name: String, params: WritableMap) {
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(name, params)
  }
}

// MARK: - PlaybackStats → WritableMap

private fun PlaybackStats.toWritableMap(): WritableMap {
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
