import CoreMedia
import CoreVideo
import Foundation
import Metal
import MoQKit

/// A moq-kit `FrameSource` fed by app-rendered frames from a `CustomVideoBufferPool`.
/// Each `push` names a pool slot plus an optional Metal fence; the source waits for
/// the fence, wraps the pooled buffer in a `CMSampleBuffer`, and hands it to the
/// encoder via `onFrame`. Delivery runs on a serial queue so `push` never blocks on
/// encoder back-pressure. Modeled on fishjam's CustomVideoCaptureController.
public final class PushVideoSource: NSObject, FrameSource, @unchecked Sendable {
  private let pool: CustomVideoBufferPool

  // Set by the publisher on track start; a stale closure returns false after the
  // track stops, so late pushes are harmlessly dropped until a re-publish.
  public var onFrame: (@Sendable (CMSampleBuffer) -> Bool)?

  private let deliveryQueue = DispatchQueue(label: "com.moq.videosource.delivery")
  private let sharedEventListener: MTLSharedEventListener

  // Teardown guard: a late fence callback must not deliver from a disposed pool.
  private let condition = NSCondition()
  private var inFlight = 0
  private var tornDown = false

  // Cached from the first buffer; only touched on deliveryQueue, so no lock.
  private var formatDescription: CMVideoFormatDescription?

  // Host-clock anchor for explicit app timestamps (see makeSampleBuffer).
  private var ptsBase: CMTime?
  private var appTsBaseNs: Int64 = 0

  init(pool: CustomVideoBufferPool) {
    self.pool = pool
    self.sharedEventListener = MTLSharedEventListener(dispatchQueue: deliveryQueue)
    super.init()
  }

  var bufferDescriptors: [[String: Any]] { pool.descriptors() }

  func fillTestPattern(bufferIndex: Int, frameIndex: Int) {
    pool.fillTestPattern(at: bufferIndex, frameIndex: frameIndex)
  }

  func push(bufferIndex: Int, timestampNs: Int64, fenceHandle: UInt64, fenceValue: UInt64) {
    // Stamp production time now, not after the fence wait (camera-capture analog).
    let hostTime = CMClockGetTime(CMClockGetHostTimeClock())

    condition.lock()
    guard !tornDown, let buffer = pool.pixelBuffer(at: bufferIndex) else {
      condition.unlock()
      return
    }
    inFlight += 1
    condition.unlock()

    // Wait on the app's Metal fence (reconstructed from its raw pointer handle)
    // before sampling, so the buffer is never read mid-render. Retain it for the
    // wait: JS may drop its reference before the GPU signals.
    if fenceHandle != 0, let ptr = UnsafeRawPointer(bitPattern: UInt(fenceHandle)) {
      let object = Unmanaged<AnyObject>.fromOpaque(ptr).takeUnretainedValue()
      if let event = object as? any MTLSharedEvent {
        let retained = Unmanaged.passRetained(object)
        event.notify(sharedEventListener, atValue: fenceValue) { [weak self] _, _ in
          retained.release()
          self?.deliver(buffer: buffer, timestampNs: timestampNs, hostTime: hostTime)
        }
        return
      }
    }

    deliveryQueue.async { [weak self] in
      self?.deliver(buffer: buffer, timestampNs: timestampNs, hostTime: hostTime)
    }
  }

  /// Stop accepting, drain in-flight frames (bounded so a never-firing fence can't
  /// hang teardown), then dispose the pool.
  func release() {
    condition.lock()
    tornDown = true
    let deadline = Date(timeIntervalSinceNow: 2.0)
    while inFlight > 0 {
      if !condition.wait(until: deadline) { break }
    }
    condition.unlock()
    pool.dispose()
  }

  private func deliver(buffer: CVPixelBuffer, timestampNs: Int64, hostTime: CMTime) {
    condition.lock()
    let live = !tornDown
    let onFrame = self.onFrame
    condition.unlock()

    if live, let onFrame,
      let sampleBuffer = makeSampleBuffer(buffer, timestampNs: timestampNs, hostTime: hostTime)
    {
      _ = onFrame(sampleBuffer)
    }

    condition.lock()
    inFlight -= 1
    condition.signal()
    condition.unlock()
  }

  private func makeSampleBuffer(
    _ pixelBuffer: CVPixelBuffer, timestampNs: Int64, hostTime: CMTime
  ) -> CMSampleBuffer? {
    if formatDescription == nil {
      var desc: CMVideoFormatDescription?
      guard
        CMVideoFormatDescriptionCreateForImageBuffer(
          allocator: kCFAllocatorDefault, imageBuffer: pixelBuffer, formatDescriptionOut: &desc)
          == noErr
      else { return nil }
      formatDescription = desc
    }
    guard let formatDescription else { return nil }

    // PTS must share the camera/mic timebase (the host clock): moq-kit uses one
    // clock for all tracks and the subscriber drops frames that drift from the live
    // playhead. Default (timestampNs <= 0) stamps push time; explicit timestamps are
    // anchored to the host clock at the first frame and advanced by their delta.
    let pts: CMTime
    if timestampNs <= 0 {
      pts = hostTime
    } else if let base = ptsBase, timestampNs >= appTsBaseNs {
      pts = CMTimeAdd(base, CMTime(value: timestampNs - appTsBaseNs, timescale: 1_000_000_000))
    } else {
      ptsBase = hostTime
      appTsBaseNs = timestampNs
      pts = hostTime
    }

    var timing = CMSampleTimingInfo(
      duration: .invalid, presentationTimeStamp: pts, decodeTimeStamp: .invalid)
    var sampleBuffer: CMSampleBuffer?
    guard
      CMSampleBufferCreateForImageBuffer(
        allocator: kCFAllocatorDefault, imageBuffer: pixelBuffer, dataReady: true,
        makeDataReadyCallback: nil, refcon: nil, formatDescription: formatDescription,
        sampleTiming: &timing, sampleBufferOut: &sampleBuffer) == noErr
    else { return nil }
    return sampleBuffer
  }
}
