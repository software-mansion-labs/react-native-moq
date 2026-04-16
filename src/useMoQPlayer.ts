import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeEventEmitter } from 'react-native';
import NativeMoq from './NativeMoq';
import type { MoQPlaybackStats, MoQPlayerState } from './types';

const moqEmitter = new NativeEventEmitter(NativeMoq);

export interface UseMoQPlayerOptions {
  /** Override the target buffering latency in milliseconds for this player. */
  targetLatencyMs?: number;
}

export function useMoQPlayer(
  broadcastPath: string,
  options: UseMoQPlayerOptions = {}
): MoQPlayerState {
  const { targetLatencyMs } = options;

  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [playbackStats, setPlaybackStats] = useState<MoQPlaybackStats | null>(
    null
  );

  const pathRef = useRef(broadcastPath);
  pathRef.current = broadcastPath;

  useEffect(() => {
    if (targetLatencyMs !== undefined) {
      NativeMoq.updateTargetLatency(broadcastPath, targetLatencyMs);
    }
  }, [broadcastPath, targetLatencyMs]);

  useEffect(() => {
    const subs = [
      moqEmitter.addListener('playerEvent', (event) => {
        const e = event as { broadcastPath: string; type: string };
        if (e.broadcastPath !== pathRef.current) return;
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
        }
      }),

      moqEmitter.addListener('playbackStatsUpdated', (event) => {
        const e = event as MoQPlaybackStats & { broadcastPath: string };
        if (e.broadcastPath !== pathRef.current) return;
        setPlaybackStats(e);
      }),
    ];

    return () => {
      subs.forEach((s) => s.remove());
    };
  }, []);

  const play = useCallback(() => {
    NativeMoq.play(pathRef.current);
    setIsPaused(false);
  }, []);

  const pause = useCallback(() => {
    NativeMoq.pause(pathRef.current);
    setIsPaused(true);
  }, []);

  const stop = useCallback(() => {
    NativeMoq.stopPlayer(pathRef.current);
  }, []);

  const updateTargetLatency = useCallback((ms: number) => {
    NativeMoq.updateTargetLatency(pathRef.current, ms);
  }, []);

  return {
    isPlaying,
    isPaused,
    playbackStats,
    play,
    pause,
    stop,
    updateTargetLatency,
  };
}
