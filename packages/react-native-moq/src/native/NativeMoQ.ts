import { TurboModuleRegistry, type TurboModule } from 'react-native';

// Every method takes a `sessionId` so multiple useSession instances can coexist.
export interface Spec extends TurboModule {
  addListener(eventName: string): void;
  removeListeners(count: number): void;

  connect(sessionId: string, url: string, targetLatencyMs: number): void;
  disconnect(sessionId: string): void;

  // subscribe/unsubscribe are matched by (sessionId, prefix); idempotent.
  subscribe(sessionId: string, prefix: string): void;
  unsubscribe(sessionId: string, prefix: string): void;

  play(sessionId: string, broadcastPath: string): void;
  pause(sessionId: string, broadcastPath: string): void;
  stopPlayer(sessionId: string, broadcastPath: string): void;
  updateTargetLatency(
    sessionId: string,
    broadcastPath: string,
    ms: number
  ): void;
  switchVideoTrack(
    sessionId: string,
    broadcastPath: string,
    trackName: string
  ): void;
  switchAudioTrack(
    sessionId: string,
    broadcastPath: string,
    trackName: string
  ): void;
  setVolume(sessionId: string, broadcastPath: string, volume: number): void;

  createAudioOnlyPlayer(sessionId: string, broadcastPath: string): void;

  // Ref-counted per (sessionId, broadcastPath, trackName). Each object is
  // forwarded as a `trackObject` event with base64 `data`, `groupSequence`,
  // `objectIndex`.
  subscribeTrackObjects(
    sessionId: string,
    broadcastPath: string,
    trackName: string
  ): void;
  unsubscribeTrackObjects(
    sessionId: string,
    broadcastPath: string,
    trackName: string
  ): void;

  // Decoded-PCM streaming, ref-counted per (sessionId, broadcastPath,
  // trackName, sampleFormat). Each chunk is forwarded as an `audioData` event
  // with base64 interleaved PCM, frameCount, timestampUs, sampleRate,
  // channelCount. `sampleFormat` is 'f32' | 'i16'.
  subscribeAudioData(
    sessionId: string,
    broadcastPath: string,
    trackName: string,
    sampleFormat: string
  ): void;
  unsubscribeAudioData(
    sessionId: string,
    broadcastPath: string,
    trackName: string,
    sampleFormat: string
  ): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('MoQ');
