import AVFoundation
import Foundation
import MoQKit

// Owns the device camera as a refcounted singleton. Multiple consumers
// (useCamera hooks, live publishers, the on-screen <PublisherView/>) call
// start/stop independently — the physical camera only stops when the
// refcount drops to zero (see RefcountedCapture). Position changes are global
// to the device, so they apply to every consumer at once.
@objc public class CameraImpl: NSObject {
  @objc public static let shared = CameraImpl()
  private override init() {}

  @objc public var onEvent: ((_ name: String, _ body: [String: Any]) -> Void)?

  // Notification posted whenever the shared AVCaptureSession is created or
  // torn down. CameraPreviewView observes this to (re)attach its layer.
  @objc public static let captureSessionChangedNotification = Notification.Name(
    "CameraImpl.cameraSessionChanged")

  private lazy var manager = RefcountedCapture<CameraCapture>(
    emit: { [weak self] in self?.onEvent?("cameraStateChanged", ["state": $0]) },
    stopCapture: { $0.stop() },
    onActive: { CameraImpl.postSessionChanged() },
    onInactive: { CameraImpl.postSessionChanged() })

  private var cameraPosition: CameraPosition = .front

  @MainActor @objc public func currentCaptureSession() -> AVCaptureSession? {
    manager.current()?.captureSession
  }

  @MainActor public func waitForCameraCapture() async throws -> CameraCapture {
    try await manager.waitForCapture("camera capture not started")
  }

  // MARK: - Objc bridge

  @objc(startCaptureWithPosition:)
  public func startCapture(position: String) {
    Task { @MainActor in
      await self._startCapture(position: Self.parsePosition(position))
    }
  }

  @objc public func stopCapture() {
    Task { @MainActor in self.manager.stop() }
  }

  @objc(setPosition:)
  public func setPosition(position: String) {
    Task { @MainActor in self._setPosition(Self.parsePosition(position)) }
  }

  // Mirror moq-kit's iOS demo CodecConfigView gating — return only codecs
  // whose encoder will actually initialize on this device.
  @objc public func supportedCodecs() -> [String] {
    VideoEncoderConfig.supportedCodecs().compactMap { $0.jsString }
  }

  // MARK: - Lifecycle

  @MainActor
  private func _startCapture(position: CameraPosition) async {
    cameraPosition = position
    await manager.start { @MainActor in
      let cam = CameraCapture(camera: MoQKit.Camera(position: position))
      try await cam.start()
      return cam
    }
  }

  @MainActor
  private func _setPosition(_ position: CameraPosition) {
    if position == cameraPosition { return }
    cameraPosition = position
    guard let cam = manager.current() else { return }
    do {
      try cam.switch(to: MoQKit.Camera(position: position))
    } catch {
      onEvent?("cameraStateChanged", ["state": "error:\(error.localizedDescription)"])
    }
  }

  // MARK: - Helpers

  private static func postSessionChanged() {
    NotificationCenter.default.post(
      name: Self.captureSessionChangedNotification, object: nil)
  }

  private static func parsePosition(_ raw: String) -> CameraPosition {
    raw == "back" ? .back : .front
  }
}
