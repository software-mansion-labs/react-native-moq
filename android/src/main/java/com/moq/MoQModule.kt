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
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class MoQModule(reactContext: ReactApplicationContext) : NativeMoQSpec(reactContext) {

  private val moduleScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
  private val mainHandler = Handler(Looper.getMainLooper())

  private var session: Session? = null
  private var subscription: BroadcastSubscription? = null
  private var stateJob: Job? = null
  private var broadcastsJob: Job? = null

  private val eventJobs = ConcurrentHashMap<Int, Job>()
  private val statsJobs = ConcurrentHashMap<Int, Job>()

  // MARK: - Companion: shared player map for MoQVideoView

  companion object {
    const val NAME = NativeMoQSpec.NAME

    private val nextId = AtomicInteger(1)
    val players = ConcurrentHashMap<Int, Player>()
    private val pathByHandle = ConcurrentHashMap<Int, String>()
    private val catalogByPath = ConcurrentHashMap<String, Catalog>()
    private var targetLatencyMs: Int = 200

    fun allocatePlayer(broadcastPath: String): Int {
      val catalog = catalogByPath[broadcastPath] ?: return 0
      val player = try {
        Player(
          catalog = catalog,
          videoTrackName = catalog.videoTracks.firstOrNull()?.name,
          audioTrackName = catalog.audioTracks.firstOrNull()?.name,
          targetLatencyMs = targetLatencyMs,
          parentScope = CoroutineScope(Dispatchers.IO + SupervisorJob()),
        )
      } catch (_: Exception) { return 0 }

      val id = nextId.getAndIncrement()
      players[id] = player
      pathByHandle[id] = broadcastPath
      return id
    }

    fun removePlayer(id: Int): Player? {
      pathByHandle.remove(id)
      return players.remove(id)
    }

    fun handlesForPath(path: String): List<Int> =
      pathByHandle.filter { it.value == path }.map { it.key }

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
    Companion.targetLatencyMs = targetLatencyMs.toInt()
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

      try { s.connect() } catch (_: Exception) {}

      val sub = s.subscribe(prefix = prefix)
      subscription = sub

      broadcastsJob = launch {
        sub.broadcasts.collect { broadcast ->
          val path = broadcast.path
          launch {
            broadcast.use { b ->
              b.catalogs().collect { catalog ->
                catalogByPath[path] = catalog
                handlesForPath(path).forEach { releasePlayer(it.toDouble()) }
                emitBroadcastAvailable(catalog)
              }
            }
            catalogByPath.remove(path)
            handlesForPath(path).forEach { releasePlayer(it.toDouble()) }
            val map = Arguments.createMap()
            map.putString("path", path)
            emitEvent("broadcastUnavailable", map)
          }
        }
      }
    }
  }

  override fun disconnect() {
    stateJob?.cancel(); stateJob = null
    broadcastsJob?.cancel(); broadcastsJob = null
    subscription?.close(); subscription = null

    players.keys.toList().forEach { id ->
      eventJobs.remove(id)?.cancel()
      statsJobs.remove(id)?.cancel()
      removePlayer(id)?.close()
    }

    session?.close()
    session = null
    catalogByPath.clear()
  }

  override fun createPlayer(broadcastPath: String): Double {
    val id = allocatePlayer(broadcastPath)
    if (id == 0) return 0.0
    val player = players[id] ?: return 0.0

    eventJobs[id] = moduleScope.launch {
      player.events.collect { event ->
        val map = Arguments.createMap()
        map.putInt("handleId", id)
        when (event) {
          is Player.Event.TrackPlaying -> {
            map.putString("type", "trackPlaying")
            map.putString("trackKind", event.kind)
            startStatsJob(id, player)
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
            statsJobs.remove(id)?.cancel()
          }
          is Player.Event.Error -> {
            map.putString("type", "error")
            map.putString("trackKind", event.kind)
            map.putString("message", event.message)
          }
        }
        emitEvent("playerEvent", map)
      }
    }

    return id.toDouble()
  }

  override fun releasePlayer(handleId: Double) {
    val id = handleId.toInt()
    eventJobs.remove(id)?.cancel()
    statsJobs.remove(id)?.cancel()
    removePlayer(id)?.close()
  }

  override fun play(handleId: Double) {
    players[handleId.toInt()]?.play()
  }

  override fun pause(handleId: Double) {
    players[handleId.toInt()]?.pause()
  }

  override fun updateTargetLatency(handleId: Double, ms: Double) {
    players[handleId.toInt()]?.updateTargetLatency(ms.toInt())
  }

  override fun switchVideoTrack(handleId: Double, trackName: String) {
    val id = handleId.toInt()
    players[id]?.switchTrack(trackName)
    val map = Arguments.createMap()
    map.putInt("handleId", id)
    map.putString("type", "trackSwitched")
    map.putString("trackKind", "video")
    map.putString("trackName", trackName)
    emitEvent("playerEvent", map)
  }

  override fun switchAudioTrack(handleId: Double, trackName: String) {
    // Audio track switching is not supported on Android
  }

  override fun invalidate() {
    super.invalidate()
    disconnect()
    moduleScope.cancel()
  }

  // MARK: - Helpers

  private fun startStatsJob(id: Int, player: Player) {
    if (statsJobs.containsKey(id)) return
    statsJobs[id] = moduleScope.launch {
      while (true) {
        delay(500)
        val map = player.stats.toWritableMap()
        map.putInt("handleId", id)
        emitEvent("playbackStatsUpdated", map)
      }
    }
  }

  private fun emitBroadcastAvailable(catalog: Catalog) {
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
    map.putString("path", catalog.path)
    map.putArray("videoTracks", videoArray)
    map.putArray("audioTracks", audioArray)
    emitEvent("broadcastAvailable", map)
  }

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
