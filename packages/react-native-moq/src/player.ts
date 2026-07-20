import { NativeEventEmitter } from 'react-native';
import { EventEmitter } from './EventEmitter';
import NativeMoQ from './native/NativeMoQ';
import type {
  AudioPlayer,
  BroadcastInfo,
  PlaybackStats,
  Player,
  PlayerEvents,
} from './types';
import { AUDIO_PLAYER_KEY_SUFFIX, PlayerHandle } from './types';

const moqEmitter = new NativeEventEmitter(NativeMoQ);

// Internal sink for one player's native events, shared by usePlayer and the
// imperative players. `playingChange` is deduped.
export interface PlayerEventSink {
  playingChange(isPlaying: boolean): void;
  trackStopped(): void;
  trackSwitched(trackKind: 'video' | 'audio', trackName: string): void;
  statsUpdate(stats: PlaybackStats): void;
}

export interface PlayerEventState {
  isPlaying: boolean;
  playbackStats: PlaybackStats | null;
  currentVideoTrackName?: string;
  currentAudioTrackName?: string;
}

export function clampVolume(volume: number): number {
  return Math.min(Math.max(volume, 0), 1);
}

// The one place mapping player events to state, shared by the imperative
// players and usePlayer. `state` is mutated before each re-emit, so listeners
// always read a consistent snapshot.
export function createPlayerEventBridge(
  emitter: EventEmitter<PlayerEvents>,
  initial: { videoTrackName?: string; audioTrackName?: string }
): { state: PlayerEventState; sink: PlayerEventSink } {
  const state: PlayerEventState = {
    isPlaying: false,
    playbackStats: null,
    currentVideoTrackName: initial.videoTrackName,
    currentAudioTrackName: initial.audioTrackName,
  };
  const sink: PlayerEventSink = {
    playingChange(next) {
      state.isPlaying = next;
      emitter.emit('playingChange', { isPlaying: next });
    },
    trackStopped() {
      state.playbackStats = null;
      state.currentVideoTrackName = undefined;
      state.currentAudioTrackName = undefined;
      emitter.emit('trackStopped', {});
    },
    trackSwitched(trackKind, trackName) {
      if (trackKind === 'video') state.currentVideoTrackName = trackName;
      else state.currentAudioTrackName = trackName;
      emitter.emit('trackSwitched', { trackKind, trackName });
    },
    statsUpdate(stats) {
      state.playbackStats = stats;
      emitter.emit('statsUpdate', stats);
    },
  };
  return { state, sink };
}

// Wires the shared native events for one (sessionId, broadcastPath) into the
// sink. Returns a detach function.
export function attachPlayerEvents(
  sessionId: string,
  broadcastPath: string,
  sink: PlayerEventSink
): () => void {
  let lastIsPlaying: boolean | null = null;
  const emitPlayingChange = (next: boolean) => {
    if (lastIsPlaying === next) return;
    lastIsPlaying = next;
    sink.playingChange(next);
  };

  const subs = [
    moqEmitter.addListener('playerEvent', (event) => {
      const e = event as {
        sessionId: string;
        broadcastPath: string;
        type: string;
        trackKind?: string;
        trackName?: string;
      };
      if (e.sessionId !== sessionId || e.broadcastPath !== broadcastPath)
        return;
      if (e.type === 'trackPlaying') {
        emitPlayingChange(true);
      } else if (e.type === 'trackPaused') {
        emitPlayingChange(false);
      } else if (e.type === 'allTracksStopped') {
        emitPlayingChange(false);
        sink.trackStopped();
      } else if (e.type === 'trackSwitched') {
        if (
          (e.trackKind === 'video' || e.trackKind === 'audio') &&
          e.trackName !== undefined
        ) {
          sink.trackSwitched(e.trackKind, e.trackName);
        }
      }
    }),

    moqEmitter.addListener('playbackStatsUpdated', (event) => {
      const e = event as PlaybackStats & {
        sessionId: string;
        broadcastPath: string;
      };
      if (e.sessionId !== sessionId || e.broadcastPath !== broadcastPath)
        return;
      sink.statsUpdate(e);
    }),
  ];

  return () => subs.forEach((s) => s.remove());
}

/**
 * Hook-free player; `destroy()` detaches the event listeners. For
 * `createVideoPlayer` it does not stop playback (the underlying player belongs
 * to the broadcast) — call `stop()` first if needed. For `createAudioPlayer`
 * it also releases the native audio-only player.
 */
export interface VideoPlayerHandle extends Player {
  destroy(): void;
}

/** Audio-only counterpart of `VideoPlayerHandle`; see `createAudioPlayer`. */
export interface AudioPlayerHandle extends AudioPlayer {
  destroy(): void;
}

function createPlayerFromHandle(
  handle: PlayerHandle,
  onDestroy?: () => void
): VideoPlayerHandle {
  const emitter = new EventEmitter<PlayerEvents>();
  let volume = 1;

  const { state, sink } = createPlayerEventBridge(emitter, {
    videoTrackName: handle.initialVideoTrackName,
    audioTrackName: handle.initialAudioTrackName,
  });
  const detach = attachPlayerEvents(
    handle.sessionId,
    handle.broadcastPath,
    sink
  );

  return {
    sessionId: handle.sessionId,
    broadcastPath: handle.broadcastPath,
    get isPlaying() {
      return state.isPlaying;
    },
    get playbackStats() {
      return state.playbackStats;
    },
    get currentVideoTrackName() {
      return state.currentVideoTrackName;
    },
    get currentAudioTrackName() {
      return state.currentAudioTrackName;
    },
    get volume() {
      return volume;
    },
    emitter,
    addListener: (eventName, listener) =>
      emitter.addListener(eventName, listener),
    play: () => handle.play(),
    pause: () => handle.pause(),
    stop: () => handle.stop(),
    updateTargetLatency: (ms) => handle.updateTargetLatency(ms),
    switchVideoTrack: (trackName) => handle.switchVideoTrack(trackName),
    switchAudioTrack: (trackName) => handle.switchAudioTrack(trackName),
    setVolume(next) {
      const clamped = clampVolume(next);
      handle.setVolume(clamped);
      volume = clamped;
    },
    destroy() {
      detach();
      onDestroy?.();
    },
  };
}

/**
 * Imperative counterpart of `useVideoPlayer` for non-React code. State fields
 * are live getters; observe changes via `addListener`. Create a new player if
 * the broadcast disappears and re-announces (its native player is replaced).
 */
export function createVideoPlayer(broadcast: BroadcastInfo): VideoPlayerHandle {
  return createPlayerFromHandle(broadcast.player);
}

/**
 * Imperative counterpart of `useAudioPlayer` for non-React code. Creates a
 * native audio-only player for the broadcast; `destroy()` releases it.
 */
export function createAudioPlayer(broadcast: BroadcastInfo): AudioPlayerHandle {
  const { sessionId, path } = broadcast;
  const audioKey = path + AUDIO_PLAYER_KEY_SUFFIX;
  // Bridge-only handle: the native player is created async after
  // createAudioOnlyPlayer, so there's no JSI object yet.
  const handle = new PlayerHandle(
    sessionId,
    audioKey,
    undefined,
    undefined,
    broadcast.audioTracks[0]?.name
  );
  NativeMoQ.createAudioOnlyPlayer(sessionId, path);
  return createPlayerFromHandle(handle, () =>
    NativeMoQ.stopPlayer(sessionId, audioKey)
  );
}
