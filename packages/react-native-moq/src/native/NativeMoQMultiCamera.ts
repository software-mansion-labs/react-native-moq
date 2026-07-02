import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  addListener(eventName: string): void;
  removeListeners(count: number): void;

  // Async: Android must query CameraX for a bindable concurrent pair; iOS is
  // synchronous. Resolves false on devices without multi-cam.
  isSupported(): Promise<boolean>;

  // Refcounted singleton: each startCapture needs a matching stopCapture.
  // Async, emits 'multiCameraStateChanged'; publish() awaits pending starts.
  startCapture(width: number, height: number, framerate: number): void;
  stopCapture(): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('MoQMultiCamera');
