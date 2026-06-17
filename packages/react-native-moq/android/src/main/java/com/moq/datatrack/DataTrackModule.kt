package com.moq.datatrack

import com.facebook.react.bridge.ReactApplicationContext
import com.moq.NativeMoQDataTrackSpec
import com.swmansion.moqkit.publish.DataTrackEmitter
import java.nio.charset.StandardCharsets
import java.util.concurrent.ConcurrentHashMap

// Owns the app-side DataTrackEmitters created by useDataTrack, keyed by the id
// the hook assigns. Mirrors MoQKit's model where an emitter is a standalone
// object handed to Publisher.addDataTrack — PublisherModule looks the emitter up
// by id when wiring a data track into a broadcast, and send() pushes payloads
// straight to it.
//
// Unlike the camera/mic modules there is no hardware or refcount; emitters are
// cheap and the map is read from both the JS thread (send) and the publisher
// coroutine, so it's a ConcurrentHashMap.
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

  // Accessed by PublisherModule when wiring the data track into a Publisher.
  internal fun emitter(trackId: String): DataTrackEmitter? = emitters[trackId]

  override fun invalidate() {
    super.invalidate()
    emitters.clear()
    instance = null
  }
}
