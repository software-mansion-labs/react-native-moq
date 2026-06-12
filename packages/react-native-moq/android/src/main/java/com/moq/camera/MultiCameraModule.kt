package com.moq.camera

import androidx.lifecycle.LifecycleOwner
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.moq.NativeMoQMultiCameraSpec
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.swmansion.moqkit.publish.source.CameraPosition
import com.swmansion.moqkit.publish.source.CameraStreamConfig
import com.swmansion.moqkit.publish.source.MultiCameraCapture
import com.swmansion.moqkit.publish.source.VideoFrameSource
import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

// Owns the concurrent front+back capture as a refcounted singleton, mirroring
// CameraModule. Multiple consumers (useMultiCamera hooks, live publishers, the
// on-screen <PublisherView/>s) call start/stop independently — the cameras only
// stop when the refcount drops to zero. Unlike CameraModule there's no position
// switching; the two cameras are fixed front/back.
class MultiCameraModule(reactContext: ReactApplicationContext) :
  NativeMoQMultiCameraSpec(reactContext) {

  init {
    instance = this
  }

  private val moduleScope = CoroutineScope(Dispatchers.Main + SupervisorJob())

  private var capture: MultiCameraCapture? = null
  private var width: Int = 720
  private var height: Int = 1280
  private var frameRate: Int = 30
  private var refCount: Int = 0
  // Set while a start is in flight so concurrent consumers (including publish())
  // can await the same Deferred instead of each spinning up their own.
  private var startDeferred: CompletableDeferred<MultiCameraCapture>? = null

  companion object {
    const val NAME = NativeMoQMultiCameraSpec.NAME

    @Volatile var instance: MultiCameraModule? = null
      private set

    // Static listener list for the preview views — they talk to the capture
    // through the singleton because views can't easily hold a module reference.
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

  // Awaits any in-flight start so publish() can grab the capture right after
  // the useMultiCamera hook calls startCapture. Throws if no consumer has asked
  // for the capture at all.
  internal suspend fun waitForCapture(): MultiCameraCapture {
    capture?.let { return it }
    startDeferred?.let { return it.await() }
    throw CaptureException("multi-camera capture not started")
  }

  override fun startCapture(width: Double, height: Double, framerate: Double) {
    moduleScope.launch {
      startCaptureInternal(width.toInt(), height.toInt(), framerate.toInt())
    }
  }

  override fun stopCapture() {
    moduleScope.launch { stopCaptureInternal() }
  }

  override fun invalidate() {
    super.invalidate()
    moduleScope.cancel()
    capture?.stop()
    capture = null
    publishSharedSources(null)
    instance = null
  }

  private suspend fun startCaptureInternal(width: Int, height: Int, frameRate: Int) {
    refCount += 1
    this.width = width
    this.height = height
    this.frameRate = frameRate
    if (capture != null || startDeferred != null) return

    val owner = lifecycleOwner() ?: run {
      if (refCount > 0) refCount -= 1
      emitState("error:No foreground activity for camera capture")
      return
    }

    if (!MultiCameraCapture.isSupported(reactApplicationContext)) {
      if (refCount > 0) refCount -= 1
      emitState("error:multi-camera is not supported on this device")
      return
    }

    emitState("starting")

    val deferred = CompletableDeferred<MultiCameraCapture>()
    startDeferred = deferred

    try {
      val cap = MultiCameraCapture(
        front = CameraStreamConfig(CameraPosition.Front, width, height, frameRate),
        back = CameraStreamConfig(CameraPosition.Back, width, height, frameRate),
      )
      cap.start(reactApplicationContext, owner)
      // Consumer might have called stopCapture while we were starting.
      if (refCount == 0) {
        cap.stop()
        startDeferred = null
        deferred.completeExceptionally(
          CaptureException("multi-camera capture cancelled before start completed"))
        emitState("idle")
        return
      }
      capture = cap
      startDeferred = null
      publishSharedSources(cap)
      deferred.complete(cap)
      emitState("active")
    } catch (e: Exception) {
      startDeferred = null
      if (refCount > 0) refCount -= 1
      deferred.completeExceptionally(e)
      emitState("error:${e.message ?: "multi-camera start failed"}")
    }
  }

  private fun stopCaptureInternal() {
    if (refCount > 0) refCount -= 1
    if (refCount > 0) return
    capture?.stop()
    capture = null
    publishSharedSources(null)
    emitState("idle")
  }

  private fun emitState(state: String) {
    val map = Arguments.createMap()
    map.putString("state", state)
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("multiCameraStateChanged", map)
  }

  private fun lifecycleOwner(): LifecycleOwner? =
    (reactApplicationContext.currentActivity as? LifecycleOwner)
}
