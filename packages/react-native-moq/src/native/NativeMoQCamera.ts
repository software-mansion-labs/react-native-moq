import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  addListener(eventName: string): void;
  removeListeners(count: number): void;

  // Returns the set of video codecs whose encoder can actually be initialized
  // on this device. Lets the JS layer hide picker options that would otherwise
  // silently terminate the publisher when selected (Android's moq-kit layer
  // doesn't surface encoder-init failures as error states).
  getSupportedCodecs(): string[];

  // The camera is a device singleton shared across all consumers (useCamera
  // hooks, live publish, on-screen <PublisherView/>). The native side
  // ref-counts: every startCapture call must be matched by exactly one
  // stopCapture. Capture starts asynchronously — emits 'cameraStateChanged'
  // events as the state progresses; the publisher's publish() awaits any
  // pending start so callers don't need to coordinate timing.
  //
  // Position is global to the camera (one physical device), so setPosition
  // affects every consumer.
  startCapture(position: string): void;
  stopCapture(): void;
  setPosition(position: string): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('MoQCamera');
