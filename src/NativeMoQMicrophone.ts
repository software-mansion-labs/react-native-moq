import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  addListener(eventName: string): void;
  removeListeners(count: number): void;

  // Returns the set of audio codecs whose encoder can actually be initialized
  // on this device. Same rationale as camera codec gating.
  getSupportedCodecs(): string[];

  // Microphone is a device singleton, ref-counted. sampleRate is the AudioRecord
  // capture format on Android; ignored on iOS (the AVAudioSession category
  // drives it). Changing sample rate while the mic is already running is a
  // no-op — stop and restart to apply.
  startCapture(sampleRate: number): void;
  stopCapture(): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('MoQMicrophone');
