import Foundation
import MoQKit

// Generic refcounted capture lifecycle shared by CameraImpl, MicrophoneImpl and
// MultiCameraImpl. The hardware stops only once the refcount drops to zero. This
// factors out the start-Task bookkeeping, the "last consumer stopped mid-start"
// rollback, and state-event emission; each impl supplies only how to build/stop
// its capture. Used exclusively from the main actor.
final class RefcountedCapture<C> {
  private var capture: C?
  private var refCount = 0
  private var startTask: Task<C, Error>?

  private let emit: @MainActor (String) -> Void
  private let stopCapture: @MainActor (C) -> Void
  // Runs right after "starting" is emitted (Microphone switches to playAndRecord).
  private let onStarting: @MainActor () -> Void
  private let onActive: @MainActor () -> Void
  // Runs when we settle back to no running capture at refcount zero (idle, stop,
  // or a failed start). Camera/MultiCamera repost session-changed; Microphone
  // restores the playback audio session.
  private let onInactive: @MainActor () -> Void

  init(
    emit: @escaping @MainActor (String) -> Void,
    stopCapture: @escaping @MainActor (C) -> Void,
    onStarting: @escaping @MainActor () -> Void = {},
    onActive: @escaping @MainActor () -> Void = {},
    onInactive: @escaping @MainActor () -> Void = {}
  ) {
    self.emit = emit
    self.stopCapture = stopCapture
    self.onStarting = onStarting
    self.onActive = onActive
    self.onInactive = onInactive
  }

  @MainActor func current() -> C? { capture }

  // Awaits any in-flight start so publish() can grab the capture right after a
  // hook calls startCapture. Throws if no consumer asked for it.
  @MainActor func waitForCapture(_ notStartedMessage: String) async throws -> C {
    if let c = capture { return c }
    if let task = startTask { return try await task.value }
    throw MoQCaptureError.notStarted(notStartedMessage)
  }

  // `preflight` may abort with an error message before any work runs (MultiCamera
  // rejects unsupported devices). `make` builds and starts the capture.
  @MainActor func start(
    preflight: @MainActor () -> String? = { nil },
    make: @escaping @MainActor () async throws -> C
  ) async {
    refCount += 1
    if capture != nil || startTask != nil { return }

    if let message = preflight() {
      if refCount > 0 { refCount -= 1 }
      emit("error:\(message)")
      return
    }

    emit("starting")
    onStarting()

    let task = Task { @MainActor in try await make() }
    startTask = task

    do {
      let c = try await task.value
      startTask = nil
      // The last consumer may have stopped while we were starting; don't retain.
      if refCount == 0 {
        stopCapture(c)
        onInactive()
        emit("idle")
        return
      }
      capture = c
      onActive()
      emit("active")
    } catch {
      startTask = nil
      // Roll back this start's refcount so a later retry isn't skewed.
      if refCount > 0 { refCount -= 1 }
      if refCount == 0 { onInactive() }
      emit("error:\(error.localizedDescription)")
    }
  }

  @MainActor func stop() {
    if refCount > 0 { refCount -= 1 }
    guard refCount == 0 else { return }
    if let c = capture { stopCapture(c) }
    capture = nil
    onInactive()
    emit("idle")
  }
}

// codec→JS-string mapping. Returns nil for codecs JS doesn't know, so callers
// can `compactMap` them away.
extension VideoCodec {
  var jsString: String? {
    switch self {
    case .h264: return "h264"
    case .h265: return "h265"
    @unknown default: return nil
    }
  }
}

extension MoQKit.AudioCodec {
  var jsString: String? {
    switch self {
    case .opus: return "opus"
    case .aac: return "aac"
    @unknown default: return nil
    }
  }
}
