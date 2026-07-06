import AVFoundation
import Foundation
import MoQKit

@objc public class PublisherImpl: NSObject {
  @objc public static let shared = PublisherImpl()
  private override init() {}

  @objc public var onEvent: ((_ name: String, _ body: [String: Any]) -> Void)?

  // MARK: - Private state (MainActor)

  // Camera/microphone are owned by CameraImpl/MicrophoneImpl; the publisher
  // just references them.
  private final class PublisherContext {
    let sessionId: String
    let path: String
    let publisher: MoQKit.Publisher
    var stateTask: Task<Void, Never>?
    var eventsTask: Task<Void, Never>?
    var trackStateTasks: [Task<Void, Never>] = []

    init(sessionId: String, path: String, publisher: MoQKit.Publisher) {
      self.sessionId = sessionId
      self.path = path
      self.publisher = publisher
    }
  }

  private var publishers: [String: PublisherContext] = [:]

  // In-flight stop() tasks per session; _publish() awaits any pending teardown
  // so publish()/start() never races the previous stop() on the same Session
  // (which can drop the whole session).
  private var teardowns: [String: Task<Void, Never>] = [:]

  // MARK: - Objc bridge

  @objc(publishWithSessionId:path:tracksJson:)
  public func publish(sessionId: String, path: String, tracksJson: String) {
    let tracks = Self.parseTracks(tracksJson)
    Task { @MainActor in
      await self._publish(sessionId: sessionId, path: path, tracks: tracks)
    }
  }

  @objc(stopWithSessionId:)
  public func stop(sessionId: String) {
    Task { @MainActor in await self._stop(sessionId: sessionId) }
  }

  // MARK: - Publish

  @MainActor
  private func _publish(sessionId: String, path: String, tracks: [TrackDescriptor]) async {
    // Replacing a publisher: tear the old one down and WAIT before starting the
    // new one, or the concurrent stop() can drop the whole session.
    if let existing = publishers.removeValue(forKey: sessionId) {
      existing.stateTask?.cancel()
      existing.eventsTask?.cancel()
      existing.trackStateTasks.forEach { $0.cancel() }
      await teardownPublisher(existing)
    }
    // Also wait out a stop() already in flight.
    await teardowns.removeValue(forKey: sessionId)?.value

    NSLog("[MoQBoy-debug] publisher publish begin session=%@ path=%@", sessionId, path)

    guard let s = MoQImpl.shared.currentSession(forSessionId: sessionId) else {
      emitPublisherState(sessionId: sessionId, state: "error:session is not connected")
      return
    }

    do {
      let pub = try MoQKit.Publisher()
      let ctx = PublisherContext(sessionId: sessionId, path: path, publisher: pub)
      publishers[sessionId] = ctx

      var publishedTracks: [PublishedTrack] = []

      for descriptor in tracks {
        switch descriptor {
        case .camera(let name, let source, let config):
          let frameSource: FrameSource
          switch source {
          case "multi-front":
            frameSource = try await MultiCameraImpl.shared.waitForCapture().frontSource
          case "multi-back":
            frameSource = try await MultiCameraImpl.shared.waitForCapture().backSource
          default:
            frameSource = try await CameraImpl.shared.waitForCameraCapture()
          }
          publishedTracks.append(
            pub.addVideoTrack(name: name, source: frameSource, config: config))
        case .microphone(let name, let config):
          let mic = try await MicrophoneImpl.shared.waitForMicrophone()
          publishedTracks.append(
            pub.addAudioTrack(name: name, source: mic, config: config))
        case .audioSource(let name, let id, let config):
          guard let source = AudioSourceImpl.shared.source(forId: id) else {
            throw MoQCaptureError.notStarted("audio source '\(id)' not created")
          }
          publishedTracks.append(
            pub.addAudioTrack(name: name, source: source, config: config))
        case .data(let name, let id):
          guard let emitter = DataTrackImpl.shared.emitter(forId: id) else {
            throw MoQCaptureError.notStarted("data track '\(id)' not created")
          }
          publishedTracks.append(
            pub.addDataTrack(name: name, source: emitter))
        }
      }

      try await s.publish(path: path, publisher: pub)
      try await pub.start()

      NSLog("[MoQBoy-debug] publisher publish ok session=%@ path=%@", sessionId, path)
      observePublisher(ctx, tracks: publishedTracks)
    } catch {
      NSLog(
        "[MoQBoy-debug] publisher publish ERROR session=%@ path=%@ error=%@",
        sessionId, path, String(describing: error))
      publishers.removeValue(forKey: sessionId)
      emitPublisherState(sessionId: sessionId, state: "error:\(error.localizedDescription)")
      // Clean up any partial registration (publish() may have registered the
      // path before start() threw); also stops the publisher.
      await s.unpublish(path: path)
    }
  }

