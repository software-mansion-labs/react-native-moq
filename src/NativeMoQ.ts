import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  addListener(eventName: string): void;
  removeListeners(count: number): void;

  // Session
  connect(url: string, targetLatencyMs: number): void;
  disconnect(): void;

  // Broadcast subscription. The native side maintains one BroadcastSubscription
  // per prefix; subscribe/unsubscribe are matched by prefix. Calling subscribe
  // twice with the same prefix is idempotent — JS-side ref-counting in
  // useBroadcasts ensures the underlying subscription is shared across hooks.
  subscribe(prefix: string): void;
  unsubscribe(prefix: string): void;

  // Player controls (per broadcast)
  play(broadcastPath: string): void;
  pause(broadcastPath: string): void;
  stopPlayer(broadcastPath: string): void;
  updateTargetLatency(broadcastPath: string, ms: number): void;
  switchVideoTrack(broadcastPath: string, trackName: string): void;
  switchAudioTrack(broadcastPath: string, trackName: string): void;

  // Audio-only player (keyed as broadcastPath + "_audio" in native)
  createAudioOnlyPlayer(broadcastPath: string): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('MoQ');
