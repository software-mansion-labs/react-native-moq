import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  addListener(eventName: string): void;
  removeListeners(count: number): void;

  // Session
  connect(url: string, prefix: string, targetLatencyMs: number): void;
  disconnect(): void;

  // Player controls (by player ID)
  play(playerId: number): void;
  pause(playerId: number): void;
  stopPlayer(playerId: number): void;
  updateTargetLatency(playerId: number, ms: number): void;
  switchVideoTrack(playerId: number, trackName: string): void;
  switchAudioTrack(playerId: number, trackName: string): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('MoQ');
