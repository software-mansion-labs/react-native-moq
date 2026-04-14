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
  private var player: MoQPlayer? = null
  private var targetLatencyMs: Int = 200

  private var stateJob: Job? = null
  private var broadcastsJob: Job? = null
  private var playerEventsJob: Job? = null

  private val statsRunnable = object : Runnable {
    override fun run() {
      player?.stats?.let { emitEvent("playbackStatsUpdated", it.toWritableMap()) }
      mainHandler.postDelayed(this, 500)
    }
  }

  // MARK: - Companion: shared surface/player for MoqVideoView

  companion object {
    const val NAME = NativeMoqSpec.NAME

    @Volatile var currentPlayer: MoQPlayer? = null
    var onPlayerChanged: (() -> Unit)? = null

    fun MoQSession.State.toStringValue(): String = when (this) {
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

  override fun connect(url: String, prefix: String) {
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
            is MoQBroadcastEvent.Available -> handleBroadcastAvailable(event.info)
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
    stateJob?.cancel(); stateJob = null
    broadcastsJob?.cancel(); broadcastsJob = null
    playerEventsJob?.cancel(); playerEventsJob = null
    stopStatsPolling()

    val s = session
    val p = player
    session = null
    player = null
    currentPlayer = null
    onPlayerChanged?.invoke()

    p?.stop()
    s?.close()
  }

  override fun play() {
    player?.play()
  }

  override fun pause() {
    player?.pause()
  }

  override fun stopAll() {
    player?.stop()
  }

  override fun updateTargetLatency(ms: Double) {
    targetLatencyMs = ms.toInt()
    player?.updateTargetLatency(ms.toInt())
  }

  override fun invalidate() {
    super.invalidate()
    disconnect()
    moduleScope.cancel()
  }

  // MARK: - Broadcast events

  private fun handleBroadcastAvailable(info: MoQBroadcastInfo) {
    player?.stop()
    stopStatsPolling()

    val tracks = mutableListOf<MoQTrackInfo>()
    info.videoTracks.firstOrNull()?.let { tracks.add(it) }
    info.audioTracks.firstOrNull()?.let { tracks.add(it) }

    val p = MoQPlayer(
      tracks = tracks,
      targetLatencyMs = targetLatencyMs,
      parentScope = moduleScope,
    )
    player = p
    currentPlayer = p

    observePlayerEvents(p)
    mainHandler.post {
      onPlayerChanged?.invoke()
      p.play()
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
    player?.stop()
    player = null
    currentPlayer = null
    onPlayerChanged?.invoke()
    stopStatsPolling()

    val map = Arguments.createMap()
    map.putString("path", path)
    emitEvent("broadcastUnavailable", map)
  }

  // MARK: - Player events

  private fun observePlayerEvents(p: MoQPlayer) {
    playerEventsJob?.cancel()
    playerEventsJob = moduleScope.launch {
      p.events.collect { event ->
        val map = Arguments.createMap()
        when (event) {
          is MoQPlayer.Event.TrackPlaying -> {
            map.putString("type", "trackPlaying")
            map.putString("trackKind", event.kind)
            startStatsPolling()
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
            stopStatsPolling()
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

  private fun startStatsPolling() {
    mainHandler.removeCallbacks(statsRunnable)
    mainHandler.postDelayed(statsRunnable, 500)
  }

  private fun stopStatsPolling() {
    mainHandler.removeCallbacks(statsRunnable)
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
