package com.moq.videosource

import android.graphics.Bitmap
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.view.Surface
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.moq.NativeMoQVideoSourceSpec
import com.swmansion.moqkit.publish.source.VideoFrameSource
import java.util.Arrays
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

private const val TAG = "VideoSourceModule"

// Owns the app-side push video sources, keyed by id. The map is read from both
// the JS thread (pushFrame) and the publisher coroutine, hence ConcurrentHashMap.
class VideoSourceModule(reactContext: ReactApplicationContext) :
  NativeMoQVideoSourceSpec(reactContext) {

  init {
    instance = this
  }

  private val sources = ConcurrentHashMap<String, PushVideoSource>()

  companion object {
    const val NAME = NativeMoQVideoSourceSpec.NAME

    @Volatile var instance: VideoSourceModule? = null
      private set
  }

  override fun create(
    trackId: String,
    width: Double,
    height: Double,
    poolSize: Double,
    promise: Promise,
  ) {
    val w = width.toInt()
    val h = height.toInt()
    val slots = maxOf(1, poolSize.toInt())
    if (w <= 0 || h <= 0) {
      promise.reject("E_VIDEO_SOURCE", "invalid dimensions ${w}x$h")
      return
    }
    val source = try {
      PushVideoSource(w, h, slots)
    } catch (e: Exception) {
      promise.reject("E_VIDEO_SOURCE", "failed to allocate buffer pool: ${e.message}")
      return
    }
    sources.put(trackId, source)?.release()

    val descriptors = Arguments.createArray()
    for (i in 0 until slots) {
      val map = Arguments.createMap()
      map.putInt("index", i)
      // No JS-importable GPU handle on Android (slots are bitmaps drawn onto the
      // encoder surface natively); '0' keeps the descriptor shape uniform with iOS.
      map.putString("surfaceHandle", "0")
      map.putInt("width", w)
      map.putInt("height", h)
      descriptors.pushMap(map)
    }
    promise.resolve(descriptors)
  }

  override fun destroy(trackId: String) {
    sources.remove(trackId)?.release()
  }

  override fun pushFrame(
    trackId: String,
    bufferIndex: Double,
    timestampNs: Double,
    fenceHandle: String,
    fenceValue: String,
  ) {
    // timestampNs and the fence are iOS-only: the Canvas path stamps the monotonic
    // clock when the frame is posted (the recommended default) and can't wait on
    // app GPU fences.
    sources[trackId]?.push(bufferIndex.toInt())
  }

  override fun fillTestPattern(trackId: String, bufferIndex: Double, frameIndex: Double) {
    sources[trackId]?.fillTestPattern(bufferIndex.toInt(), frameIndex.toInt())
  }

  internal fun source(trackId: String): PushVideoSource? = sources[trackId]

  override fun invalidate() {
    super.invalidate()
    sources.values.forEach { it.release() }
    sources.clear()
    instance = null
  }
}

/**
 * A [VideoFrameSource] fed by app-rendered frames from a fixed pool of bitmaps.
 * The publisher attaches the encoder's input [Surface] on track start; each push
 * names a pool slot, which is drawn onto that surface with a hardware canvas on a
 * dedicated thread so pushes never block the JS thread on encoder back-pressure.
 * Frames are timestamped by the surface queue with the monotonic clock at post
 * time, keeping the track aligned with camera/mic (see the iOS PushVideoSource).
 */
internal class PushVideoSource(width: Int, height: Int, poolSize: Int) : VideoFrameSource {
  private val bitmaps =
    Array(poolSize) { Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888) }
  // Test-pattern scratch row; fillTestPattern only runs on the JS thread.
  private val rowScratch = IntArray(width)

  private val thread = HandlerThread("PushVideoSource").apply { start() }
  private val handler = Handler(thread.looper)
  // Draws queued but not yet run; pushes are dropped past the pool size so an
  // encoder stall can't grow the queue unboundedly.
  private val pendingDraws = AtomicInteger(0)

  // Guards surface against a draw racing detachEncoderSurface(): the publisher
  // releases the surface right after detaching, so a draw must never start on one
  // being torn down.
  private val lock = Any()
  private var surface: Surface? = null

  override fun attachEncoderSurface(surface: Surface) {
    synchronized(lock) { this.surface = surface }
  }

  override fun detachEncoderSurface() {
    synchronized(lock) { surface = null }
  }

  // Custom sources have no built-in preview; apps render their own UI.
  override fun setPreviewSurface(surface: Surface?) {}

  fun push(bufferIndex: Int) {
    val bitmap = bitmaps.getOrNull(bufferIndex) ?: return
    if (pendingDraws.get() > bitmaps.size) return
    pendingDraws.incrementAndGet()
    handler.post {
      try {
        draw(bitmap)
      } finally {
        pendingDraws.decrementAndGet()
      }
    }
  }

  private fun draw(bitmap: Bitmap) {
    synchronized(lock) {
      val surface = surface ?: return
      if (!surface.isValid) return
      try {
        // MediaCodec input surfaces only accept hardware-accelerated rendering;
        // lockCanvas (software) is documented to fail on them.
        val canvas = surface.lockHardwareCanvas()
        try {
          canvas.drawBitmap(bitmap, 0f, 0f, null)
        } finally {
          surface.unlockCanvasAndPost(canvas)
        }
      } catch (e: Exception) {
        Log.w(TAG, "Frame draw failed: $e")
      }
    }
  }

  // Same animated bands as the iOS pool, for cross-platform visual parity.
  fun fillTestPattern(bufferIndex: Int, frameIndex: Int) {
    val bitmap = bitmaps.getOrNull(bufferIndex) ?: return
    val w = bitmap.width
    val f = frameIndex
    for (y in 0 until bitmap.height) {
      val b = (y + f) and 0xFF
      val g = (y * 2 + f) and 0xFF
      val r = (y * 3 + f * 2) and 0xFF
      Arrays.fill(rowScratch, (0xFF shl 24) or (r shl 16) or (g shl 8) or b)
      bitmap.setPixels(rowScratch, 0, w, 0, y, w, 1)
    }
  }

  fun release() {
    synchronized(lock) { surface = null }
    // quitSafely lets already-posted draws finish; the bitmaps are left to GC so a
    // draining draw never touches a recycled bitmap.
    thread.quitSafely()
  }
}
