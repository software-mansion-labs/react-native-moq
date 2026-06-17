import Foundation
import MoQKit

// Owns the app-side DataTrackEmitters created by useDataTrack, keyed by the id
// the hook assigns. Mirrors MoQKit's model where an emitter is a standalone
// object handed to Publisher.addDataTrack — PublisherImpl looks the emitter up
// by id when wiring a data track into a broadcast, and send() pushes payloads
// straight to it.
//
// Unlike the camera/mic impls there is no hardware, refcount, or MainActor
// state — emitters are cheap and accessed from the JS thread (send) and the
// publisher (MainActor), so they live behind a lock.
@objc public class DataTrackImpl: NSObject {
  @objc public static let shared = DataTrackImpl()
  private override init() {}

  private let lock = NSLock()
  private var emitters: [String: MoQKit.DataTrackEmitter] = [:]

  // MARK: - Objc bridge

  @objc(createWithTrackId:)
  public func create(trackId: String) {
    lock.lock()
    defer { lock.unlock() }
    if emitters[trackId] == nil {
      emitters[trackId] = MoQKit.DataTrackEmitter()
    }
  }

  @objc(destroyWithTrackId:)
  public func destroy(trackId: String) {
    lock.lock()
    defer { lock.unlock() }
    emitters.removeValue(forKey: trackId)
  }

  @objc(sendWithTrackId:payload:)
  public func send(trackId: String, payload: String) {
    lock.lock()
    let emitter = emitters[trackId]
    lock.unlock()
    guard let emitter, let data = payload.data(using: .utf8) else { return }
    try? emitter.send(data)
  }

  // MARK: - Swift-only accessor for PublisherImpl

  // Returns the emitter for trackId, or nil if useDataTrack hasn't created it.
  public func emitter(forId trackId: String) -> MoQKit.DataTrackEmitter? {
    lock.lock()
    defer { lock.unlock() }
    return emitters[trackId]
  }
}
