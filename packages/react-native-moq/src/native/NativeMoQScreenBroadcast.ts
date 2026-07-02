import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  addListener(eventName: string): void;
  removeListeners(count: number): void;

  // Screen broadcast runs out-of-process (iOS Broadcast Upload Extension /
  // Android foreground Service) with its own MoQ session, not the host app's.
  // configureScreenBroadcast persists the URL/path/encoder config for the
  // extension or service to pick up. On Android, follow with startScreenBroadcast
  // (triggers the MediaProjection consent dialog); iOS can't start it
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

export default TurboModuleRegistry.getEnforcing<Spec>('MoQScreenBroadcast');
