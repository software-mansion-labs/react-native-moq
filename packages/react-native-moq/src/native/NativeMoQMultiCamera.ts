import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  addListener(eventName: string): void;
  removeListeners(count: number): void;

  // Whether this device can run the front and back cameras concurrently.
  // Async because Android has to query CameraX for a bindable concurrent pair;
  // iOS resolves a synchronous capability check. Resolves false on devices that
  // don't support multi-cam.
  isSupported(): Promise<boolean>;

  // Owns a MultiCameraCapture as a refcounted singleton, mirroring MoQCamera.
  // Every startCapture must be matched by one stopCapture. Capture runs
  // asynchronously and emits 'multiCameraStateChanged' events; the publisher's
  // publish() awaits any pending start. width/height/framerate apply to both
  // the front and back streams.
  startCapture(width: number, height: number, framerate: number): void;
  stopCapture(): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('MoQMultiCamera');
