package com.moq.datatrack

import com.facebook.react.bridge.ReactApplicationContext
import com.moq.NativeMoQDataTrackSpec
import com.swmansion.moqkit.publish.DataTrackEmitter
import java.nio.charset.StandardCharsets
import java.util.concurrent.ConcurrentHashMap

// Owns the app-side DataTrackEmitters, keyed by id. The map is read from both
// the JS thread (send) and the publisher coroutine, hence ConcurrentHashMap.
class DataTrackModule(reactContext: ReactApplicationContext) :
  NativeMoQDataTrackSpec(reactContext) {

  init {
    instance = this
  }

  private val emitters = ConcurrentHashMap<String, DataTrackEmitter>()

  companion object {
    const val NAME = NativeMoQDataTrackSpec.NAME

    @Volatile var instance: DataTrackModule? = null
      private set
  }

  override fun create(trackId: String) {
    emitters.getOrPut(trackId) { DataTrackEmitter() }
  }

  override fun destroy(trackId: String) {
    emitters.remove(trackId)
  }

  override fun send(trackId: String, payload: String) {
    val emitter = emitters[trackId] ?: return
    try {
      emitter.send(payload.toByteArray(StandardCharsets.UTF_8))
    } catch (_: Exception) {
    }
  }

  internal fun emitter(trackId: String): DataTrackEmitter? = emitters[trackId]

  override fun invalidate() {
    super.invalidate()
    emitters.clear()
    instance = null
  }
}
