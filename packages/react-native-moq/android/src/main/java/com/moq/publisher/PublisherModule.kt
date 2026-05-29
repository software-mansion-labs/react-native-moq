package com.moq.publisher

import com.facebook.react.bridge.Arguments
import com.moq.NativeMoQPublisherSpec
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.moq.MoQModule
import com.moq.camera.CameraModule
import com.moq.microphone.MicrophoneModule
import com.swmansion.moqkit.publish.PublishedTrack
import com.swmansion.moqkit.publish.PublishedTrackState
import com.swmansion.moqkit.publish.Publisher
import com.swmansion.moqkit.publish.PublisherEvent
import com.swmansion.moqkit.publish.PublisherState
import com.swmansion.moqkit.publish.encoder.AudioCodec
import com.swmansion.moqkit.publish.encoder.AudioEncoderConfig
import com.swmansion.moqkit.publish.encoder.VideoCodec
import com.swmansion.moqkit.publish.encoder.VideoEncoderConfig
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

class PublisherModule(reactContext: ReactApplicationContext) :
  NativeMoQPublisherSpec(reactContext) {

  private val moduleScope = CoroutineScope(Dispatchers.Main + SupervisorJob())

  // Per-session publisher context. Camera and microphone are owned by
  // CameraModule / MicrophoneModule respectively; the publisher just
  // references them and lets the underlying modules handle refcounting.
  private class PublisherContext(val sessionId: String, val publisher: Publisher) {
    val jobs = mutableListOf<Job>()
  }

  private val publishers = ConcurrentHashMap<String, PublisherContext>()

  companion object {
    const val NAME = NativeMoQPublisherSpec.NAME
  }

  override fun addListener(eventName: String) {}
  override fun removeListeners(count: Double) {}

  // MARK: - Publish

  override fun publish(sessionId: String, path: String, tracksJson: String) {
    if (publishers.containsKey(sessionId)) return
    val s = MoQModule.connectedSession(sessionId) ?: run {
      emitState(sessionId, "error:session is not connected")
      return
    }

    val tracks = parseTracks(tracksJson)

    moduleScope.launch {
      try {
        val pub = Publisher()
        val ctx = PublisherContext(sessionId, pub)
        publishers[sessionId] = ctx

        val publishedTracks = mutableListOf<PublishedTrack>()

        for (descriptor in tracks) {
          when (descriptor) {
            is TrackDescriptor.Camera -> {
              val cam = CameraModule.instance?.waitForCamera()
                ?: error("camera module is not available")
              publishedTracks += pub.addVideoTrack(
                name = descriptor.name, source = cam, config = descriptor.config
              )
            }
            is TrackDescriptor.Microphone -> {
              val mic = MicrophoneModule.instance?.waitForMicrophone()
                ?: error("microphone module is not available")
              publishedTracks += pub.addAudioTrack(
                name = descriptor.name, source = mic, config = descriptor.config
              )
            }
          }
        }

        s.publish(path, pub)
        pub.start()

        observePublisher(ctx, publishedTracks)
      } catch (e: Exception) {
        publishers.remove(sessionId)
        emitState(sessionId, "error:${e.message ?: "publish failed"}")
        stopInternal(sessionId)
      }
    }
  }

  override fun stop(sessionId: String) {
    moduleScope.launch { stopInternal(sessionId) }
  }

  private suspend fun stopInternal(sessionId: String) {
    val ctx = publishers.remove(sessionId) ?: return

    ctx.jobs.forEach { it.cancel() }
    ctx.jobs.clear()

    try { ctx.publisher.stop() } catch (_: Exception) {}

    emitState(sessionId, "idle")
  }

  private suspend fun stopAllInternal() {
    for (sid in publishers.keys.toList()) stopInternal(sid)
  }

  override fun invalidate() {
    super.invalidate()
    moduleScope.launch { stopAllInternal() }
    moduleScope.cancel()
  }

  // MARK: - Observers

  private fun observePublisher(ctx: PublisherContext, tracks: List<PublishedTrack>) {
    val pub = ctx.publisher
    val sessionId = ctx.sessionId
    ctx.jobs += pub.state.onEach { state ->
      when (state) {
        PublisherState.Idle -> {}
        PublisherState.Publishing -> emitState(sessionId, "publishing")
        PublisherState.Stopped -> emitState(sessionId, "stopped")
        is PublisherState.Error -> emitState(sessionId, "error:${state.message}")
      }
    }.launchIn(moduleScope)

    ctx.jobs += pub.events.onEach { event ->
      val name = event.trackName
      val state = when (event) {
        is PublisherEvent.TrackStarted -> "active"
        is PublisherEvent.TrackStopped -> "stopped"
        is PublisherEvent.TrackError -> "stopped"
      }
      val map = Arguments.createMap()
      map.putString("sessionId", sessionId)
      map.putString("name", name)
      map.putString("state", state)
      if (event is PublisherEvent.TrackError) map.putString("error", event.message)
      emit("publisherTrackStateChanged", map)
    }.launchIn(moduleScope)

    for (track in tracks) {
      val trackName = track.name
      ctx.jobs += track.state.onEach { st ->
        val map = Arguments.createMap()
        map.putString("sessionId", sessionId)
        map.putString("name", trackName)
        map.putString("state", trackStateString(st))
        emit("publisherTrackStateChanged", map)
      }.launchIn(moduleScope)
    }
  }

  // MARK: - Helpers

  private fun emitState(sessionId: String, state: String) {
    val map = Arguments.createMap()
    map.putString("sessionId", sessionId)
    map.putString("state", state)
    emit("publisherStateChanged", map)
  }

  private fun emit(name: String, params: WritableMap) {
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(name, params)
  }

  private fun trackStateString(state: PublishedTrackState): String =
    when (state) {
      PublishedTrackState.Idle -> "idle"
      PublishedTrackState.Starting -> "starting"
      PublishedTrackState.Active -> "active"
      PublishedTrackState.Stopped -> "stopped"
    }

  private val PublisherEvent.trackName: String
    get() = when (this) {
      is PublisherEvent.TrackStarted -> name
      is PublisherEvent.TrackStopped -> name
      is PublisherEvent.TrackError -> name
    }

  // MARK: - Track parsing

  private sealed interface TrackDescriptor {
    val name: String
    data class Camera(override val name: String, val config: VideoEncoderConfig) : TrackDescriptor
    data class Microphone(override val name: String, val config: AudioEncoderConfig) : TrackDescriptor
  }

  private fun parseTracks(json: String): List<TrackDescriptor> {
    val arr = try { JSONArray(json) } catch (_: Exception) { return emptyList() }
    val out = mutableListOf<TrackDescriptor>()
    for (i in 0 until arr.length()) {
      val entry = arr.optJSONObject(i) ?: continue
      val type = entry.optString("type")
      val name = entry.optString("name")
      val enc = entry.optJSONObject("encoder") ?: JSONObject()
      when (type) {
        "camera" -> {
          val codec = when (enc.optString("codec")) {
            "h265" -> VideoCodec.H265
            else -> VideoCodec.H264
          }
          out += TrackDescriptor.Camera(
            name = name,
            config = VideoEncoderConfig(
              codec = codec,
              width = enc.optInt("width", 1280),
              height = enc.optInt("height", 720),
              frameRate = enc.optInt("framerate", 30),
            )
          )
        }
        "microphone" -> {
          val codec = when (enc.optString("codec")) {
            "aac" -> AudioCodec.AAC
            else -> AudioCodec.OPUS
          }
          out += TrackDescriptor.Microphone(
            name = name,
            config = AudioEncoderConfig(
              codec = codec,
              sampleRate = enc.optInt("sampleRate", 48_000),
            )
          )
        }
      }
    }
    return out
  }
}
