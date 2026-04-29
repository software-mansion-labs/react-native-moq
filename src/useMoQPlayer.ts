import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeEventEmitter } from 'react-native';
import NativeMoQ from './NativeMoQ';
import type {
  MoQPlaybackStats,
  MoQPlayerState,
  MoQVideoTrackInfo,
} from './types';
import { MoQPlayerHandle } from './types';

const moqEmitter = new NativeEventEmitter(NativeMoQ);

export interface UseMoQPlayerOptions {
  /** Override the target buffering latency in milliseconds for this player. */
  targetLatencyMs?: number;
  /**
   * Available video tracks for this broadcast. When provided, the hook
   * initialises currentVideoTrackName to the first track, matching the
   * default selection made by the native player.
   */
  videoTracks?: MoQVideoTrackInfo[];
}

export function useMoQPlayer(
  player: MoQPlayerHandle,
  options: UseMoQPlayerOptions = {}
): MoQPlayerState {
  const { targetLatencyMs, videoTracks } = options;

  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [playbackStats, setPlaybackStats] = useState<MoQPlaybackStats | null>(
    null
  );
  const [currentVideoTrackName, setCurrentVideoTrackName] = useState<
    string | undefined
  >(() => videoTracks?.[0]?.name);
  const [currentAudioTrackName, setCurrentAudioTrackName] = useState<
    string | undefined
  >(undefined);

  const playerRef = useRef(player);
  playerRef.current = player;

  const { broadcastPath } = player;

  useEffect(() => {
    if (targetLatencyMs !== undefined) {
      player.updateTargetLatency(targetLatencyMs);
    }
  }, [player, targetLatencyMs]);

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

  return {
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
}
