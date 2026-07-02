import AVFoundation
import UIKit

// Previews one camera of the multi-camera session. AVCaptureMultiCamSession
// can't infer which camera, so we build a manual connection from the matching
// input's video port to a connection-less preview layer (Apple's AVMultiCamPiP).
@objc(MoQMultiCameraPreviewView)
public class MultiCameraPreviewView: UIView {
  @objc public var source: NSString = "front" {
    didSet { Task { @MainActor in self.attach() } }
  }

  private var previewLayer: AVCaptureVideoPreviewLayer?
  private var previewConnection: AVCaptureConnection?
  // A no-connection preview layer doesn't expose `.session`, so track it to
  // remove the connection on teardown — otherwise AVFoundation crashes on a
  // layer deallocated with a live connection. Weak so stopCapture drops it out.
  private weak var previewSession: AVCaptureMultiCamSession?

  public override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .black
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(captureSessionChanged(_:)),
      name: MultiCameraImpl.captureSessionChangedNotification,
      object: nil
    )
    Task { @MainActor in self.attach() }
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) not supported")
  }

  isolated deinit {
    NotificationCenter.default.removeObserver(self)
    detach()
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    previewLayer?.frame = bounds
  }

  @objc private func captureSessionChanged(_ notification: Notification) {
    Task { @MainActor in self.attach() }
  }

  @MainActor
  private func detach() {
    // Remove our connection while the session is still valid; contains() covers
    // stopCapture already removing it, weak session covers deallocation.
    if let connection = previewConnection, let session = previewSession {
      session.beginConfiguration()
      if session.connections.contains(connection) {
        session.removeConnection(connection)
      }
      session.commitConfiguration()
    }
    previewConnection = nil
    previewSession = nil
    previewLayer?.removeFromSuperlayer()
    previewLayer = nil
  }

  @MainActor
  private func attach() {
    detach()

    guard let session = MultiCameraImpl.shared.currentCaptureSession() else { return }

    let position: AVCaptureDevice.Position = (source == "back") ? .back : .front
    guard
      let input = session.inputs
        .compactMap({ $0 as? AVCaptureDeviceInput })
        .first(where: { $0.device.position == position }),
      let port = input.ports.first(where: { $0.mediaType == .video })
    else { return }

    let layer = AVCaptureVideoPreviewLayer(sessionWithNoConnection: session)
    layer.videoGravity = .resizeAspectFill

    let connection = AVCaptureConnection(inputPort: port, videoPreviewLayer: layer)
    session.beginConfiguration()
    guard session.canAddConnection(connection) else {
      session.commitConfiguration()
      return
    }
    session.addConnection(connection)
    session.commitConfiguration()

    self.layer.insertSublayer(layer, at: 0)
    layer.frame = bounds
    previewLayer = layer
    previewConnection = connection
    previewSession = session
  }
}
