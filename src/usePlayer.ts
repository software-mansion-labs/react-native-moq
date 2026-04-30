import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeEventEmitter } from 'react-native';
import NativeMoQ from './NativeMoQ';
import type { MoQPlaybackStats, MoQPlayer } from './types';
import { MoQPlayerHandle } from './types';

const moqEmitter = new NativeEventEmitter(NativeMoQ);

export function usePlayer(
  player: MoQPlayerHandle,
  setup?: (player: MoQPlayer) => void
): MoQPlayer {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [playbackStats, setPlaybackStats] = useState<MoQPlaybackStats | null>(
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

  const { broadcastPath } = player;

  useEffect(() => {
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
          setIsPaused(false);
        } else if (e.type === 'trackPaused') {
          setIsPaused(true);
          setIsPlaying(false);
        } else if (e.type === 'allTracksStopped') {
          setIsPlaying(false);
          setIsPaused(false);
          setPlaybackStats(null);
          setCurrentVideoTrackName(undefined);
          setCurrentAudioTrackName(undefined);
        } else if (e.type === 'trackSwitched') {
          if (e.trackKind === 'video' && e.trackName !== undefined) {
            setCurrentVideoTrackName(e.trackName);
          } else if (e.trackKind === 'audio' && e.trackName !== undefined) {
            setCurrentAudioTrackName(e.trackName);
          }
        }
      }),

      moqEmitter.addListener('playbackStatsUpdated', (event) => {
        const e = event as MoQPlaybackStats & { broadcastPath: string };
        if (e.broadcastPath !== playerRef.current.broadcastPath) return;
        setPlaybackStats(e);
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
    setIsPaused(false);
  }, []);

  const pause = useCallback(() => {
    playerRef.current.pause();
    setIsPaused(true);
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

  const moqPlayer: MoQPlayer = {
    broadcastPath,
    isPlaying,
    isPaused,
    playbackStats,
    currentVideoTrackName,
    currentAudioTrackName,
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
