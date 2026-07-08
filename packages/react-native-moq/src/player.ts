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
  let isPlaying = false;
  let playbackStats: PlaybackStats | null = null;
  let currentVideoTrackName = handle.initialVideoTrackName;
  let currentAudioTrackName = handle.initialAudioTrackName;
  let volume = 1;

  const detach = attachPlayerEvents(handle.sessionId, handle.broadcastPath, {
    playingChange(next) {
      isPlaying = next;
      emitter.emit('playingChange', { isPlaying: next });
    },
    trackStopped() {
      playbackStats = null;
      currentVideoTrackName = undefined;
      currentAudioTrackName = undefined;
      emitter.emit('trackStopped', {});
    },
    trackSwitched(trackKind, trackName) {
      if (trackKind === 'video') currentVideoTrackName = trackName;
      else currentAudioTrackName = trackName;
      emitter.emit('trackSwitched', { trackKind, trackName });
    },
    statsUpdate(stats) {
      playbackStats = stats;
      emitter.emit('statsUpdate', stats);
    },
  });

  return {
    sessionId: handle.sessionId,
    broadcastPath: handle.broadcastPath,
    get isPlaying() {
      return isPlaying;
    },
    get playbackStats() {
      return playbackStats;
    },
    get currentVideoTrackName() {
      return currentVideoTrackName;
    },
    get currentAudioTrackName() {
      return currentAudioTrackName;
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
      const clamped = Math.min(Math.max(next, 0), 1);
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
