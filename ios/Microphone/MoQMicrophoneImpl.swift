import AVFoundation
import Foundation
import MoQKit

// Owns the device microphone as a refcounted singleton. Multiple consumers
// (useMicrophone hooks, live publishers) call start/stop independently — the
// physical mic only stops when the refcount drops to zero. The audio session
// category is driven from here too: playAndRecord while the mic is active,
// playback otherwise.
@objc public class MoQMicrophoneImpl: NSObject {
  @objc public static let shared = MoQMicrophoneImpl()
  private override init() {}

  @objc public var onEvent: ((_ name: String, _ body: [String: Any]) -> Void)?

  // MARK: - State (MainActor)

  private var microphone: MicrophoneCapture?
  private var refCount: Int = 0
  // Set while a start() is in flight so concurrent consumers (including
  // publish()) can await the same task rather than each spinning up their own.
  private var startTask: Task<MicrophoneCapture, Error>?

  @MainActor @objc public func currentMicrophone() -> MicrophoneCapture? {
    microphone
  }

  // Awaits any in-flight start so publish() can grab the mic right after the
  // useMicrophone hook calls startCapture. Throws if no consumer has asked for
  // the mic at all.
  @MainActor public func waitForMicrophone() async throws -> MicrophoneCapture {
    if let mic = microphone { return mic }
    if let task = startTask { return try await task.value }
    throw MoQCaptureError.notStarted("microphone capture not started")
  }

  // MARK: - Objc bridge

  @objc(startCaptureWithSampleRate:)
  public func startCapture(sampleRate: Double) {
    Task { @MainActor in await self._startCapture(sampleRate: sampleRate) }
  }

  @objc public func stopCapture() {
    Task { @MainActor in self._stopCapture() }
  }

  @objc public func supportedCodecs() -> [String] {
    AudioEncoderConfig.supportedCodecs().map { codec -> String in
      switch codec {
      case .opus: return "opus"
      case .aac: return "aac"
      @unknown default: return ""
      }
    }.filter { !$0.isEmpty }
  }

  // MARK: - Lifecycle

  @MainActor
  private func _startCapture(sampleRate _: Double) async {
    refCount += 1
    if microphone != nil || startTask != nil { return }

    emitState("starting")
    MoQMicrophoneImpl.configurePublishingAudioSession()

    let task = Task<MicrophoneCapture, Error> { @MainActor in
      let mic = MicrophoneCapture()
      try await mic.start()
      return mic
    }
    startTask = task

    do {
      let mic = try await task.value
      // Consumer might have already called stopCapture while we were waiting;
      // honor that by not retaining the mic.
      if refCount == 0 {
        mic.stop()
        startTask = nil
        MoQMicrophoneImpl.configurePlaybackAudioSession()
        emitState("idle")
        return
      }
      microphone = mic
      startTask = nil
      emitState("active")
    } catch {
      startTask = nil
      // Roll back the refcount this start owned so a subsequent retry can
      // succeed without bookkeeping skew.
      if refCount > 0 { refCount -= 1 }
      if refCount == 0 { MoQMicrophoneImpl.configurePlaybackAudioSession() }
      emitState("error:\(error.localizedDescription)")
    }
  }

  @MainActor
  private func _stopCapture() {
    if refCount > 0 { refCount -= 1 }
    guard refCount == 0 else { return }
    microphone?.stop()
    microphone = nil
    MoQMicrophoneImpl.configurePlaybackAudioSession()
    emitState("idle")
  }

  // MARK: - Helpers

  private func emitState(_ state: String) {
    onEvent?("micStateChanged", ["state": state])
  }

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

// Shared error type used by all three impls so publish() can distinguish
// "capture not started" from generic moq-kit failures and surface a useful
// error message.
public enum MoQCaptureError: Error, LocalizedError {
  case notStarted(String)

  public var errorDescription: String? {
    switch self {
    case .notStarted(let msg): return msg
    }
  }
}
