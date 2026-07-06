import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  // Standalone push source (mirrors MoQDataTrack). sampleRate/channels are fixed
  // here and must match the publish-time encoder config.
  create(trackId: string, sampleRate: number, channels: number): void;

  // An already-attached publisher keeps working; further send() calls are ignored.
  destroy(trackId: string): void;

  // base64Pcm is interleaved signed 16-bit little-endian PCM. No-op until the
  // track is published and started.
  send(trackId: string, base64Pcm: string): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('MoQAudioSource');
