import AVFoundation
import UIKit

@objc(MoQCameraPreviewView)
public class MoQCameraPreviewView: UIView {
  private var previewLayer: AVCaptureVideoPreviewLayer?

  private var startedPreview = false

  public override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .black
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(captureSessionChanged(_:)),
      name: MoQPublisherImpl.cameraSessionChangedNotification,
      object: nil
    )
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) not supported")
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
    if startedPreview {
      Task { @MainActor in MoQPublisherImpl.shared.stopPreview() }
    }
  }

  @objc var cameraPosition: String? {
    didSet {
      guard let new = cameraPosition else { return }
      if !startedPreview {
        startedPreview = true
        MoQPublisherImpl.shared.startPreview(cameraPosition: new)
        attach()
      } else if new != oldValue {
        MoQPublisherImpl.shared.flipCamera()
      }
    }
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    previewLayer?.frame = bounds
  }

  @objc private func captureSessionChanged(_ notification: Notification) {
    attach()
  }

  @MainActor
  private func attach() {
    let session = MoQPublisherImpl.shared.currentCaptureSession()

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
