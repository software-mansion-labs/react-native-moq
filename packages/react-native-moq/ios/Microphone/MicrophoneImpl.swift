import AVFoundation
import Foundation
import MoQKit

// Owns the device microphone as a refcounted singleton. Multiple consumers
// (useMicrophone hooks, live publishers) call start/stop independently — the
// physical mic only stops when the refcount drops to zero (see
// RefcountedCapture). The audio session category is driven from here too:
// playAndRecord while the mic is active, playback otherwise.
@objc public class MicrophoneImpl: NSObject {
  @objc public static let shared = MicrophoneImpl()
  private override init() {}

  @objc public var onEvent: ((_ name: String, _ body: [String: Any]) -> Void)?

  private lazy var manager = RefcountedCapture<MicrophoneCapture>(
    emit: { [weak self] in self?.onEvent?("micStateChanged", ["state": $0]) },
    stopCapture: { $0.stop() },
    onStarting: { MicrophoneImpl.configurePublishingAudioSession() },
    onInactive: { MicrophoneImpl.configurePlaybackAudioSession() })

  @MainActor @objc public func currentMicrophone() -> MicrophoneCapture? {
    manager.current()
  }

  // Awaits any in-flight start so publish() can grab the mic right after the
  // useMicrophone hook calls startCapture. Throws if no consumer has asked for
  // the mic at all.
  @MainActor public func waitForMicrophone() async throws -> MicrophoneCapture {
    try await manager.waitForCapture("microphone capture not started")
  }

  // MARK: - Objc bridge

  @objc(startCaptureWithSampleRate:)
  public func startCapture(sampleRate: Double) {
    Task { @MainActor in await self._startCapture(sampleRate: sampleRate) }
  }

  @objc public func stopCapture() {
    Task { @MainActor in self.manager.stop() }
  }

  @objc public func supportedCodecs() -> [String] {
    AudioEncoderConfig.supportedCodecs().compactMap { $0.jsString }
  }

  // MARK: - Lifecycle

  @MainActor
  private func _startCapture(sampleRate _: Double) async {
    await manager.start { @MainActor in
      let mic = MicrophoneCapture()
      try await mic.start()
      return mic
    }
  }

  // MARK: - Helpers

  static func configurePublishingAudioSession() {
    let s = AVAudioSession.sharedInstance()
    try? s.setCategory(
      .playAndRecord, mode: .videoRecording,
      options: [.defaultToSpeaker, .allowBluetoothHFP])
    try? s.setActive(true)
  }

  static func configurePlaybackAudioSession() {
    let s = AVAudioSession.sharedInstance()
    try? s.setCategory(.playback, mode: .moviePlayback, options: [])
    try? s.setActive(true)
  }
}

// Shared error type used by all three capture impls (and RefcountedCapture) so
// publish() can distinguish "capture not started" from generic moq-kit failures
// and surface a useful error message.
public enum MoQCaptureError: Error, LocalizedError {
  case notStarted(String)

  public var errorDescription: String? {
    switch self {
    case .notStarted(let msg): return msg
    }
  }
}
