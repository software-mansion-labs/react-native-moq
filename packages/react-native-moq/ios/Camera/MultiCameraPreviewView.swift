import AVFoundation
import UIKit

// Previews a single camera (front or back) of the shared multi-camera session.
// With an AVCaptureMultiCamSession a preview layer can't infer which camera to
// show, so we build a manual connection from the matching device input's video
// port to a connection-less preview layer (Apple's AVMultiCamPiP pattern).
@objc(MoQMultiCameraPreviewView)
public class MultiCameraPreviewView: UIView {
  // Set by the view manager from the `source` prop ('front' | 'back').
  @objc public var source: NSString = "front" {
    didSet { Task { @MainActor in self.attach() } }
  }

  private var previewLayer: AVCaptureVideoPreviewLayer?
  private var previewConnection: AVCaptureConnection?
  // The session we added previewConnection to. A no-connection preview layer
  // doesn't expose `.session`, so we must track it ourselves to be able to
  // remove the connection on teardown — otherwise the layer is deallocated with
  // a live connection still in the running session, which crashes AVFoundation.
  // Weak so a session torn down by stopCapture simply drops out.
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
    // Remove our connection while the session is still valid. The contains()
    // check covers the case where stopCapture already removed it, and the weak
    // session covers the case where the session was already deallocated.
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
