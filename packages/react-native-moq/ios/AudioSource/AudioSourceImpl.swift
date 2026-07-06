import CoreMedia
import Foundation
import MoQKit

// Owns the app-side push audio sources created by useAudioSource, keyed by
// hook-assigned id. PublisherImpl looks a source up by id when wiring an audio
// track into a broadcast; send() pushes PCM to it. Accessed from the JS thread
// and the publisher (MainActor), so guarded by a lock.
@objc public class AudioSourceImpl: NSObject {
  @objc public static let shared = AudioSourceImpl()
  private override init() {}

  private let lock = NSLock()
  private var sources: [String: PushAudioSource] = [:]

  // MARK: - Objc bridge

  @objc(createWithTrackId:sampleRate:channels:)
  public func create(trackId: String, sampleRate: Double, channels: Double) {
    lock.lock()
    defer { lock.unlock() }
    if sources[trackId] == nil {
      sources[trackId] = PushAudioSource(
        sampleRate: max(8000, Int(sampleRate)), channels: max(1, Int(channels)))
    }
  }

  @objc(destroyWithTrackId:)
  public func destroy(trackId: String) {
    lock.lock()
    let source = sources.removeValue(forKey: trackId)
    lock.unlock()
    source?.release()
  }

  @objc(sendWithTrackId:base64Pcm:)
  public func send(trackId: String, base64Pcm: String) {
    lock.lock()
    let source = sources[trackId]
    lock.unlock()
    guard let source, let data = Data(base64Encoded: base64Pcm) else { return }
    source.enqueue(data)
  }

  // MARK: - Swift-only accessor for PublisherImpl

  public func source(forId trackId: String) -> PushAudioSource? {
    lock.lock()
    defer { lock.unlock() }
    return sources[trackId]
  }
}

/// A `FrameSource` fed by app-supplied PCM. Buffers pushed PCM and paces fixed
/// 20 ms `CMSampleBuffer`s out to the encoder in real time (silence when the
/// buffer is empty), so a whole utterance can be pushed at once without bursting
/// downstream.
public final class PushAudioSource: NSObject, FrameSource, @unchecked Sendable {
  private let sampleRate: Int
  private let channels: Int
  private let bytesPerFrame: Int
  private let samplesPerChunk: Int
  private let chunkBytes: Int
  private let maxBufferedBytes: Int

  private let lock = NSLock()
  private var buffer = Data()
  private var running = false
  private var feederThread: Thread?
  private var formatDesc: CMAudioFormatDescription?

  // Set by the publisher on track start — drives the feeder. (Stop is detected
  // by the callback returning false; see runFeeder.)
  public var onFrame: (@Sendable (CMSampleBuffer) -> Bool)? {
    didSet {
      if onFrame != nil { startFeeder() } else { stopFeeder() }
    }
  }

  init(sampleRate: Int, channels: Int) {
    self.sampleRate = sampleRate
    self.channels = channels
    self.bytesPerFrame = channels * 2
    self.samplesPerChunk = max(1, sampleRate / 50)  // 20 ms, Opus's native frame
    self.chunkBytes = samplesPerChunk * channels * 2
    // Cap so pushing before the track starts can't grow unbounded; holds a full utterance.
    self.maxBufferedBytes = sampleRate * channels * 2 * 60  // ~60 s
    super.init()
  }

  func enqueue(_ data: Data) {
    guard !data.isEmpty else { return }
    lock.lock()
    buffer.append(data)
    if buffer.count > maxBufferedBytes {
      // Drop the oldest whole frames so early pushes can't grow unbounded.
      var drop = buffer.count - maxBufferedBytes
      drop -= drop % bytesPerFrame
      if drop > 0 { buffer.removeSubrange(0..<min(drop, buffer.count)) }
    }
    lock.unlock()
  }

  func release() {
    stopFeeder()
  }

  private func startFeeder() {
    lock.lock()
    if running {
      lock.unlock()
      return
    }
    running = true
    lock.unlock()

    let thread = Thread { [weak self] in self?.runFeeder() }
    thread.name = "PushAudioFeeder"
    feederThread = thread
    thread.start()
  }

  private func stopFeeder() {
    lock.lock()
    running = false
    buffer.removeAll(keepingCapacity: false)
    lock.unlock()
    feederThread = nil
  }

