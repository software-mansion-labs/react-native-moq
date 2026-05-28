package com.moq.screenbroadcast

import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.swmansion.moqkit.Session
import com.swmansion.moqkit.publish.Publisher
import com.swmansion.moqkit.publish.PublisherEvent
import com.swmansion.moqkit.publish.PublisherState
import com.swmansion.moqkit.publish.encoder.AudioCodec
import com.swmansion.moqkit.publish.encoder.AudioEncoderConfig
import com.swmansion.moqkit.publish.encoder.VideoCodec
import com.swmansion.moqkit.publish.encoder.VideoEncoderConfig
import com.swmansion.moqkit.publish.source.MicrophoneCapture
import com.swmansion.moqkit.publish.source.ScreenCapture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import org.json.JSONObject

// Foreground service that runs the MediaProjection-backed screen broadcast.
// Same process as the host app, so it talks back to PublisherModule via
// the stateListener callback (set by the module right before starting us).
class ScreenBroadcastService : Service() {

  companion object {
    const val ACTION_START = "com.moq.screen.start"
    const val ACTION_STOP = "com.moq.screen.stop"
    const val EXTRA_RESULT_CODE = "resultCode"
    const val EXTRA_PROJECTION_DATA = "projectionData"
    const val EXTRA_URL = "url"
    const val EXTRA_CONFIG_JSON = "configJson"

    private const val CHANNEL_ID = "moq_screen_broadcast"
    private const val NOTIFICATION_ID = 0xCA51

    // Single listener — only one broadcast in flight at a time. The module
    // sets this right before starting the service and clears it on stop.
    @Volatile var stateListener: ((state: String) -> Unit)? = null
    @Volatile var trackListener: ((name: String, state: String, error: String?) -> Unit)? = null
  }

