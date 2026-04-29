import AVFoundation
import UIKit

@objc(MoQVideoView)
public class MoQVideoView: UIView {
  private var displayLayer: AVSampleBufferDisplayLayer?

  @objc var playerId: Int = 0 {
    didSet {
      attach(layer: playerId > 0 ? MoQImpl.shared.videoLayer(forPlayerId: playerId) : nil)
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
    let changedId = (notification.object as? NSNumber)?.intValue
    // nil object = disconnect (all players removed); otherwise filter by playerId
    guard changedId == nil || changedId == playerId else { return }
    attach(layer: playerId > 0 ? MoQImpl.shared.videoLayer(forPlayerId: playerId) : nil)
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
