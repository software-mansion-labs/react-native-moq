package com.moq.player

import android.os.Handler
import android.view.Surface
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.moq.toWritableMap
import com.swmansion.moqkit.subscribe.Player
import com.swmansion.moqkit.subscribe.PlayerEventType
import com.swmansion.moqkit.subscribe.PlayerTrackErrorEvent
import com.swmansion.moqkit.subscribe.PlayerTrackEvent
import java.time.Duration
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

class PlayerHandle(
  val player: Player,
  val sessionId: String,
  val broadcastPath: String,
  private val moduleScope: CoroutineScope,
  private val mainHandler: Handler,
) {
  var onEvent: ((String, WritableMap) -> Unit)? = null

  @Volatile private var eventJob: Job? = null
  @Volatile private var statsRunnable: Runnable? = null

  fun play() = player.play()
  fun pause() = player.pause()
  fun updateTargetLatency(ms: Int) =
    player.updateTargetLatency(Duration.ofMillis(ms.toLong()))
  fun setSurface(surface: Surface?) = player.setSurface(surface)
  fun setVolume(volume: Float) = player.setVolume(volume)

  fun switchVideoTrack(trackName: String) {
    player.switchTrack(trackName)
    val map = Arguments.createMap()
    map.putString("sessionId", sessionId)
    map.putString("broadcastPath", broadcastPath)
    map.putString("type", "trackSwitched")
    map.putString("trackKind", "video")
    map.putString("trackName", trackName)
    onEvent?.invoke("playerEvent", map)
  }

  fun switchAudioTrack(trackName: String) {
    player.switchAudioTrack(trackName)
    val map = Arguments.createMap()
    map.putString("sessionId", sessionId)
    map.putString("broadcastPath", broadcastPath)
    map.putString("type", "trackSwitched")
    map.putString("trackKind", "audio")
    map.putString("trackName", trackName)
    onEvent?.invoke("playerEvent", map)
  }

  // MoQKit 0.2.0's PlayerEvent model makes pause/end session-level; fold them onto
  // the trackPlaying/trackPaused/allTracksStopped/trackSwitched types usePlayer acts
  // on, and forward remaining diagnostics under their own names (JS ignores unknown).
  fun startObservingEvents() {
    eventJob?.cancel()
    eventJob = moduleScope.launch {
      player.events.collect { event ->
        when (val type = event.type) {
          is PlayerEventType.PlayerInit -> emitPlayerEvent("playerInit")
          is PlayerEventType.PlayerDestroy -> emitPlayerEvent("playerDestroy")
          is PlayerEventType.PlaybackRequest -> emitPlayerEvent("playbackRequest")
          is PlayerEventType.PlaybackStart -> emitPlayerEvent("playbackStart", type.playback.track)
          is PlayerEventType.PlaybackPause -> emitPlayerEvent("trackPaused")
          is PlayerEventType.PlaybackResume -> emitPlayerEvent("trackPlaying")
          is PlayerEventType.PlaybackEnd -> {
            mainHandler.post { stopStatsPolling() }
            emitPlayerEvent("allTracksStopped")
          }
          is PlayerEventType.TrackSubscribeStart -> emitPlayerEvent("trackSubscribeStart", type.track)
          is PlayerEventType.TrackReady -> emitPlayerEvent("trackReady", type.ready.track)
          is PlayerEventType.TrackPlaying -> {
            mainHandler.post { startStatsPolling() }
            emitPlayerEvent("trackPlaying", type.playing.track)
          }
          is PlayerEventType.TrackSubscribeError -> emitErrorEvent(type.error)
          is PlayerEventType.DecodeError -> emitErrorEvent(type.error)
          is PlayerEventType.TrackSubscribeEnd -> emitPlayerEvent("trackStopped", type.track)
          is PlayerEventType.TrackSelect -> {
            val map = baseEventMap("trackSelect")
            map.putString("trackKind", type.selection.kind.value)
            type.selection.trackName?.let { map.putString("trackName", it) }
            onEvent?.invoke("playerEvent", map)
          }
          is PlayerEventType.TrackSwitch -> emitPlayerEvent("trackSwitched", type.track)
          is PlayerEventType.TrackStallStart -> emitPlayerEvent("trackStallStart", type.track)
          is PlayerEventType.TrackStallEnd -> emitPlayerEvent("trackStallEnd", type.track)
          is PlayerEventType.RebufferStart -> emitPlayerEvent("rebufferStart", type.track)
          is PlayerEventType.RebufferEnd -> emitPlayerEvent("rebufferEnd", type.track)
        }
      }
    }
  }

  private fun baseEventMap(type: String): WritableMap {
    val map = Arguments.createMap()
    map.putString("sessionId", sessionId)
    map.putString("broadcastPath", broadcastPath)
    map.putString("type", type)
    return map
  }

  private fun emitPlayerEvent(type: String, track: PlayerTrackEvent? = null) {
    val map = baseEventMap(type)
    track?.let {
      map.putString("trackKind", it.kind.value)
      it.trackName?.let { name -> map.putString("trackName", name) }
    }
    onEvent?.invoke("playerEvent", map)
  }

  private fun emitErrorEvent(error: PlayerTrackErrorEvent) {
    val map = baseEventMap("error")
    map.putString("trackKind", error.track.kind.value)
    map.putString("message", error.message)
    onEvent?.invoke("playerEvent", map)
  }

  fun startStatsPolling() {
    stopStatsPolling()
    val runnable = object : Runnable {
      override fun run() {
        val map = player.stats.toWritableMap()
        map.putString("sessionId", sessionId)
        map.putString("broadcastPath", broadcastPath)
        onEvent?.invoke("playbackStatsUpdated", map)
        mainHandler.postDelayed(this, 500)
      }
    }
    statsRunnable = runnable
    mainHandler.postDelayed(runnable, 500)
  }

  fun stopStatsPolling() {
    statsRunnable?.let { mainHandler.removeCallbacks(it) }
    statsRunnable = null
  }

  fun close() {
    eventJob?.cancel()
    eventJob = null
    stopStatsPolling()
    player.close()
  }
}
