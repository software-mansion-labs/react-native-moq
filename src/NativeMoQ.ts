import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  addListener(eventName: string): void;
  removeListeners(count: number): void;

  // Session
  connect(url: string, prefix: string, targetLatencyMs: number): void;
  disconnect(): void;

  // Player controls (per broadcast)
  play(broadcastPath: string): void;
  playAudioOnly(broadcastPath: string): void;
  pause(broadcastPath: string): void;
  stopPlayer(broadcastPath: string): void;
  updateTargetLatency(broadcastPath: string, ms: number): void;
  switchVideoTrack(broadcastPath: string, trackName: string): void;
  switchAudioTrack(broadcastPath: string, trackName: string): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('MoQ');
