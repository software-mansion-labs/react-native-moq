package com.moq

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Surface
import androidx.lifecycle.LifecycleOwner
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.swmansion.moqkit.publish.PublishedTrack
import com.swmansion.moqkit.publish.PublishedTrackState
import com.swmansion.moqkit.publish.Publisher
import com.swmansion.moqkit.publish.PublisherEvent
import com.swmansion.moqkit.publish.PublisherState
import com.swmansion.moqkit.publish.encoder.AudioCodec
import com.swmansion.moqkit.publish.encoder.AudioEncoderConfig
import com.swmansion.moqkit.publish.encoder.VideoCodec
import com.swmansion.moqkit.publish.encoder.VideoEncoderConfig
import com.swmansion.moqkit.publish.source.CameraCapture
import com.swmansion.moqkit.publish.source.CameraPosition
import com.swmansion.moqkit.publish.source.MicrophoneCapture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import org.json.JSONObject

class MoQPublisherModule(reactContext: ReactApplicationContext) :
  NativeMoQPublisherSpec(reactContext), ActivityEventListener {

  init {
    instance = this
    reactContext.addActivityEventListener(this)
  }

  // Screen-broadcast: configured ahead of time by JS, consumed when
  // startScreenBroadcast() launches the system MediaProjection consent flow.
  private var screenBroadcastUrl: String? = null
  private var screenBroadcastOptsJson: String? = null
  private var pendingScreenPromise: Promise? = null
  private val screenBroadcastRequestCode = 0xC051

  private val screenStateListener: (String) -> Unit = { state ->
    val map = Arguments.createMap()
    map.putString("state", state)
    emit("screenBroadcastStateChanged", map)
  }

  private val screenTrackListener: (String, String, String?) -> Unit = { name, state, error ->
    val map = Arguments.createMap()
    map.putString("name", name)
    map.putString("state", state)
    if (error != null) map.putString("error", error)
    emit("publisherTrackStateChanged", map)
  }

  private val moduleScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
  private val mainHandler = Handler(Looper.getMainLooper())

  // Singleton-style state: at most one preview + publisher at a time.
  private var cameraCapture: CameraCapture? = null
  private var cameraPosition: CameraPosition = CameraPosition.Front
  private var previewRefCount: Int = 0

  // Per-session publisher context. Multiple sessions can host concurrent
  // publishers. Camera and microphone are device-singletons so they're shared
  // across publishers with ref-counts.
  private class PublisherContext(val sessionId: String, val publisher: Publisher) {
    val jobs = mutableListOf<Job>()
    var usesCamera: Boolean = false
    var usesMicrophone: Boolean = false
  }

  private val publishers = ConcurrentHashMap<String, PublisherContext>()
  private var microphone: MicrophoneCapture? = null
  private var microphoneRefCount: Int = 0
  private val publishing: Boolean get() = publishers.isNotEmpty()

  companion object {
    const val NAME = NativeMoQPublisherSpec.NAME

    // The module is a singleton on the JS bridge; views talk to it through
    // this reference to start/stop preview and observe the shared camera.
    @Volatile var instance: MoQPublisherModule? = null
      private set

    private val cameraListeners = CopyOnWriteArrayList<() -> Unit>()

    fun addCameraListener(listener: () -> Unit) { cameraListeners.add(listener) }
    fun removeCameraListener(listener: () -> Unit) { cameraListeners.remove(listener) }

    @Volatile var sharedCameraCapture: CameraCapture? = null
      private set
  }

  private fun publishSharedCamera(cam: CameraCapture?) {
    sharedCameraCapture = cam
    mainHandler.post { cameraListeners.forEach { it() } }
  }

  override fun addListener(eventName: String) {}
  override fun removeListeners(count: Double) {}

  // MARK: - Preview

  override fun startPreview(cameraPosition: String) {
    val pos = parsePosition(cameraPosition)
    moduleScope.launch {
      previewRefCount += 1
      this@MoQPublisherModule.cameraPosition = pos
      if (cameraCapture != null) return@launch
      val owner = lifecycleOwner() ?: run {
        emitState("error:No foreground activity for camera preview")
        return@launch
      }
      val cam = CameraCapture(position = pos)
      cameraCapture = cam
      try {
        cam.start(reactApplicationContext, owner)
        publishSharedCamera(cam)
      } catch (e: Exception) {
        cameraCapture = null
        publishSharedCamera(null)
        emitState("error:${e.message ?: "camera start failed"}")
      }
    }
  }

  override fun stopPreview() {
    moduleScope.launch {
      if (previewRefCount > 0) previewRefCount -= 1
      if (previewRefCount == 0 && !publishing) {
        cameraCapture?.stop()
        cameraCapture = null
        publishSharedCamera(null)
      }
    }
  }

  override fun flipCamera() {
    moduleScope.launch {
      cameraPosition = if (cameraPosition == CameraPosition.Front) CameraPosition.Back
        else CameraPosition.Front
      try {
        cameraCapture?.switchCamera()
      } catch (e: Exception) {
        emitState("error:${e.message ?: "camera flip failed"}")
      }
    }
  }

  // MARK: - Publish

  override fun publish(sessionId: String, path: String, optsJson: String) {
    if (publishers.containsKey(sessionId)) return
    val s = MoQModule.connectedSession(sessionId) ?: run {
      emitState(sessionId, "error:session is not connected")
      return
    }

    val opts = parseOpts(optsJson)

    moduleScope.launch {
      var startedMic = false
      try {
        val pub = Publisher()
        val ctx = PublisherContext(sessionId, pub)
        ctx.usesCamera = opts.cameraEnabled
        ctx.usesMicrophone = opts.micEnabled
        publishers[sessionId] = ctx

        val tracks = mutableListOf<PublishedTrack>()

        if (opts.cameraEnabled) {
          val owner = lifecycleOwner() ?: error("No foreground activity for camera capture")
          val cam = cameraCapture ?: CameraCapture(position = cameraPosition).also {
            it.start(reactApplicationContext, owner)
            cameraCapture = it
            publishSharedCamera(it)
          }
          val videoConfig = VideoEncoderConfig(
            codec = opts.videoCodec,
            width = opts.width,
            height = opts.height,
            frameRate = opts.framerate,
          )
          tracks += pub.addVideoTrack(name = "camera", source = cam, config = videoConfig)
        }

        if (opts.micEnabled) {
          val mic = microphone ?: MicrophoneCapture(sampleRate = opts.audioSampleRate).also {
            microphone = it
            @Suppress("MissingPermission") it.start()
          }
          microphoneRefCount += 1
          startedMic = true
          val audioConfig = AudioEncoderConfig(
            codec = opts.audioCodec,
            sampleRate = opts.audioSampleRate,
          )
          tracks += pub.addAudioTrack(name = "mic", source = mic, config = audioConfig)
        }

        s.publish(path, pub)
        pub.start()

        observePublisher(ctx, tracks)
      } catch (e: Exception) {
        if (startedMic) {
          microphoneRefCount -= 1
          if (microphoneRefCount <= 0) {
            microphoneRefCount = 0
            microphone?.stop(); microphone = null
          }
        }
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

    if (ctx.usesMicrophone) {
      microphoneRefCount -= 1
      if (microphoneRefCount <= 0) {
        microphoneRefCount = 0
        microphone?.stop(); microphone = null
      }
    }

    // Stop the camera only if neither preview nor any other publisher uses it.
    val cameraStillUsed = previewRefCount > 0 || publishers.values.any { it.usesCamera }
    if (!cameraStillUsed) {
      cameraCapture?.stop()
      cameraCapture = null
      publishSharedCamera(null)
    }

    try { ctx.publisher.stop() } catch (_: Exception) {}

    // Session is owned by MoQModule and stays alive across publish cycles.
    emitState(sessionId, "idle")
  }

  private suspend fun stopAllInternal() {
    for (sid in publishers.keys.toList()) stopInternal(sid)
  }

  override fun invalidate() {
    super.invalidate()
    reactApplicationContext.removeActivityEventListener(this)
    pendingScreenPromise?.reject("module_invalidated", "Module invalidated")
    pendingScreenPromise = null
    stopScreenBroadcastService()
    moduleScope.launch { stopAllInternal() }
    moduleScope.cancel()
  }

  // MARK: - Screen broadcast

  override fun configureScreenBroadcast(url: String, optsJson: String) {
    screenBroadcastUrl = url
    screenBroadcastOptsJson = optsJson
  }

  override fun startScreenBroadcast(promise: Promise) {
    val url = screenBroadcastUrl
    val opts = screenBroadcastOptsJson
    if (url.isNullOrEmpty() || opts == null) {
      promise.reject(
        "not_configured", "configureScreenBroadcast must be called before startScreenBroadcast"
      )
      return
    }
    val activity = currentActivity ?: run {
      promise.reject("no_activity", "No foreground activity available to request screen capture")
      return
    }
    if (pendingScreenPromise != null) {
      promise.reject("in_progress", "A screen broadcast request is already in flight")
      return
    }
    pendingScreenPromise = promise
    val mpm = activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE)
      as MediaProjectionManager
    try {
      activity.startActivityForResult(
        mpm.createScreenCaptureIntent(), screenBroadcastRequestCode
      )
    } catch (e: Exception) {
      pendingScreenPromise = null
      promise.reject("launch_failed", e.message ?: "Failed to launch projection intent")
    }
  }

  override fun stopScreenBroadcast() {
    stopScreenBroadcastService()
  }

  // Mirror moq-kit's iOS demo CodecConfigView gating. JS uses this to hide
  // codec picker options whose encoder would fail to initialize — moq-kit's
  // Android layer reports those failures as a silent stop, so filtering at
  // the UI layer is the only way to keep the publisher from terminating.
  override fun getSupportedCodecs(): WritableMap {
    val map = Arguments.createMap()
    val video = Arguments.createArray()
    VideoEncoderConfig.supportedCodecs().forEach {
      when (it) {
        VideoCodec.H264 -> video.pushString("h264")
        VideoCodec.H265 -> video.pushString("h265")
      }
    }
    val audio = Arguments.createArray()
    AudioEncoderConfig.supportedCodecs().forEach {
      when (it) {
        AudioCodec.OPUS -> audio.pushString("opus")
        AudioCodec.AAC -> audio.pushString("aac")
      }
    }
    map.putArray("video", video)
    map.putArray("audio", audio)
    return map
  }

  private fun stopScreenBroadcastService() {
    val ctx = reactApplicationContext
    val intent = Intent(ctx, MoQScreenBroadcastService::class.java)
      .setAction(MoQScreenBroadcastService.ACTION_STOP)
    try { ctx.startService(intent) } catch (_: Exception) {}
    MoQScreenBroadcastService.stateListener = null
    MoQScreenBroadcastService.trackListener = null
    screenStateListener("idle")
  }

  override fun onActivityResult(
    activity: Activity, requestCode: Int, resultCode: Int, data: Intent?
  ) {
    if (requestCode != screenBroadcastRequestCode) return
    val promise = pendingScreenPromise ?: return
    pendingScreenPromise = null

    if (resultCode != Activity.RESULT_OK || data == null) {
      promise.reject("user_cancelled", "User did not grant screen capture permission")
      return
    }

    val ctx = reactApplicationContext
    MoQScreenBroadcastService.stateListener = screenStateListener
    MoQScreenBroadcastService.trackListener = screenTrackListener

    val serviceIntent = Intent(ctx, MoQScreenBroadcastService::class.java)
      .setAction(MoQScreenBroadcastService.ACTION_START)
      .putExtra(MoQScreenBroadcastService.EXTRA_RESULT_CODE, resultCode)
      .putExtra(MoQScreenBroadcastService.EXTRA_PROJECTION_DATA, data)
      .putExtra(MoQScreenBroadcastService.EXTRA_URL, screenBroadcastUrl)
      .putExtra(MoQScreenBroadcastService.EXTRA_CONFIG_JSON, screenBroadcastOptsJson)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        ctx.startForegroundService(serviceIntent)
      } else {
        ctx.startService(serviceIntent)
      }
      promise.resolve(null)
    } catch (e: Exception) {
      MoQScreenBroadcastService.stateListener = null
      MoQScreenBroadcastService.trackListener = null
      promise.reject("service_start_failed", e.message ?: "Failed to start broadcast service")
    }
  }

  override fun onNewIntent(intent: Intent) {}

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

  // Camera errors (preview / flip) aren't bound to a particular publish
  // session — they may happen before publish() is called. Broadcast to every
  // active publisher so each one transitions to the error state; if none are
  // active, drop the message (preview itself has no state surface in JS).
  private fun emitState(state: String) {
    if (publishers.isEmpty()) return
    for (sid in publishers.keys.toList()) emitState(sid, state)
  }

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

  private fun lifecycleOwner(): LifecycleOwner? =
    (currentActivity as? LifecycleOwner)

  private fun currentActivity(): Activity? = reactApplicationContext.currentActivity

  private fun parsePosition(raw: String): CameraPosition =
    if (raw == "back") CameraPosition.Back else CameraPosition.Front

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

  private data class PublishOpts(
    val cameraEnabled: Boolean,
    val micEnabled: Boolean,
    val videoCodec: VideoCodec,
    val width: Int,
    val height: Int,
    val framerate: Int,
    val audioCodec: AudioCodec,
    val audioSampleRate: Int,
  )

  private fun parseOpts(json: String): PublishOpts {
    val obj = try { JSONObject(json) } catch (_: Exception) { JSONObject() }
    val defaultVideo = if (VideoEncoderConfig.supportedCodecs().contains(VideoCodec.H265))
      VideoCodec.H265 else VideoCodec.H264
    val videoCodec = obj.optString("videoCodec").let {
      when (it) {
        "h264" -> VideoCodec.H264
        "h265" -> VideoCodec.H265
        else -> defaultVideo
      }
    }
    val audioCodec = obj.optString("audioCodec").let {
      when (it) {
        "aac" -> AudioCodec.AAC
        "opus" -> AudioCodec.OPUS
        else -> AudioCodec.OPUS
      }
    }
    return PublishOpts(
      cameraEnabled = obj.optBoolean("cameraEnabled", true),
      micEnabled = obj.optBoolean("micEnabled", true),
      videoCodec = videoCodec,
      width = obj.optInt("width", 1280),
      height = obj.optInt("height", 720),
      framerate = obj.optInt("framerate", 30),
      audioCodec = audioCodec,
      audioSampleRate = obj.optInt("audioSampleRate", 48_000),
    )
  }
}
