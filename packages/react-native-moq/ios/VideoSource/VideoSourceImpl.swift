import Foundation
import MoQKit

// Owns the app-side push video sources created by useVideoSource, keyed by
// hook-assigned id. PublisherImpl looks one up by id to wire it into a broadcast.
// Accessed from the JS thread and the publisher, so guarded by a lock. Mirrors
// AudioSourceImpl.
@objc public class VideoSourceImpl: NSObject {
  @objc public static let shared = VideoSourceImpl()
  private override init() {}

  private let lock = NSLock()
  private var sources: [String: PushVideoSource] = [:]

  // MARK: - Objc bridge

  // Allocates the pool and returns per-slot descriptors, or nil on failure (the
  // .mm rejects the JS promise).
  @objc(createWithTrackId:width:height:poolSize:)
  public func create(trackId: String, width: Double, height: Double, poolSize: Double)
    -> [[String: Any]]?
  {
    guard
      let pool = CustomVideoBufferPool(
        width: Int(width), height: Int(height), poolSize: max(1, Int(poolSize)))
    else { return nil }

    let newSource = PushVideoSource(pool: pool)
    lock.lock()
    let existing = sources[trackId]
    sources[trackId] = newSource
    lock.unlock()
    existing?.release()
    return newSource.bufferDescriptors
  }

  @objc(destroyWithTrackId:)
  public func destroy(trackId: String) {
    lock.lock()
    let source = sources.removeValue(forKey: trackId)
    lock.unlock()
    source?.release()
  }

  @objc(pushFrameWithTrackId:bufferIndex:timestampNs:fenceHandle:fenceValue:)
  public func pushFrame(
    trackId: String, bufferIndex: Double, timestampNs: Double,
    fenceHandle: String, fenceValue: String
  ) {
    source(forId: trackId)?.push(
      bufferIndex: Int(bufferIndex),
      timestampNs: Int64(timestampNs),
      fenceHandle: UInt64(fenceHandle) ?? 0,
      fenceValue: UInt64(fenceValue) ?? 0)
  }

  @objc(fillTestPatternWithTrackId:bufferIndex:frameIndex:)
  public func fillTestPattern(trackId: String, bufferIndex: Double, frameIndex: Double) {
    source(forId: trackId)?.fillTestPattern(
      bufferIndex: Int(bufferIndex), frameIndex: Int(frameIndex))
  }

  // MARK: - Swift-only accessor for PublisherImpl

  public func source(forId trackId: String) -> PushVideoSource? {
    lock.lock()
    defer { lock.unlock() }
    return sources[trackId]
  }
}
