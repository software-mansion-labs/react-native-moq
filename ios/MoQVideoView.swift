import AVFoundation
import UIKit

@objc(MoQVideoView)
public class MoQVideoView: UIView {
  private var displayLayer: AVSampleBufferDisplayLayer?

  @objc var broadcastPath: String? {
    didSet {
      attach(layer: broadcastPath.flatMap { MoQImpl.shared.videoLayer(for: $0) })
    }
  }

  public override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .black
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(playerDidChange(_:)),
      name: MoQImpl.playerChangedNotification,
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

  @objc private func playerDidChange(_ notification: Notification) {
    let changedPath = notification.object as? String
    // nil object = disconnect (all players removed); otherwise filter by path
    guard changedPath == nil || changedPath == broadcastPath else { return }
    attach(layer: broadcastPath.flatMap { MoQImpl.shared.videoLayer(for: $0) })
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
