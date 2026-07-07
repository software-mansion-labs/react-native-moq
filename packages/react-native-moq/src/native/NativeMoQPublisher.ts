import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  addListener(eventName: string): void;
  removeListeners(count: number): void;

  // tracksJson references sources that must already exist via useCamera /
  // useMicrophone / useDataTrack / useAudioSource / useVideoSource. Shape:
  // [
  //   { type: 'camera', name: string,
  //     encoder: { codec: 'h264'|'h265', width: number, height: number, framerate: number } },
  //   { type: 'microphone', name: string,
  //     encoder: { codec: 'opus'|'aac', sampleRate: number } },
  //   { type: 'data', name: string, id: string },  // id = useDataTrack emitter
  //   { type: 'audioSource', name: string, id: string,  // id = useAudioSource
  //     encoder: { codec: 'opus'|'aac', sampleRate: number, channels: number } },
  //   { type: 'videoSource', name: string, id: string,  // id = useVideoSource (iOS)
  //     encoder: { codec: 'h264'|'h265', width: number, height: number, framerate: number } }
  // ]
  // Reuses the session from NativeMoQ.connect(sessionId); errors if it or a
  // referenced source is missing. Events carry sessionId for concurrent publishers.
  publish(sessionId: string, path: string, tracksJson: string): void;
  stop(sessionId: string): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('MoQPublisher');
