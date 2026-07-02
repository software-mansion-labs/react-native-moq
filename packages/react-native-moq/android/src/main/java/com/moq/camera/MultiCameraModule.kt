package com.moq.camera

import androidx.lifecycle.LifecycleOwner
import com.facebook.react.bridge.Promise
import com.moq.NativeMoQMultiCameraSpec
import com.facebook.react.bridge.ReactApplicationContext
import com.moq.capture.CaptureException
import com.moq.capture.RefcountedCapture
import com.moq.emitStateEvent
import com.swmansion.moqkit.publish.source.CameraPosition
import com.swmansion.moqkit.publish.source.CameraStreamConfig
import com.swmansion.moqkit.publish.source.MultiCameraCapture
import com.swmansion.moqkit.publish.source.VideoFrameSource
import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

// Refcounted singleton owning the concurrent front+back capture, mirroring
// CameraModule. Cameras are fixed front/back with no position switching.
class MultiCameraModule(reactContext: ReactApplicationContext) :
  NativeMoQMultiCameraSpec(reactContext) {

  init {
    instance = this
  }

  private val moduleScope = CoroutineScope(Dispatchers.Main + SupervisorJob())

  private val manager = RefcountedCapture<MultiCameraCapture>(
    label = "multi-camera",
    emitState = { reactApplicationContext.emitStateEvent("multiCameraStateChanged", it) },
    stopCapture = { it.stop() },
    onActive = { publishSharedSources(it) },
    onInactive = { publishSharedSources(null) },
  )

  private var width: Int = 720
  private var height: Int = 1280
  private var frameRate: Int = 30

  companion object {
    const val NAME = NativeMoQMultiCameraSpec.NAME

    @Volatile var instance: MultiCameraModule? = null
      private set

    // Preview views reach the capture via the singleton; they can't hold a module ref.
    private val listeners = CopyOnWriteArrayList<() -> Unit>()

    fun addListener(listener: () -> Unit) { listeners.add(listener) }
    fun removeListener(listener: () -> Unit) { listeners.remove(listener) }

    @Volatile var sharedFrontSource: VideoFrameSource? = null
      private set

    @Volatile var sharedBackSource: VideoFrameSource? = null
      private set
  }

  private fun publishSharedSources(cap: MultiCameraCapture?) {
    sharedFrontSource = cap?.frontSource
    sharedBackSource = cap?.backSource
    listeners.forEach { it() }
  }

  override fun addListener(eventName: String) {}
  override fun removeListeners(count: Double) {}

  override fun isSupported(promise: Promise) {
    moduleScope.launch {
      try {
        val ctx = reactApplicationContext
        val supported = MultiCameraCapture.isSupported(ctx) &&
          MultiCameraCapture.isFrontBackSupported(ctx)
        promise.resolve(supported)
      } catch (e: Exception) {
        promise.resolve(false)
      }
    }
  }

  // Awaits any in-flight start so publish() can grab the capture after startCapture.
  internal suspend fun waitForCapture(): MultiCameraCapture = manager.waitForCapture()

  override fun startCapture(width: Double, height: Double, framerate: Double) {
    moduleScope.launch {
      this@MultiCameraModule.width = width.toInt()
      this@MultiCameraModule.height = height.toInt()
      this@MultiCameraModule.frameRate = framerate.toInt()
      val w = width.toInt()
      val h = height.toInt()
      val fps = framerate.toInt()
      manager.start(
        preflight = {
          when {
            lifecycleOwner() == null -> "No foreground activity for camera capture"
            !MultiCameraCapture.isSupported(reactApplicationContext) ->
              "multi-camera is not supported on this device"
            else -> null
          }
        },
        make = {
          val owner = lifecycleOwner()
            ?: throw CaptureException("No foreground activity for camera capture")
          val cap = MultiCameraCapture(
            front = CameraStreamConfig(CameraPosition.Front, w, h, fps),
            back = CameraStreamConfig(CameraPosition.Back, w, h, fps),
          )
          cap.start(reactApplicationContext, owner)
          cap
        },
      )
    }
  }

  override fun stopCapture() {
    moduleScope.launch { manager.stop() }
  }

  override fun invalidate() {
    super.invalidate()
    moduleScope.cancel()
    manager.current()?.stop()
    publishSharedSources(null)
    instance = null
  }

  private fun lifecycleOwner(): LifecycleOwner? =
    (reactApplicationContext.currentActivity as? LifecycleOwner)
}
