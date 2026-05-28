import AVFoundation
import Foundation
import MoQKit

// Owns the device camera as a refcounted singleton. Multiple consumers
// (useCamera hooks, live publishers, the on-screen <PublisherView/>) call
// start/stop independently — the physical camera only stops when the
// refcount drops to zero. Position changes are global to the device, so they
// apply to every consumer at once.
@objc public class MoQCameraImpl: NSObject {
  @objc public static let shared = MoQCameraImpl()
  private override init() {}

  @objc public var onEvent: ((_ name: String, _ body: [String: Any]) -> Void)?

  // Notification posted whenever the shared AVCaptureSession is created or
  // torn down. MoQCameraPreviewView observes this to (re)attach its layer.
  @objc public static let captureSessionChangedNotification = Notification.Name(
    "MoQCameraImpl.cameraSessionChanged")

  @MainActor @objc public func currentCaptureSession() -> AVCaptureSession? {
    cameraCapture?.captureSession
  }

  // MARK: - State (MainActor)

  private var cameraCapture: CameraCapture?
  private var cameraPosition: CameraPosition = .front
  private var refCount: Int = 0
  // Set while a start is in flight so concurrent consumers (including
  // publish()) can await the same task.
  private var startTask: Task<CameraCapture, Error>?

  @MainActor public func waitForCameraCapture() async throws -> CameraCapture {
    if let cam = cameraCapture { return cam }
    if let task = startTask { return try await task.value }
    throw MoQCaptureError.notStarted("camera capture not started")
  }

  // MARK: - Objc bridge

  @objc(startCaptureWithPosition:)
  public func startCapture(position: String) {
    Task { @MainActor in
      await self._startCapture(position: Self.parsePosition(position))
    }
  }

  @objc public func stopCapture() {
    Task { @MainActor in self._stopCapture() }
  }

  @objc(setPosition:)
  public func setPosition(position: String) {
    Task { @MainActor in self._setPosition(Self.parsePosition(position)) }
  }

  // Mirror moq-kit's iOS demo CodecConfigView gating — return only codecs
  // whose encoder will actually initialize on this device.
  @objc public func supportedCodecs() -> [String] {
    VideoEncoderConfig.supportedCodecs().map { codec -> String in
      switch codec {
      case .h264: return "h264"
      case .h265: return "h265"
      @unknown default: return ""
      }
    }.filter { !$0.isEmpty }
  }

  // MARK: - Lifecycle

  @MainActor
  private func _startCapture(position: CameraPosition) async {
    refCount += 1
    cameraPosition = position
    if cameraCapture != nil || startTask != nil { return }

    emitState("starting")

    let task = Task<CameraCapture, Error> { @MainActor in
      let cam = CameraCapture(camera: Camera(position: position))
      try await cam.start()
      return cam
    }
    startTask = task

    do {
      let cam = try await task.value
      if refCount == 0 {
        cam.stop()
        startTask = nil
        emitState("idle")
        return
      }
      cameraCapture = cam
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
    cameraCapture?.stop()
    cameraCapture = nil
    NotificationCenter.default.post(
      name: Self.captureSessionChangedNotification, object: nil)
    emitState("idle")
  }

  @MainActor
  private func _setPosition(_ position: CameraPosition) {
    if position == cameraPosition { return }
    cameraPosition = position
    guard let cam = cameraCapture else { return }
    do {
      try cam.switch(to: Camera(position: position))
    } catch {
      emitState("error:\(error.localizedDescription)")
    }
  }

  // MARK: - Helpers

  private func emitState(_ state: String) {
    onEvent?("cameraStateChanged", ["state": state])
  }

  private static func parsePosition(_ raw: String) -> CameraPosition {
    raw == "back" ? .back : .front
  }
}
