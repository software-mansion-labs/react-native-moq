import AVFoundation
import UIKit

@objc(MoQVideoView)
public class MoQVideoView: UIView {
  private var displayLayer: AVSampleBufferDisplayLayer?

  public override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .black
    attach(layer: MoqImpl.shared.videoLayer)
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(playerDidChange),
      name: MoqImpl.playerChangedNotification,
      object: nil
    )
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) not supported")
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    displayLayer?.frame = bounds
  }

  @objc private func playerDidChange() {
    attach(layer: MoqImpl.shared.videoLayer)
  }

  private func attach(layer newLayer: AVSampleBufferDisplayLayer?) {
    displayLayer?.removeFromSuperlayer()
    displayLayer = newLayer
    if let newLayer {
      self.layer.addSublayer(newLayer)
      newLayer.frame = bounds
    }
  }
}