  private val serviceScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
  private var session: Session? = null
  private var publisher: Publisher? = null
  private var screenCapture: ScreenCapture? = null
  private var microphone: MicrophoneCapture? = null
  private val flowJobs = mutableListOf<Job>()

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        serviceScope.launch {
          teardown()
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
          } else {
            @Suppress("DEPRECATION") stopForeground(true)
          }
          stopSelf()
        }
      }
      ACTION_START -> {
        startForegroundCompat()
        startBroadcast(intent)
      }
      else -> {
        // Service restarted with null intent; just shut down.
        stopSelf()
      }
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    super.onDestroy()
    serviceScope.cancel()
    stateListener = null
    trackListener = null
  }

  private fun startForegroundCompat() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val nm = getSystemService(NotificationManager::class.java)
      if (nm.getNotificationChannel(CHANNEL_ID) == null) {
        nm.createNotificationChannel(
          NotificationChannel(
            CHANNEL_ID,
            "Screen broadcast",
            NotificationManager.IMPORTANCE_LOW
          )
        )
      }
    }
    val notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Screen broadcast")
      .setContentText("MoQ is sharing your screen")
      .setSmallIcon(android.R.drawable.ic_menu_share)
      .setOngoing(true)
      .build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun startBroadcast(intent: Intent) {
    val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, Activity.RESULT_CANCELED)
    @Suppress("DEPRECATION")
    val projectionData: Intent? =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        intent.getParcelableExtra(EXTRA_PROJECTION_DATA, Intent::class.java)
      } else {
        intent.getParcelableExtra(EXTRA_PROJECTION_DATA)
      }
    val url = intent.getStringExtra(EXTRA_URL).orEmpty()
    val configJson = intent.getStringExtra(EXTRA_CONFIG_JSON).orEmpty()

    if (projectionData == null || url.isEmpty()) {
      emitState("error:Missing projection data or relay URL")
      stopSelf()
      return
    }

    val opts = parseScreenOpts(configJson)
    if (opts.path.isEmpty()) {
      emitState("error:Missing screen broadcast path")
      stopSelf()
      return
    }

    emitState("connecting")

    serviceScope.launch {
      try {
        val s = Session(url = url, parentScope = serviceScope)
        session = s

        flowJobs += s.state.onEach { state ->
          when (state) {
            Session.State.Idle -> {}
            Session.State.Connecting -> emitState("connecting")
            Session.State.Connected -> {}
            Session.State.Closed -> emitState("stopped")
            is Session.State.Error -> emitState("error:${state.message}")
          }
        }.launchIn(serviceScope)

        s.connect()

        val pub = Publisher()
        publisher = pub

        val metrics = resources.displayMetrics
        val rawWidth = if (opts.width > 0) opts.width else metrics.widthPixels
        val rawHeight = if (opts.height > 0) opts.height else metrics.heightPixels
        val (width, height) = fitEncoderEnvelope(rawWidth, rawHeight)
        val fps = if (opts.framerate > 0) opts.framerate else 30

        val screen = ScreenCapture(
          intent = projectionData,
          resultCode = resultCode,
          width = width,
          height = height,
          frameRate = fps,
        )
        screenCapture = screen
        screen.start(this@ScreenBroadcastService)

        pub.addVideoTrack(
          name = "screen",
          source = screen,
          config = VideoEncoderConfig(
            codec = opts.videoCodec,
            width = width,
            height = height,
            frameRate = fps,
          ),
        )

        if (opts.mic) {
          val mic = MicrophoneCapture(sampleRate = opts.audioSampleRate)
          microphone = mic
          @Suppress("MissingPermission") mic.start()
          pub.addAudioTrack(
            name = "screen-mic",
            source = mic,
            config = AudioEncoderConfig(
              codec = opts.audioCodec,
              sampleRate = opts.audioSampleRate,
            ),
          )
        }

        flowJobs += pub.state.onEach { state ->
          when (state) {
            PublisherState.Idle -> {}
            PublisherState.Publishing -> emitState("broadcasting")
            PublisherState.Stopped -> emitState("stopped")
            is PublisherState.Error -> emitState("error:${state.message}")
          }
        }.launchIn(serviceScope)

        flowJobs += pub.events.onEach { event ->
          when (event) {
            is PublisherEvent.TrackStarted ->
              trackListener?.invoke(event.name, "active", null)
            is PublisherEvent.TrackStopped ->
              trackListener?.invoke(event.name, "stopped", null)
            is PublisherEvent.TrackError ->
              trackListener?.invoke(event.name, "stopped", event.message)
          }
        }.launchIn(serviceScope)

        s.publish(opts.path, pub)
        pub.start()
      } catch (e: Exception) {
        emitState("error:${e.message ?: "screen broadcast failed"}")
        teardown()
        stopSelf()
      }
    }
  }

  private suspend fun teardown() {
    flowJobs.forEach { it.cancel() }
    flowJobs.clear()

    val pub = publisher
    val sess = session
    publisher = null
    session = null

    microphone?.stop(); microphone = null
    screenCapture?.stop(); screenCapture = null

    try { pub?.stop() } catch (_: Exception) {}
    sess?.close()
  }

  private fun emitState(state: String) {
    stateListener?.invoke(state)
  }

  private data class ScreenOpts(
    val path: String,
    val mic: Boolean,
    val videoCodec: VideoCodec,
    val width: Int,
    val height: Int,
    val framerate: Int,
    val audioCodec: AudioCodec,
    val audioSampleRate: Int,
  )

  // Phone screens are commonly 1080x2400 or larger — at H264's default
  // profile-level many MediaCodec encoders refuse those dimensions and
  // findEncoderForFormat() returns null. Scale to fit a 1920x1080 envelope
  // (long edge ≤ 1920, short edge ≤ 1080), preserve aspect, ensure even.
  private fun fitEncoderEnvelope(width: Int, height: Int): Pair<Int, Int> {
    val maxLong = 1920
    val maxShort = 1080
    val longSide = maxOf(width, height)
    val shortSide = minOf(width, height)
    val scale = minOf(
      1.0,
      maxLong.toDouble() / longSide,
      maxShort.toDouble() / shortSide,
    )
    val scaledW = (width * scale).toInt().let { if (it % 2 == 0) it else it - 1 }
    val scaledH = (height * scale).toInt().let { if (it % 2 == 0) it else it - 1 }
    return scaledW to scaledH
  }

  private fun parseScreenOpts(json: String): ScreenOpts {
    val obj = try { JSONObject(json) } catch (_: Exception) { JSONObject() }
    val defaultVideo = if (VideoEncoderConfig.supportedCodecs().contains(VideoCodec.H265))
      VideoCodec.H265 else VideoCodec.H264
    val videoCodec = when (obj.optString("videoCodec")) {
      "h264" -> VideoCodec.H264
      "h265" -> VideoCodec.H265
      else -> defaultVideo
    }
    val audioCodec = when (obj.optString("audioCodec")) {
      "aac" -> AudioCodec.AAC
      "opus" -> AudioCodec.OPUS
      else -> AudioCodec.OPUS
    }
    return ScreenOpts(
      path = obj.optString("path"),
      mic = obj.optBoolean("mic", true),
      videoCodec = videoCodec,
      width = obj.optInt("width", 0),
      height = obj.optInt("height", 0),
      framerate = obj.optInt("framerate", 0),
      audioCodec = audioCodec,
      audioSampleRate = obj.optInt("audioSampleRate", 48_000),
    )
  }
}
