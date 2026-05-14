import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  addListener(eventName: string): void;
  removeListeners(count: number): void;

  // The publisher is a singleton: at most one active publish at a time, and
  // the preview camera is shared between the <PublisherView /> preview and
  // the live capture. Mounting a PublisherView ref-counts startPreview.
  startPreview(cameraPosition: string): void;
  stopPreview(): void;
  flipCamera(): void;

  // optsJson keeps the TurboModule schema small while still letting the JS
  // hook expose optional codec/resolution/framerate props. Shape:
  // { cameraEnabled?: boolean, micEnabled?: boolean,
  //   videoCodec?: 'h264' | 'h265', width?: number, height?: number,
  //   framerate?: number, audioCodec?: 'opus' | 'aac', audioSampleRate?: number }
  publish(url: string, path: string, optsJson: string): void;
  stop(): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('MoQPublisher');
