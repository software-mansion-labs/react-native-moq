import AVFoundation
import Foundation
import MoQKit

// Refcounted device-microphone singleton: the mic stops only when the refcount
// drops to zero. Drives the audio session category too — playAndRecord while
// active, playback otherwise.
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

  // Awaits any in-flight start so publish() can grab the mic right after a hook
  // calls startCapture. Throws if no consumer asked for the mic.
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

// Shared error type letting publish() distinguish "capture not started" from
// generic moq-kit failures.
public enum MoQCaptureError: Error, LocalizedError {
  case notStarted(String)

  public var errorDescription: String? {
    switch self {
    case .notStarted(let msg): return msg
    }
  }
}
