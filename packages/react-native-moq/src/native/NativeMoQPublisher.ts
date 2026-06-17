import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  addListener(eventName: string): void;
  removeListeners(count: number): void;

  // tracksJson lists the sources to publish, snapshotted at this call. Each
  // entry references a source that must already exist via the corresponding
  // hook (useCamera / useMicrophone / useDataTrack). Shape:
  // [
  //   { type: 'camera', name: string,
  //     encoder: { codec: 'h264'|'h265', width: number, height: number, framerate: number } },
  //   { type: 'microphone', name: string,
  //     encoder: { codec: 'opus'|'aac', sampleRate: number } },
  //   { type: 'data', name: string, id: string }
  // ]
  // The 'data' entry's id is the emitter created by useDataTrack; the publisher
  // looks it up and wires it as a MoQ data track. Reuses the MoQ Session opened
  // via NativeMoQ.connect() for the given sessionId; errors out if no such
  // session is connected or if a referenced capture/emitter does not exist.
  // Multiple sessions may host concurrent publishers — track-state and
  // publisher-state events carry the sessionId.
  publish(sessionId: string, path: string, tracksJson: string): void;
  stop(sessionId: string): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('MoQPublisher');
