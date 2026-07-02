import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  addListener(eventName: string): void;
  removeListeners(count: number): void;

  // Video codecs whose encoder can be initialized on this device. Android's
  // moq-kit doesn't surface encoder-init failures, so unsupported picks would
  // silently terminate the publisher.
  getSupportedCodecs(): string[];

  // Camera is a device singleton, ref-counted: every startCapture must be
  // matched by one stopCapture. Capture starts asynchronously (emits
  // 'cameraStateChanged'). Position is global to the physical device.
  startCapture(position: string): void;
  stopCapture(): void;
  setPosition(position: string): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('MoQCamera');
