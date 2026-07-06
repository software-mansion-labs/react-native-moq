package com.moq.audiosource

import android.os.SystemClock
import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.moq.NativeMoQAudioSourceSpec
import com.swmansion.moqkit.publish.source.AudioFrameSource
import java.util.concurrent.ConcurrentHashMap

private const val TAG = "AudioSourceModule"

// Owns the app-side push audio sources, keyed by id. The map is read from both
// the JS thread (send) and the publisher coroutine, hence ConcurrentHashMap.
class AudioSourceModule(reactContext: ReactApplicationContext) :
  NativeMoQAudioSourceSpec(reactContext) {

  init {
    instance = this
  }

  private val sources = ConcurrentHashMap<String, PushAudioSource>()

  companion object {
    const val NAME = NativeMoQAudioSourceSpec.NAME

    @Volatile var instance: AudioSourceModule? = null
      private set
  }

  override fun create(trackId: String, sampleRate: Double, channels: Double) {
    sources.getOrPut(trackId) {
      PushAudioSource(sampleRate.toInt(), channels.toInt())
    }
  }

  override fun destroy(trackId: String) {
    sources.remove(trackId)?.release()
  }

  override fun send(trackId: String, base64Pcm: String) {
    val source = sources[trackId] ?: return
    try {
      source.enqueue(Base64.decode(base64Pcm, Base64.DEFAULT))
    } catch (e: Exception) {
      Log.w(TAG, "Failed to decode PCM payload: $e")
    }
  }

  internal fun source(trackId: String): PushAudioSource? = sources[trackId]

  override fun invalidate() {
    super.invalidate()
    sources.values.forEach { it.release() }
    sources.clear()
    instance = null
  }
}

/**
 * An [AudioFrameSource] fed by app-supplied PCM. Buffers pushed PCM and paces
 * fixed 20 ms frames out to the encoder in real time (silence when the buffer is
 * empty), so a whole utterance can be pushed at once without overflowing the
 * encoder's bounded input queue.
 */
internal class PushAudioSource(
  private val sampleRate: Int,
  private val channels: Int,
) : AudioFrameSource {

  // Publisher sets this on track start, clears it (null) on stop — drives the feeder.
  override var onPcmData: ((data: ByteArray, size: Int, timestampUs: Long) -> Unit)? = null
    set(value) {
      field = value
      if (value != null) startFeeder() else stopFeeder()
    }

  private val bytesPerFrame = channels * 2
  private val samplesPerChunk = maxOf(1, sampleRate / 50) // 20 ms, Opus's native frame
  private val chunkBytes = samplesPerChunk * bytesPerFrame
  private val frameDurationUs = 1_000_000L * samplesPerChunk / sampleRate
  // Cap so pushing before the track starts can't grow unbounded; holds a full utterance.
  private val maxBufferedBytes = sampleRate * bytesPerFrame * 60 // ~60 s

  private val fifo = PcmFifo(maxBufferedBytes)

  @Volatile private var running = false
  private var feeder: Thread? = null

  fun enqueue(data: ByteArray) {
    if (data.isEmpty()) return
    fifo.write(data)
  }

  fun release() {
    stopFeeder()
    fifo.clear()
  }

  @Synchronized
  private fun startFeeder() {
    if (running) return
    running = true
    feeder = Thread { runFeeder() }.apply {
      name = "PushAudioFeeder"
      isDaemon = true
      start()
    }
  }

  @Synchronized
  private fun stopFeeder() {
    running = false
    feeder?.interrupt()
    feeder = null
    fifo.clear()
  }

  private fun runFeeder() {
    val frame = ByteArray(chunkBytes)
    val silence = ByteArray(chunkBytes) // stays zero; encoder copies before use
    // Fixed base at track start; PTS advances one frame at a time so the track
    // is continuous (buffered audio, else silence) like a live microphone.
    val baseUs = SystemClock.elapsedRealtimeNanos() / 1_000L
    var framesEmitted = 0L

    while (running) {
      val cb = onPcmData ?: break
      val out = if (fifo.read(frame, chunkBytes)) frame else silence

      val ptsUs = baseUs + framesEmitted * frameDurationUs
      try {
        cb(out, chunkBytes, ptsUs)
      } catch (e: Exception) {
        Log.w(TAG, "onPcmData threw: $e")
      }
      framesEmitted++

      // Pace to real time against absolute frame targets so we never drift.
      val targetUs = baseUs + framesEmitted * frameDurationUs
      val sleepMs = (targetUs - SystemClock.elapsedRealtimeNanos() / 1_000L) / 1_000L
      if (sleepMs > 0) {
        try {
          Thread.sleep(sleepMs)
        } catch (_: InterruptedException) {
          break
        }
      }
    }
  }
}

// A byte FIFO backed by a queue of chunks. Reads pull a fixed frame size across
// chunk boundaries; writes drop the oldest bytes once the cap is exceeded.
private class PcmFifo(private val maxBytes: Int) {
  private val chunks = ArrayDeque<ByteArray>()
  private var headOffset = 0
  private var size = 0

  @Synchronized
  fun write(data: ByteArray) {
    chunks.addLast(data)
    size += data.size
    while (size > maxBytes && chunks.isNotEmpty()) {
      val head = chunks.first()
      val available = head.size - headOffset
      if (size - available < maxBytes || chunks.size == 1) break
      chunks.removeFirst()
      headOffset = 0
      size -= available
    }
  }

  @Synchronized
  fun read(out: ByteArray, len: Int): Boolean {
    if (size < len) return false
    var read = 0
    while (read < len) {
      val head = chunks.first()
      val remaining = head.size - headOffset
      val toCopy = minOf(remaining, len - read)
      System.arraycopy(head, headOffset, out, read, toCopy)
      read += toCopy
      headOffset += toCopy
      size -= toCopy
      if (headOffset == head.size) {
        chunks.removeFirst()
        headOffset = 0
      }
    }
    return true
  }

  @Synchronized
  fun clear() {
    chunks.clear()
    headOffset = 0
    size = 0
  }
}
