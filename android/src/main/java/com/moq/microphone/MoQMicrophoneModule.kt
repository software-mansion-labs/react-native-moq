package com.moq.microphone

import com.facebook.react.bridge.Arguments
import com.moq.NativeMoQMicrophoneSpec
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableArray
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.moq.camera.MoQCaptureException
import com.swmansion.moqkit.publish.encoder.AudioCodec
import com.swmansion.moqkit.publish.encoder.AudioEncoderConfig
import com.swmansion.moqkit.publish.source.MicrophoneCapture
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

// Owns the device microphone as a refcounted singleton. Multiple consumers
// (useMicrophone hooks, live publishers) call start/stop independently — the
// physical mic only stops when the refcount drops to zero.
class MoQMicrophoneModule(reactContext: ReactApplicationContext) :
  NativeMoQMicrophoneSpec(reactContext) {

  init {
    instance = this
  }

  private val moduleScope = CoroutineScope(Dispatchers.Main + SupervisorJob())

  private var microphone: MicrophoneCapture? = null
  private var refCount: Int = 0
  private var startDeferred: CompletableDeferred<MicrophoneCapture>? = null

  companion object {
    const val NAME = NativeMoQMicrophoneSpec.NAME

    @Volatile var instance: MoQMicrophoneModule? = null
      private set
  }

  override fun addListener(eventName: String) {}
  override fun removeListeners(count: Double) {}

  internal suspend fun waitForMicrophone(): MicrophoneCapture {
    microphone?.let { return it }
    startDeferred?.let { return it.await() }
    throw MoQCaptureException("microphone capture not started")
  }

  override fun startCapture(sampleRate: Double) {
    moduleScope.launch { startCaptureInternal(sampleRate.toInt()) }
  }

  override fun stopCapture() {
    moduleScope.launch { stopCaptureInternal() }
  }

  override fun getSupportedCodecs(): WritableArray {
    val arr = Arguments.createArray()
    AudioEncoderConfig.supportedCodecs().forEach {
      when (it) {
        AudioCodec.OPUS -> arr.pushString("opus")
        AudioCodec.AAC -> arr.pushString("aac")
      }
    }
    return arr
  }

  override fun invalidate() {
    super.invalidate()
    moduleScope.cancel()
    microphone?.stop()
    microphone = null
    instance = null
  }

  private suspend fun startCaptureInternal(sampleRate: Int) {
    refCount += 1
    if (microphone != null || startDeferred != null) return

    emitState("starting")
    val deferred = CompletableDeferred<MicrophoneCapture>()
    startDeferred = deferred

    try {
      val mic = MicrophoneCapture(sampleRate = sampleRate)
      @Suppress("MissingPermission") mic.start()
      if (refCount == 0) {
        mic.stop()
        startDeferred = null
        deferred.completeExceptionally(
          MoQCaptureException("microphone capture cancelled before start completed"))
        emitState("idle")
        return
      }
      microphone = mic
      startDeferred = null
      deferred.complete(mic)
      emitState("active")
    } catch (e: Exception) {
      startDeferred = null
      if (refCount > 0) refCount -= 1
      deferred.completeExceptionally(e)
      emitState("error:${e.message ?: "microphone start failed"}")
    }
  }

  private fun stopCaptureInternal() {
    if (refCount > 0) refCount -= 1
    if (refCount > 0) return
    microphone?.stop()
    microphone = null
    emitState("idle")
  }

  private fun emitState(state: String) {
    val map = Arguments.createMap()
    map.putString("state", state)
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("micStateChanged", map)
  }
}
