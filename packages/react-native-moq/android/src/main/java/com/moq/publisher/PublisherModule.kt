package com.moq.publisher

import com.facebook.react.bridge.Arguments
import com.moq.NativeMoQPublisherSpec
import com.facebook.react.bridge.ReactApplicationContext
import com.moq.MoQModule
import com.moq.camera.CameraModule
import com.moq.camera.MultiCameraModule
import com.moq.capture.audioCodecFromJs
import com.moq.capture.videoCodecFromJs
import com.moq.datatrack.DataTrackModule
import com.moq.emitDeviceEvent
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
  private class PublisherContext(
    val sessionId: String,
    val path: String,
    val publisher: Publisher,
  ) {
    val jobs = mutableListOf<Job>()
  }

  private val publishers = ConcurrentHashMap<String, PublisherContext>()

  // In-flight stop jobs, keyed by session. A new publish() joins any pending
  // teardown so publish()/start() never runs concurrently with the previous
  // publisher's stop()/unpublish() on the same Session (which can drop it).
  private val teardowns = ConcurrentHashMap<String, Job>()

  companion object {
    const val NAME = NativeMoQPublisherSpec.NAME
  }

  override fun addListener(eventName: String) {}
  override fun removeListeners(count: Double) {}

  // MARK: - Publish

  override fun publish(sessionId: String, path: String, tracksJson: String) {
    val tracks = parseTracks(tracksJson)

    moduleScope.launch {
      // Replacing a publisher on this session (e.g. switching games): tear the
      // old one down and WAIT before starting the new one, so publish()/start()
      // never runs concurrently with the previous publisher's stop()/unpublish()
      // on the same Session — that race could drop the whole session, which is
      // what made cartridge swaps sometimes kill the console.
      publishers.remove(sessionId)?.let { existing ->
        existing.jobs.forEach { it.cancel() }
        existing.jobs.clear()
        val session = MoQModule.connectedSession(sessionId)
        try {
          if (session != null) session.unpublish(existing.path)
          else existing.publisher.stop()
        } catch (_: Exception) {}
      }
      teardowns.remove(sessionId)?.join()

      val s = MoQModule.connectedSession(sessionId) ?: run {
        emitState(sessionId, "error:session is not connected")
        return@launch
      }

      try {
        val pub = Publisher()
        val ctx = PublisherContext(sessionId, path, pub)
        publishers[sessionId] = ctx

        val publishedTracks = mutableListOf<PublishedTrack>()

        for (descriptor in tracks) {
          when (descriptor) {
            is TrackDescriptor.Camera -> {
              val source = when (descriptor.source) {
                "multi-front" -> MultiCameraModule.instance?.waitForCapture()?.frontSource
                  ?: error("multi-camera module is not available")
                "multi-back" -> MultiCameraModule.instance?.waitForCapture()?.backSource
                  ?: error("multi-camera module is not available")
                else -> CameraModule.instance?.waitForCamera()
                  ?: error("camera module is not available")
              }
              publishedTracks += pub.addVideoTrack(
                name = descriptor.name, source = source, config = descriptor.config
              )
            }
            is TrackDescriptor.Microphone -> {
              val mic = MicrophoneModule.instance?.waitForMicrophone()
                ?: error("microphone module is not available")
              publishedTracks += pub.addAudioTrack(
                name = descriptor.name, source = mic, config = descriptor.config
              )
            }
            is TrackDescriptor.Data -> {
              val emitter = DataTrackModule.instance?.emitter(descriptor.id)
                ?: error("data track '${descriptor.id}' not created")
              publishedTracks += pub.addDataTrack(
                name = descriptor.name, emitter = emitter
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
    // Remember the teardown so a follow-up publish() on this session can join it
    // instead of racing it.
    teardowns[sessionId] = moduleScope.launch { stopInternal(sessionId) }
  }

  private suspend fun stopInternal(sessionId: String) {
    val ctx = publishers.remove(sessionId) ?: return

    ctx.jobs.forEach { it.cancel() }
    ctx.jobs.clear()

    // Unpublish through the session so it clears its activePublishers entry for
    // this path; otherwise a subsequent publish() at the same path throws
    // "Already publishing". unpublish() also calls Publisher.stop() internally.
    val session = MoQModule.connectedSession(sessionId)
    if (session != null) {
      try { session.unpublish(ctx.path) } catch (_: Exception) {}
    } else {
      try { ctx.publisher.stop() } catch (_: Exception) {}
    }

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
      reactApplicationContext.emitDeviceEvent("publisherTrackStateChanged", map)
    }.launchIn(moduleScope)

    for (track in tracks) {
      val trackName = track.name
      ctx.jobs += track.state.onEach { st ->
        val map = Arguments.createMap()
        map.putString("sessionId", sessionId)
        map.putString("name", trackName)
        map.putString("state", trackStateString(st))
        reactApplicationContext.emitDeviceEvent("publisherTrackStateChanged", map)
      }.launchIn(moduleScope)
    }
  }

  // MARK: - Helpers

  private fun emitState(sessionId: String, state: String) {
    val map = Arguments.createMap()
    map.putString("sessionId", sessionId)
    map.putString("state", state)
    reactApplicationContext.emitDeviceEvent("publisherStateChanged", map)
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
    data class Camera(
      override val name: String,
      val source: String,
      val config: VideoEncoderConfig,
    ) : TrackDescriptor
    data class Microphone(override val name: String, val config: AudioEncoderConfig) : TrackDescriptor
    data class Data(override val name: String, val id: String) : TrackDescriptor
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
          val codec = videoCodecFromJs(enc.optString("codec"), VideoCodec.H264)
          out += TrackDescriptor.Camera(
            name = name,
            source = entry.optString("source", "single"),
            config = VideoEncoderConfig(
              codec = codec,
              width = enc.optInt("width", 1280),
              height = enc.optInt("height", 720),
              frameRate = enc.optInt("framerate", 30),
            )
          )
        }
        "microphone" -> {
          val codec = audioCodecFromJs(enc.optString("codec"), AudioCodec.OPUS)
          out += TrackDescriptor.Microphone(
            name = name,
            config = AudioEncoderConfig(
              codec = codec,
              sampleRate = enc.optInt("sampleRate", 48_000),
            )
          )
        }
        "data" -> {
          out += TrackDescriptor.Data(name = name, id = entry.optString("id"))
        }
      }
    }
    return out
  }
}
