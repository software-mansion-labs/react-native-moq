import ReplayKit
import UIKit

// React Native wrapper around RPSystemBroadcastPickerView. Tapping the embedded
// system button presents the broadcast sheet for the configured extension —
// the only Apple-sanctioned way to start a system-wide ReplayKit broadcast.
@objc(MoQBroadcastPickerView)
public class MoQBroadcastPickerView: UIView {
  private let picker = RPSystemBroadcastPickerView()

  public override init(frame: CGRect) {
    super.init(frame: frame)
    picker.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(picker)
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) not supported")
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    picker.frame = self.bounds
    updateButtonTintColor()
  }

  @objc var preferredExtension: String? {
    didSet {
      picker.preferredExtension = preferredExtension
    }
  }

  public override var tintColor: UIColor! {
    didSet {
      updateButtonTintColor()
    }
  }

  private func updateButtonTintColor() {
    for case let button as UIButton in picker.subviews {
      button.imageView?.tintColor = tintColor
      button.frame = picker.bounds
    }
  }
}
