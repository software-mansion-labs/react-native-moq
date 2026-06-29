package com.moq.camera

import androidx.lifecycle.LifecycleOwner
import com.facebook.react.bridge.Arguments
import com.moq.NativeMoQCameraSpec
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableArray
import com.moq.capture.CaptureException
import com.moq.capture.RefcountedCapture
import com.moq.capture.toJsString
import com.moq.emitStateEvent
import com.swmansion.moqkit.publish.encoder.VideoEncoderConfig
import com.swmansion.moqkit.publish.source.CameraCapture
import com.swmansion.moqkit.publish.source.CameraPosition
import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

// Owns the device camera as a refcounted singleton (see RefcountedCapture).
// Multiple consumers (useCamera hooks, live publishers, the on-screen
// <PublisherView/>) call start/stop independently — the physical camera only
// stops when the refcount drops to zero. Position changes are global to the
// device, so they apply to every consumer at once.
class CameraModule(reactContext: ReactApplicationContext) :
  NativeMoQCameraSpec(reactContext) {

  init {
    instance = this
  }

  private val moduleScope = CoroutineScope(Dispatchers.Main + SupervisorJob())

  private val manager = RefcountedCapture<CameraCapture>(
    label = "camera",
    emitState = { reactApplicationContext.emitStateEvent("cameraStateChanged", it) },
    stopCapture = { it.stop() },
    onActive = { publishSharedCamera(it) },
    onInactive = { publishSharedCamera(null) },
  )

  private var cameraPosition: CameraPosition = CameraPosition.Front

  companion object {
    const val NAME = NativeMoQCameraSpec.NAME

    @Volatile var instance: CameraModule? = null
      private set

    // Static listener list for the preview view — it talks to the camera
    // through the singleton because views can't easily hold a module reference.
    private val cameraListeners = CopyOnWriteArrayList<() -> Unit>()

    fun addCameraListener(listener: () -> Unit) { cameraListeners.add(listener) }
    fun removeCameraListener(listener: () -> Unit) { cameraListeners.remove(listener) }

    @Volatile var sharedCameraCapture: CameraCapture? = null
      private set
  }

  private fun publishSharedCamera(cam: CameraCapture?) {
    sharedCameraCapture = cam
    cameraListeners.forEach { it() }
  }

  override fun addListener(eventName: String) {}
  override fun removeListeners(count: Double) {}

  // Awaits any in-flight start so publish() can grab the camera right after the
  // useCamera hook calls startCapture.
  internal suspend fun waitForCamera(): CameraCapture = manager.waitForCapture()

  override fun startCapture(position: String) {
    val pos = parsePosition(position)
    moduleScope.launch {
      cameraPosition = pos
      manager.start(
        preflight = {
          if (lifecycleOwner() == null) "No foreground activity for camera capture"
          else null
        },
        make = {
          val owner = lifecycleOwner()
            ?: throw CaptureException("No foreground activity for camera capture")
          val cam = CameraCapture(position = pos)
          cam.start(reactApplicationContext, owner)
          cam
        },
      )
    }
  }

  override fun stopCapture() {
    moduleScope.launch { manager.stop() }
  }

  override fun setPosition(position: String) {
    val pos = parsePosition(position)
    moduleScope.launch { setPositionInternal(pos) }
  }

  // Mirror moq-kit's iOS demo CodecConfigView gating. JS uses this to hide
  // codec picker options whose encoder would fail to initialize.
  override fun getSupportedCodecs(): WritableArray {
    val arr = Arguments.createArray()
    VideoEncoderConfig.supportedCodecs().forEach { arr.pushString(it.toJsString()) }
    return arr
  }

  override fun invalidate() {
    super.invalidate()
    moduleScope.cancel()
    manager.current()?.stop()
    publishSharedCamera(null)
    instance = null
  }

  private suspend fun setPositionInternal(position: CameraPosition) {
    if (position == cameraPosition) return
    cameraPosition = position
    try {
      manager.current()?.switchCamera()
    } catch (e: Exception) {
      reactApplicationContext.emitStateEvent(
        "cameraStateChanged", "error:${e.message ?: "camera switch failed"}")
    }
  }

  private fun lifecycleOwner(): LifecycleOwner? =
    (reactApplicationContext.currentActivity as? LifecycleOwner)

  private fun parsePosition(raw: String): CameraPosition =
    if (raw == "back") CameraPosition.Back else CameraPosition.Front
}