  @MainActor
  private func observePublisher(_ ctx: PublisherContext, tracks: [PublishedTrack]) {
    let pub = ctx.publisher
    let sid = ctx.sessionId
    ctx.stateTask = Task { @MainActor in
      for await state in pub.state {
        switch state {
        case .idle: break
        case .publishing: self.emitPublisherState(sessionId: sid, state: "publishing")
        case .stopped: self.emitPublisherState(sessionId: sid, state: "stopped")
        case .error(let msg): self.emitPublisherState(sessionId: sid, state: "error:\(msg)")
        }
      }
    }

    ctx.eventsTask = Task { @MainActor in
      for await event in pub.events {
        switch event {
        case .trackStarted(let name):
          self.onEvent?(
            "publisherTrackStateChanged",
            ["sessionId": sid, "name": name, "state": "active"])
        case .trackStopped(let name):
          self.onEvent?(
            "publisherTrackStateChanged",
            ["sessionId": sid, "name": name, "state": "stopped"])
        case .error(let name, let msg):
          self.onEvent?(
            "publisherTrackStateChanged",
            ["sessionId": sid, "name": name, "state": "stopped", "error": msg])
        }
      }
    }

    for track in tracks {
      let name = track.name
      let task = Task { @MainActor in
        for await state in track.state {
          self.onEvent?(
            "publisherTrackStateChanged",
            ["sessionId": sid, "name": name, "state": Self.trackStateString(state)])
        }
      }
      ctx.trackStateTasks.append(task)
    }
  }

  @MainActor
  private func _stop(sessionId: String) async {
    guard let ctx = publishers.removeValue(forKey: sessionId) else { return }

    ctx.stateTask?.cancel()
    ctx.eventsTask?.cancel()
    ctx.trackStateTasks.forEach { $0.cancel() }

    emitPublisherState(sessionId: sessionId, state: "idle")

    // Remember the teardown so a follow-up _publish() waits for it.
    teardowns[sessionId] = Task { @MainActor in await self.teardownPublisher(ctx) }
  }

  // Tear down via Session.unpublish (not just pub.stop): pub.stop alone leaves
  // the per-path registration behind, which piles up until the relay drops the
  // session. unpublish() also stops the publisher.
  @MainActor
  private func teardownPublisher(_ ctx: PublisherContext) async {
    if let s = MoQImpl.shared.currentSession(forSessionId: ctx.sessionId) {
      NSLog("[MoQBoy-debug] publisher unpublish session=%@ path=%@", ctx.sessionId, ctx.path)
      await s.unpublish(path: ctx.path)
    } else {
      NSLog("[MoQBoy-debug] publisher stop (no session) session=%@ path=%@", ctx.sessionId, ctx.path)
      ctx.publisher.stop()
    }
  }

  // MARK: - Helpers

  private func emitPublisherState(sessionId: String, state: String) {
    onEvent?("publisherStateChanged", ["sessionId": sessionId, "state": state])
  }

  private static func trackStateString(_ state: PublishedTrackState) -> String {
    switch state {
    case .idle: return "idle"
    case .starting: return "starting"
    case .active: return "active"
    case .stopped: return "stopped"
    }
  }

  // MARK: - Track parsing

  private enum TrackDescriptor {
    case camera(name: String, source: String, config: VideoEncoderConfig)
    case microphone(name: String, config: AudioEncoderConfig)
    case audioSource(name: String, id: String, config: AudioEncoderConfig)
    case data(name: String, id: String)
  }

  private static func parseTracks(_ json: String) -> [TrackDescriptor] {
    guard
      let data = json.data(using: .utf8),
      let arr = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]]
    else { return [] }

    var out: [TrackDescriptor] = []
    for entry in arr {
      guard
        let type = entry["type"] as? String,
        let name = entry["name"] as? String
      else { continue }
      // Data tracks carry no encoder; media tracks require one.
      let enc = (entry["encoder"] as? [String: Any]) ?? [:]
      switch type {
      case "camera":
        let codec = (enc["codec"] as? String).flatMap(VideoCodec.init(rawValue:)) ?? .h264
        let width = (enc["width"] as? NSNumber)?.int32Value ?? 1280
        let height = (enc["height"] as? NSNumber)?.int32Value ?? 720
        let framerate = (enc["framerate"] as? NSNumber)?.doubleValue ?? 30
        let source = (entry["source"] as? String) ?? "single"
        out.append(.camera(
          name: name,
          source: source,
          config: VideoEncoderConfig(
            codec: codec, width: width, height: height, maxFrameRate: framerate)))
      case "microphone":
        let codec = (enc["codec"] as? String)
          .flatMap(MoQKit.AudioCodec.init(rawValue:)) ?? .opus
        let sampleRate = (enc["sampleRate"] as? NSNumber)?.doubleValue ?? 48_000
        out.append(.microphone(
          name: name,
          config: AudioEncoderConfig(codec: codec, sampleRate: sampleRate)))
      case "audioSource":
        let codec = (enc["codec"] as? String)
          .flatMap(MoQKit.AudioCodec.init(rawValue:)) ?? .opus
        let sampleRate = (enc["sampleRate"] as? NSNumber)?.doubleValue ?? 48_000
        let channels = (enc["channels"] as? NSNumber)?.uint32Value ?? 1
        let id = (entry["id"] as? String) ?? ""
        out.append(.audioSource(
          name: name, id: id,
          config: AudioEncoderConfig(
            codec: codec, sampleRate: sampleRate, channels: channels)))
      case "data":
        let id = (entry["id"] as? String) ?? ""
        out.append(.data(name: name, id: id))
      default: continue
      }
    }
    return out
  }
}
