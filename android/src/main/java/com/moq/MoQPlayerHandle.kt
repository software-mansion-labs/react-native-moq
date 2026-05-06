package com.moq

import android.os.Handler
import android.view.Surface
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.swmansion.moqkit.subscribe.Player
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

class MoQPlayerHandle(
  val player: Player,
  val broadcastPath: String,
  private val moduleScope: CoroutineScope,
  private val mainHandler: Handler,
) {
  var onEvent: ((String, WritableMap) -> Unit)? = null

  @Volatile private var eventJob: Job? = null
  @Volatile private var statsRunnable: Runnable? = null

  // MARK: - Playback controls

  fun play() = player.play()
  fun pause() = player.pause()
  fun updateTargetLatency(ms: Int) = player.updateTargetLatency(ms)
  fun setSurface(surface: Surface?) = player.setSurface(surface)

  fun switchVideoTrack(trackName: String) {
    player.switchTrack(trackName)
    val map = Arguments.createMap()
    map.putString("broadcastPath", broadcastPath)
    map.putString("type", "trackSwitched")
    map.putString("trackKind", "video")
    map.putString("trackName", trackName)
    onEvent?.invoke("playerEvent", map)
  }

  fun switchAudioTrack(trackName: String) {
    player.switchAudioTrack(trackName)
    val map = Arguments.createMap()
    map.putString("broadcastPath", broadcastPath)
    map.putString("type", "trackSwitched")
    map.putString("trackKind", "audio")
    map.putString("trackName", trackName)
    onEvent?.invoke("playerEvent", map)
  }

  // MARK: - Event observation

  fun startObservingEvents() {
    eventJob?.cancel()
    eventJob = moduleScope.launch {
      player.events.collect { event ->
        val map = Arguments.createMap()
        map.putString("broadcastPath", broadcastPath)
        when (event) {
          is Player.Event.TrackPlaying -> {
            map.putString("type", "trackPlaying")
            map.putString("trackKind", event.kind)
            mainHandler.post { startStatsPolling() }
          }
          is Player.Event.TrackPaused -> {
            map.putString("type", "trackPaused")
            map.putString("trackKind", event.kind)
          }
          is Player.Event.TrackStopped -> {
            map.putString("type", "trackStopped")
            map.putString("trackKind", event.kind)
          }
          Player.Event.AllTracksStopped -> {
            map.putString("type", "allTracksStopped")
            mainHandler.post { stopStatsPolling() }
          }
          is Player.Event.Error -> {
            map.putString("type", "error")
            map.putString("trackKind", event.kind)
            map.putString("message", event.message)
          }
        }
        onEvent?.invoke("playerEvent", map)
      }
    }
  }

  // MARK: - Stats polling

  fun startStatsPolling() {
    stopStatsPolling()
    val runnable = object : Runnable {
      override fun run() {
        val map = player.stats.toWritableMap()
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

  // MARK: - Cleanup

  fun close() {
    eventJob?.cancel()
    eventJob = null
    stopStatsPolling()
    player.close()
  }
}
