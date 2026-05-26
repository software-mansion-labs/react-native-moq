import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  addListener(eventName: string): void;
  removeListeners(count: number): void;

  // tracksJson lists the sources to publish, snapshotted at this call. Each
  // entry references a capture that must already be started via the
  // corresponding hook (useCamera / useMicrophone). Shape:
  // [
  //   { type: 'camera', name: string,
  //     encoder: { codec: 'h264'|'h265', width: number, height: number, framerate: number } },
  //   { type: 'microphone', name: string,
  //     encoder: { codec: 'opus'|'aac', sampleRate: number } }
  // ]
  // Reuses the MoQ Session opened via NativeMoQ.connect() for the given
  // sessionId; errors out if no such session is connected or if a referenced
  // capture has not been started. Multiple sessions may host concurrent
  // publishers — track-state and publisher-state events carry the sessionId.
  publish(sessionId: string, path: string, tracksJson: string): void;
  stop(sessionId: string): void;

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
