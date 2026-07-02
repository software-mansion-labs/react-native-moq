import Foundation
import MoQKit

// Owns the DataTrackEmitters created by useDataTrack, keyed by hook-assigned id.
// PublisherImpl looks an emitter up by id when wiring a data track into a
// broadcast; send() pushes payloads to it. Accessed from the JS thread and the
// publisher (MainActor), so guarded by a lock.
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

  public func emitter(forId trackId: String) -> MoQKit.DataTrackEmitter? {
    lock.lock()
    defer { lock.unlock() }
    return emitters[trackId]
  }
}