  private func runFeeder() {
    formatDesc = makeFormatDescription()
    let hostClock = CMClockGetHostTimeClock()
    let frameDuration = Double(samplesPerChunk) / Double(sampleRate)
    // Fixed base at track start; PTS advances one frame at a time so the track
    // is continuous (buffered audio, else silence) like a live microphone.
    let base = CMClockGetTime(hostClock)
    var framesEmitted: Int64 = 0
    let silence = Data(count: chunkBytes)

    while running {
      guard let callback = onFrame else { break }

      lock.lock()
      let frame: Data
      if buffer.count >= chunkBytes {
        frame = buffer.subdata(in: 0..<chunkBytes)
        buffer.removeSubrange(0..<chunkBytes)
      } else {
        frame = silence
      }
      lock.unlock()

      let pts = CMTimeAdd(
        base,
        CMTimeMake(value: framesEmitted * Int64(samplesPerChunk), timescale: Int32(sampleRate)))
      if let sampleBuffer = makeSampleBuffer(frame, pts: pts) {
        // The publisher swaps in a callback that returns false when the track
        // stops; that's our signal to end the feeder (iOS never clears onFrame).
        if !callback(sampleBuffer) { break }
      }
      framesEmitted += 1

      // Pace to real time against absolute frame targets so we never drift.
      let target = base.seconds + Double(framesEmitted) * frameDuration
      let sleep = target - CMClockGetTime(hostClock).seconds
      if sleep > 0 { Thread.sleep(forTimeInterval: sleep) }
    }

    // Mark stopped so a later re-publish (well after the publisher's teardown
    // completes) starts a fresh feeder rather than early-returning.
    lock.lock()
    running = false
    lock.unlock()
    formatDesc = nil
  }

  private func makeFormatDescription() -> CMAudioFormatDescription? {
    var asbd = AudioStreamBasicDescription(
      mSampleRate: Float64(sampleRate),
      mFormatID: kAudioFormatLinearPCM,
      mFormatFlags: kLinearPCMFormatFlagIsSignedInteger | kLinearPCMFormatFlagIsPacked,
      mBytesPerPacket: UInt32(bytesPerFrame),
      mFramesPerPacket: 1,
      mBytesPerFrame: UInt32(bytesPerFrame),
      mChannelsPerFrame: UInt32(channels),
      mBitsPerChannel: 16,
      mReserved: 0)
    var desc: CMAudioFormatDescription?
    let status = CMAudioFormatDescriptionCreate(
      allocator: kCFAllocatorDefault, asbd: &asbd,
      layoutSize: 0, layout: nil, magicCookieSize: 0, magicCookie: nil,
      extensions: nil, formatDescriptionOut: &desc)
    return status == noErr ? desc : nil
  }

  private func makeSampleBuffer(_ frame: Data, pts: CMTime) -> CMSampleBuffer? {
    guard let formatDesc else { return nil }
    let numFrames = frame.count / bytesPerFrame

    var blockBuffer: CMBlockBuffer?
    // Assure the backing memory now so ReplaceDataBytes can copy into it (the
    // Data is transient, so we own a copy rather than referencing its storage).
    var status = CMBlockBufferCreateWithMemoryBlock(
      allocator: kCFAllocatorDefault, memoryBlock: nil, blockLength: frame.count,
      blockAllocator: kCFAllocatorDefault, customBlockSource: nil,
      offsetToData: 0, dataLength: frame.count,
      flags: kCMBlockBufferAssureMemoryNowFlag, blockBufferOut: &blockBuffer)
    guard status == kCMBlockBufferNoErr, let blockBuffer else { return nil }

    status = frame.withUnsafeBytes { raw in
      CMBlockBufferReplaceDataBytes(
        with: raw.baseAddress!, blockBuffer: blockBuffer,
        offsetIntoDestination: 0, dataLength: frame.count)
    }
    guard status == kCMBlockBufferNoErr else { return nil }

    var sampleBuffer: CMSampleBuffer?
    var timing = CMSampleTimingInfo(
      duration: CMTimeMake(value: 1, timescale: Int32(sampleRate)),
      presentationTimeStamp: pts, decodeTimeStamp: .invalid)
    var sampleSize = bytesPerFrame
    status = CMSampleBufferCreateReady(
      allocator: kCFAllocatorDefault, dataBuffer: blockBuffer,
      formatDescription: formatDesc, sampleCount: numFrames,
      sampleTimingEntryCount: 1, sampleTimingArray: &timing,
      sampleSizeEntryCount: 1, sampleSizeArray: &sampleSize,
      sampleBufferOut: &sampleBuffer)
    guard status == noErr else { return nil }
    return sampleBuffer
  }
}
