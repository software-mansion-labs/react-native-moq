import { TurboModuleRegistry, type TurboModule } from 'react-native';

// All methods take a `sessionId` so multiple useSession instances can coexist.
// JS generates the id in useSession and threads it through subscribe / player
// methods; the native side keeps per-session maps of Session, subscriptions,
// and players.
export interface Spec extends TurboModule {
  addListener(eventName: string): void;
  removeListeners(count: number): void;

  // Session
  connect(sessionId: string, url: string, targetLatencyMs: number): void;
  disconnect(sessionId: string): void;

  // Broadcast subscription. The native side maintains one BroadcastSubscription
  // per (sessionId, prefix); subscribe/unsubscribe are matched by both.
  // Calling subscribe twice with the same key is idempotent — JS-side
  // ref-counting in useBroadcasts ensures the underlying subscription is
  // shared across hooks.
  subscribe(sessionId: string, prefix: string): void;
  unsubscribe(sessionId: string, prefix: string): void;

  // Player controls (per session + broadcast)
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

  // Audio-only player (keyed as broadcastPath + "_audio" in native, scoped by session)
  createAudioOnlyPlayer(sessionId: string, broadcastPath: string): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('MoQ');
