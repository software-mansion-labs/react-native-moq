package com.moq.microphone

import com.facebook.react.bridge.Arguments
import com.moq.NativeMoQMicrophoneSpec
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableArray
import com.moq.capture.RefcountedCapture
import com.moq.capture.toJsString
import com.moq.emitStateEvent
import com.swmansion.moqkit.publish.encoder.AudioEncoderConfig
import com.swmansion.moqkit.publish.source.MicrophoneCapture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

// Owns the device microphone as a refcounted singleton (see RefcountedCapture).
class MicrophoneModule(reactContext: ReactApplicationContext) :
  NativeMoQMicrophoneSpec(reactContext) {

  init {
    instance = this
  }

  private val moduleScope = CoroutineScope(Dispatchers.Main + SupervisorJob())

  private val manager = RefcountedCapture<MicrophoneCapture>(
    label = "microphone",
    emitState = { reactApplicationContext.emitStateEvent("micStateChanged", it) },
    stopCapture = { it.stop() },
  )

  companion object {
    const val NAME = NativeMoQMicrophoneSpec.NAME

    @Volatile var instance: MicrophoneModule? = null
      private set
  }

  override fun addListener(eventName: String) {}
  override fun removeListeners(count: Double) {}

  internal suspend fun waitForMicrophone(): MicrophoneCapture = manager.waitForCapture()

  override fun startCapture(sampleRate: Double) {
    val rate = sampleRate.toInt()
    moduleScope.launch {
      manager.start {
        val mic = MicrophoneCapture(sampleRate = rate)
        @Suppress("MissingPermission") mic.start()
        mic
      }
    }
  }

  override fun stopCapture() {
    moduleScope.launch { manager.stop() }
  }

  override fun getSupportedCodecs(): WritableArray {
    val arr = Arguments.createArray()
    AudioEncoderConfig.supportedCodecs().forEach { arr.pushString(it.toJsString()) }
    return arr
  }

  override fun invalidate() {
    super.invalidate()
    moduleScope.cancel()
    manager.current()?.stop()
    instance = null
  }
}
