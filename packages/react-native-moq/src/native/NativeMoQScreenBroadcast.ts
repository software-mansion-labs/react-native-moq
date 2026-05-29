import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  addListener(eventName: string): void;
  removeListeners(count: number): void;

  // Screen broadcasting runs out-of-process on iOS (Broadcast Upload Extension)
  // and in a foreground Service on Android. It opens its own MoQ session using
  // the URL passed here — it does not share the host app's MoQPublisher
  // session.
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

export default TurboModuleRegistry.getEnforcing<Spec>('MoQScreenBroadcast');
