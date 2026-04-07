import Foundation
import MoQKit

@objc public class MoqImpl: NSObject {
  private static var sessionState: MoQSessionState = .idle

  @objc public static func getSessionState() -> String {
    return sessionState.stringValue
  }

  @objc public static func setSessionState(_ state: String) {
    sessionState = MoQSessionState(stringValue: state)
  }
}

private extension MoQSessionState {
  var stringValue: String {
    switch self {
    case .idle: return "idle"
    case .connecting: return "connecting"
    case .connected: return "connected"
    case .closed: return "closed"
    case .error(let message): return "error:\(message)"
    }
  }

  init(stringValue: String) {
    if stringValue.hasPrefix("error:") {
      self = .error(String(stringValue.dropFirst(6)))
    } else {
      switch stringValue {
      case "connecting": self = .connecting
      case "connected": self = .connected
      case "closed": self = .closed
      default: self = .idle
      }
    }
  }
}
