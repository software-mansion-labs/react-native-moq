import AVFoundation
import Foundation
import MoQKit

// Refcounted concurrent front+back capture singleton, mirroring CameraImpl. The
// cameras stop only when the refcount drops to zero; the two are fixed front/back.
@objc public class MultiCameraImpl: NSObject {
  @objc public static let shared = MultiCameraImpl()
  private override init() {}

  @objc public var onEvent: ((_ name: String, _ body: [String: Any]) -> Void)?

  // Posted when the shared AVCaptureMultiCamSession is created/torn down; MultiCameraPreviewView (re)attaches its layer.
  @objc public static let captureSessionChangedNotification = Notification.Name(
    "MultiCameraImpl.cameraSessionChanged")

  private lazy var manager = RefcountedCapture<MultiCameraCapture>(
    emit: { [weak self] in self?.onEvent?("multiCameraStateChanged", ["state": $0]) },
    stopCapture: { $0.stop() },
    onActive: { MultiCameraImpl.postSessionChanged() },
    onInactive: { MultiCameraImpl.postSessionChanged() })

  private var width: Int32 = 720
  private var height: Int32 = 1280
  private var maxFrameRate: Double = 30

  @objc public func isSupported() -> Bool {
    MultiCameraCapture.isSupported
  }

  @MainActor @objc public func currentCaptureSession() -> AVCaptureMultiCamSession? {
    manager.current()?.captureSession
  }

  @MainActor public func waitForCapture() async throws -> MultiCameraCapture {
    try await manager.waitForCapture("multi-camera capture not started")
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
    Task { @MainActor in self.manager.stop() }
  }

  // MARK: - Lifecycle

  @MainActor
  private func _startCapture(width: Int32, height: Int32, framerate: Double) async {
    self.width = width
    self.height = height
    self.maxFrameRate = framerate
    await manager.start(
      preflight: {
        MultiCameraCapture.isSupported
          ? nil : "multi-camera is not supported on this device"
      },
      make: { @MainActor in
        let cap = MultiCameraCapture(
          front: MoQKit.Camera(position: .front, width: width, height: height),
          back: MoQKit.Camera(position: .back, width: width, height: height),
          maxFrameRate: framerate)
        try await cap.start()
        return cap
      })
  }

  // MARK: - Helpers

  private static func postSessionChanged() {
    NotificationCenter.default.post(
      name: Self.captureSessionChangedNotification, object: nil)
  }
}
