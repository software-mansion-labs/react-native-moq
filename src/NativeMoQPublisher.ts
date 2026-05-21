import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  addListener(eventName: string): void;
  removeListeners(count: number): void;

  // Returns the set of codecs whose encoder can actually be initialized on
  // this device. Lets the JS layer hide picker options that would otherwise
  // silently terminate the publisher when selected (Android's moq-kit layer
  // doesn't surface encoder-init failures as error states).
  // Shape: { video: ('h264' | 'h265')[]; audio: ('opus' | 'aac')[] }
  getSupportedCodecs(): { video: string[]; audio: string[] };

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

  // Screen broadcasting runs out-of-process on iOS (Broadcast Upload Extension)
  // and in a foreground Service on Android. It always publishes to its own
  // path (passed in optsJson) — distinct from the host's publish() path.
  //
  // configureScreenBroadcast persists the relay URL + path + encoder config so
  // that the iOS extension (launched via <BroadcastPickerView/>) or the
  // Android service can pick them up. On Android, call startScreenBroadcast
  // afterwards to actually launch the foreground service (this triggers the
  // MediaProjection consent dialog). iOS cannot start the broadcast
  // programmatically — the user must tap the system broadcast picker.
  //
  // optsJson shape:
  // { path: string,
  //   appGroupIdentifier?: string,  // iOS only, required there
  //   appAudio?: boolean,           // iOS only (default true)
  //   mic?: boolean,                // default true
  //   videoCodec?: 'h264' | 'h265', width?: number, height?: number,
  //   framerate?: number,
  //   audioCodec?: 'opus' | 'aac', audioSampleRate?: number }
  configureScreenBroadcast(url: string, optsJson: string): void;
  startScreenBroadcast(): Promise<void>;
  stopScreenBroadcast(): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('MoQPublisher');
