import AVFoundation
import Foundation
import MoQKit

// Owns the concurrent front+back capture as a refcounted singleton, mirroring
// CameraImpl. Multiple consumers (useMultiCamera hooks, live publishers, the
// on-screen <PublisherView/>s) call start/stop independently — the cameras only
// stop when the refcount drops to zero. Unlike CameraImpl there's no position
// switching; the two cameras are fixed front/back.
@objc public class MultiCameraImpl: NSObject {
  @objc public static let shared = MultiCameraImpl()
  private override init() {}

  @objc public var onEvent: ((_ name: String, _ body: [String: Any]) -> Void)?

  // Notification posted whenever the shared AVCaptureMultiCamSession is created
  // or torn down. MultiCameraPreviewView observes this to (re)attach its layer.
  @objc public static let captureSessionChangedNotification = Notification.Name(
    "MultiCameraImpl.cameraSessionChanged")

  @objc public func isSupported() -> Bool {
    MultiCameraCapture.isSupported
  }

  @MainActor @objc public func currentCaptureSession() -> AVCaptureMultiCamSession? {
    capture?.captureSession
  }

  // MARK: - State (MainActor)

  private var capture: MultiCameraCapture?
  private var width: Int32 = 720
  private var height: Int32 = 1280
  private var maxFrameRate: Double = 30
  private var refCount: Int = 0
  // Set while a start is in flight so concurrent consumers (including
  // publish()) can await the same task.
  private var startTask: Task<MultiCameraCapture, Error>?

  @MainActor public func waitForCapture() async throws -> MultiCameraCapture {
    if let cap = capture { return cap }
    if let task = startTask { return try await task.value }
    throw MoQCaptureError.notStarted("multi-camera capture not started")
  }

  // MARK: - Objc bridge

  @objc(startCaptureWithWidth:height:framerate:)
  public func startCapture(width: Double, height: Double, framerate: Double) {
    Task { @MainActor in
      await self._startCapture(
        width: Int32(width), height: Int32(height), framerate: framerate)
    }
  }

  @objc public func stopCapture() {
    Task { @MainActor in self._stopCapture() }
  }

  // MARK: - Lifecycle

  @MainActor
  private func _startCapture(width: Int32, height: Int32, framerate: Double) async {
    refCount += 1
    self.width = width
    self.height = height
    self.maxFrameRate = framerate
    if capture != nil || startTask != nil { return }

    guard MultiCameraCapture.isSupported else {
      refCount -= 1
      emitState("error:multi-camera is not supported on this device")
      return
    }

    emitState("starting")

    let task = Task<MultiCameraCapture, Error> { @MainActor in
      let cap = MultiCameraCapture(
        front: MoQKit.Camera(position: .front, width: width, height: height),
        back: MoQKit.Camera(position: .back, width: width, height: height),
        maxFrameRate: framerate)
      try await cap.start()
      return cap
    }
    startTask = task

    do {
      let cap = try await task.value
      if refCount == 0 {
        cap.stop()
        startTask = nil
        emitState("idle")
        return
      }
      capture = cap
      startTask = nil
      NotificationCenter.default.post(
        name: Self.captureSessionChangedNotification, object: nil)
      emitState("active")
    } catch {
      startTask = nil
      if refCount > 0 { refCount -= 1 }
      emitState("error:\(error.localizedDescription)")
    }
  }

  @MainActor
  private func _stopCapture() {
    if refCount > 0 { refCount -= 1 }
    guard refCount == 0 else { return }
    capture?.stop()
    capture = nil
    NotificationCenter.default.post(
      name: Self.captureSessionChangedNotification, object: nil)
    emitState("idle")
  }

  // MARK: - Helpers

  private func emitState(_ state: String) {
    onEvent?("multiCameraStateChanged", ["state": state])
  }
}
