import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  addListener(eventName: string): void;
  removeListeners(count: number): void;

  // Session
  connect(url: string, prefix: string, targetLatencyMs: number): void;
  disconnect(): void;

  // Player lifecycle — JS creates and owns each player
  createPlayer(broadcastPath: string): number;
  releasePlayer(handleId: number): void;

  // Player controls (per handle)
  play(handleId: number): void;
  pause(handleId: number): void;
  updateTargetLatency(handleId: number, ms: number): void;
  switchVideoTrack(handleId: number, trackName: string): void;
  switchAudioTrack(handleId: number, trackName: string): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('MoQ');
