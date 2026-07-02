import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  addListener(eventName: string): void;
  removeListeners(count: number): void;

  // Audio codecs whose encoder can be initialized on this device (same
  // rationale as camera codec gating).
  getSupportedCodecs(): string[];

  // Mic is a device singleton, ref-counted. sampleRate applies on Android;
  // iOS ignores it (AVAudioSession drives it). Changing it while running is a
  // no-op — stop and restart to apply.
  startCapture(sampleRate: number): void;
  stopCapture(): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('MoQMicrophone');
