import AVFoundation
import UIKit

@objc(MoQCameraPreviewView)
public class CameraPreviewView: UIView {
  private var previewLayer: AVCaptureVideoPreviewLayer?

  public override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .black
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(captureSessionChanged(_:)),
      name: CameraImpl.captureSessionChangedNotification,
      object: nil
    )
    Task { @MainActor in self.attach() }
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) not supported")
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    previewLayer?.frame = bounds
  }

  @objc private func captureSessionChanged(_ notification: Notification) {
    Task { @MainActor in self.attach() }
  }

  @MainActor
  private func attach() {
    let session = CameraImpl.shared.currentCaptureSession()

    if previewLayer?.session !== session {
      previewLayer?.removeFromSuperlayer()
      previewLayer = nil
    }

    guard let session else { return }

    if previewLayer == nil {
      let layer = AVCaptureVideoPreviewLayer(session: session)
      layer.videoGravity = .resizeAspectFill
      self.layer.insertSublayer(layer, at: 0)
      layer.frame = bounds
      previewLayer = layer
    }
  }
}
