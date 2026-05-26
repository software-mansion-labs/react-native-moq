package com.moq

import android.app.Activity
import androidx.lifecycle.LifecycleOwner
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableArray
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.swmansion.moqkit.publish.encoder.VideoCodec
import com.swmansion.moqkit.publish.encoder.VideoEncoderConfig
import com.swmansion.moqkit.publish.source.CameraCapture
import com.swmansion.moqkit.publish.source.CameraPosition
import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

// Owns the device camera as a refcounted singleton. Multiple consumers
// (useCamera hooks, live publishers, the on-screen <PublisherView/>) call
// start/stop independently — the physical camera only stops when the
// refcount drops to zero. Position changes are global to the device, so they
// apply to every consumer at once.
class MoQCameraModule(reactContext: ReactApplicationContext) :
  NativeMoQCameraSpec(reactContext) {

  init {
    instance = this
  }

  private val moduleScope = CoroutineScope(Dispatchers.Main + SupervisorJob())

  private var cameraCapture: CameraCapture? = null
  private var cameraPosition: CameraPosition = CameraPosition.Front
  private var refCount: Int = 0
  // Set while a start is in flight so concurrent consumers (including publish())
  // can await the same Deferred instead of each spinning up their own.
  private var startDeferred: CompletableDeferred<CameraCapture>? = null

  companion object {
    const val NAME = NativeMoQCameraSpec.NAME

    @Volatile var instance: MoQCameraModule? = null
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

  // Awaits any in-flight start so publish() can grab the camera right after
  // the useCamera hook calls startCapture. Throws if no consumer has asked
  // for the camera at all.
  internal suspend fun waitForCamera(): CameraCapture {
    cameraCapture?.let { return it }
    startDeferred?.let { return it.await() }
    throw MoQCaptureException("camera capture not started")
  }

  override fun startCapture(position: String) {
    val pos = parsePosition(position)
    moduleScope.launch { startCaptureInternal(pos) }
  }

  override fun stopCapture() {
    moduleScope.launch { stopCaptureInternal() }
  }

  override fun setPosition(position: String) {
    val pos = parsePosition(position)
    moduleScope.launch { setPositionInternal(pos) }
  }

  // Mirror moq-kit's iOS demo CodecConfigView gating. JS uses this to hide
  // codec picker options whose encoder would fail to initialize.
  override fun getSupportedCodecs(): WritableArray {
    val arr = Arguments.createArray()
    VideoEncoderConfig.supportedCodecs().forEach {
      when (it) {
        VideoCodec.H264 -> arr.pushString("h264")
        VideoCodec.H265 -> arr.pushString("h265")
      }
    }
    return arr
  }

  override fun invalidate() {
    super.invalidate()
    moduleScope.cancel()
    cameraCapture?.stop()
    cameraCapture = null
    publishSharedCamera(null)
    instance = null
  }

  private suspend fun startCaptureInternal(position: CameraPosition) {
    refCount += 1
    cameraPosition = position
    if (cameraCapture != null || startDeferred != null) return

    val owner = lifecycleOwner() ?: run {
      if (refCount > 0) refCount -= 1
      emitState("error:No foreground activity for camera capture")
      return
    }

    emitState("starting")

    val deferred = CompletableDeferred<CameraCapture>()
    startDeferred = deferred

    try {
      val cam = CameraCapture(position = position)
      cam.start(reactApplicationContext, owner)
      // Consumer might have called stopCapture while we were starting.
      if (refCount == 0) {
        cam.stop()
        startDeferred = null
        deferred.completeExceptionally(
          MoQCaptureException("camera capture cancelled before start completed"))
        emitState("idle")
        return
      }
      cameraCapture = cam
      startDeferred = null
      publishSharedCamera(cam)
      deferred.complete(cam)
      emitState("active")
    } catch (e: Exception) {
      startDeferred = null
      if (refCount > 0) refCount -= 1
      deferred.completeExceptionally(e)
      emitState("error:${e.message ?: "camera start failed"}")
    }
  }

  private fun stopCaptureInternal() {
    if (refCount > 0) refCount -= 1
    if (refCount > 0) return
    cameraCapture?.stop()
    cameraCapture = null
    publishSharedCamera(null)
    emitState("idle")
  }

  private suspend fun setPositionInternal(position: CameraPosition) {
    if (position == cameraPosition) return
    cameraPosition = position
    try {
      cameraCapture?.switchCamera()
    } catch (e: Exception) {
      emitState("error:${e.message ?: "camera switch failed"}")
    }
  }

  private fun emitState(state: String) {
    val map = Arguments.createMap()
    map.putString("state", state)
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("cameraStateChanged", map)
  }

  private fun lifecycleOwner(): LifecycleOwner? =
    (reactApplicationContext.currentActivity as? LifecycleOwner)

  private fun parsePosition(raw: String): CameraPosition =
    if (raw == "back") CameraPosition.Back else CameraPosition.Front
}

class MoQCaptureException(message: String) : RuntimeException(message)
