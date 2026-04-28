import AVFoundation
import UIKit

@objc(MoQVideoView)
public class MoQVideoView: UIView {
  private var displayLayer: AVSampleBufferDisplayLayer?

  @objc var playerHandle: NSNumber? {
    didSet {
      let handleId = playerHandle?.intValue ?? 0
      attach(layer: handleId > 0 ? MoQImpl.shared.videoLayer(forHandleId: handleId) : nil)
    }
  }

  public override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .black
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) not supported")
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    displayLayer?.frame = bounds
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
