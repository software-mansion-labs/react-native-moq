import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeEventEmitter } from 'react-native';
import { EventEmitter } from './EventEmitter';
import NativeMoQ from './NativeMoQ';
import type { PlaybackStats, Player, PlayerEvents } from './types';
import { PlayerHandle } from './types';

const moqEmitter = new NativeEventEmitter(NativeMoQ);

export function usePlayer(
  player: PlayerHandle,
  setup?: (player: Player) => void
): Player {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackStats, setPlaybackStats] = useState<PlaybackStats | null>(
    null
  );
  const [currentVideoTrackName, setCurrentVideoTrackName] = useState<
    string | undefined
  >(player.initialVideoTrackName);
  const [currentAudioTrackName, setCurrentAudioTrackName] = useState<
    string | undefined
  >(player.initialAudioTrackName);

  const playerRef = useRef(player);
  playerRef.current = player;

  const emitterRef = useRef(new EventEmitter<PlayerEvents>());
  const lastPlayingChangeRef = useRef<{ isPlaying: boolean } | null>(null);

  const { broadcastPath } = player;

  useEffect(() => {
    // Reset dedup state when the player identity changes.
    lastPlayingChangeRef.current = null;

    const emitter = emitterRef.current;

    const emitPlayingChange = (next: { isPlaying: boolean }) => {
      const last = lastPlayingChangeRef.current;
      if (last?.isPlaying === next.isPlaying) return;
      lastPlayingChangeRef.current = next;
      emitter.emit('playingChange', next);
    };

    const subs = [
      moqEmitter.addListener('playerEvent', (event) => {
        const e = event as {
          broadcastPath: string;
          type: string;
          trackKind?: string;
          trackName?: string;
        };
        if (e.broadcastPath !== playerRef.current.broadcastPath) return;
        if (e.type === 'trackPlaying') {
          setIsPlaying(true);
          emitPlayingChange({ isPlaying: true });
        } else if (e.type === 'trackPaused') {
          setIsPlaying(false);
          emitPlayingChange({ isPlaying: false });
        } else if (e.type === 'allTracksStopped') {
          setIsPlaying(false);
          setPlaybackStats(null);
          setCurrentVideoTrackName(undefined);
          setCurrentAudioTrackName(undefined);
          emitPlayingChange({ isPlaying: false });
          emitter.emit('trackStopped', {});
        } else if (e.type === 'trackSwitched') {
          if (e.trackKind === 'video' && e.trackName !== undefined) {
            setCurrentVideoTrackName(e.trackName);
            emitter.emit('trackSwitched', {
              trackKind: 'video',
              trackName: e.trackName,
            });
          } else if (e.trackKind === 'audio' && e.trackName !== undefined) {
            setCurrentAudioTrackName(e.trackName);
            emitter.emit('trackSwitched', {
              trackKind: 'audio',
              trackName: e.trackName,
            });
          }
        }
      }),

      moqEmitter.addListener('playbackStatsUpdated', (event) => {
        const e = event as PlaybackStats & { broadcastPath: string };
        if (e.broadcastPath !== playerRef.current.broadcastPath) return;
        setPlaybackStats(e);
        emitter.emit('statsUpdate', e);
      }),
    ];

    return () => {
      subs.forEach((s) => s.remove());
    };
    // Intentionally keyed on broadcastPath string — re-subscribe only when
    // the player changes identity.
  }, [broadcastPath]);

  const play = useCallback(() => {
    playerRef.current.play();
  }, []);

  const pause = useCallback(() => {
    playerRef.current.pause();
  }, []);

  const stop = useCallback(() => {
    playerRef.current.stop();
  }, []);

  const updateTargetLatency = useCallback((ms: number) => {
    playerRef.current.updateTargetLatency(ms);
  }, []);

  const switchVideoTrack = useCallback((trackName: string) => {
    playerRef.current.switchVideoTrack(trackName);
  }, []);

  const switchAudioTrack = useCallback((trackName: string) => {
    playerRef.current.switchAudioTrack(trackName);
  }, []);

  const moqPlayer: Player = {
    broadcastPath,
    isPlaying,
    playbackStats,
    currentVideoTrackName,
    currentAudioTrackName,
    emitter: emitterRef.current,
    play,
    pause,
    stop,
    updateTargetLatency,
    switchVideoTrack,
    switchAudioTrack,
  };

  const moqPlayerRef = useRef(moqPlayer);
  moqPlayerRef.current = moqPlayer;

  const setupRef = useRef(setup);

  useEffect(() => {
    setupRef.current?.(moqPlayerRef.current);
  }, []);

  return moqPlayer;
}
