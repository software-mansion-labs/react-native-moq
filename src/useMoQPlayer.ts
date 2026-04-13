import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeEventEmitter } from 'react-native';
import NativeMoq from './NativeMoq';
import type {
  MoQBroadcastInfo,
  MoQPlaybackStats,
  MoQPlayer,
  MoQSessionState,
} from './types';

const moqEmitter = new NativeEventEmitter(NativeMoq);

export interface UseMoQPlayerOptions {
  /** Track namespace prefix passed to MoQSession. Defaults to `''`. */
  prefix?: string;
  /** Target buffering latency in milliseconds. Defaults to `200`. */
  targetLatencyMs?: number;
}

export function useMoQPlayer(
  url: string,
  options: UseMoQPlayerOptions = {}
): MoQPlayer {
  const { prefix = '', targetLatencyMs = 200 } = options;

  const [sessionState, setSessionState] = useState<MoQSessionState>('idle');
  const [broadcasts, setBroadcasts] = useState<MoQBroadcastInfo[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [playbackStats, setPlaybackStats] = useState<MoQPlaybackStats | null>(
    null
  );

  const urlRef = useRef(url);
  const prefixRef = useRef(prefix);
  urlRef.current = url;
  prefixRef.current = prefix;

  useEffect(() => {
    NativeMoq.updateTargetLatency(targetLatencyMs);
  }, [targetLatencyMs]);

  useEffect(() => {
    const subs = [
      moqEmitter.addListener('sessionStateChanged', (event) => {
        const { state } = event as { state: string };
        setSessionState(state as MoQSessionState);
      }),

      moqEmitter.addListener('broadcastAvailable', (event) => {
        const info = event as MoQBroadcastInfo;
        setBroadcasts((prev) => [
          ...prev.filter((b) => b.path !== info.path),
          info,
        ]);
      }),

      moqEmitter.addListener('broadcastUnavailable', (event) => {
        const { path } = event as { path: string };
        setBroadcasts((prev) => prev.filter((b) => b.path !== path));
      }),

      moqEmitter.addListener('playerEvent', (event) => {
        const { type } = event as { type: string };
        if (type === 'trackPlaying') {
          setIsPlaying(true);
          setIsPaused(false);
        } else if (type === 'trackPaused') {
          setIsPaused(true);
          setIsPlaying(false);
        } else if (type === 'allTracksStopped') {
          setIsPlaying(false);
          setIsPaused(false);
        }
      }),

      moqEmitter.addListener('playbackStatsUpdated', (event) => {
        setPlaybackStats(event as MoQPlaybackStats);
      }),
    ];

    return () => {
      subs.forEach((s) => s.remove());
      NativeMoq.disconnect();
    };
  }, []);

  const connect = useCallback(() => {
    NativeMoq.connect(urlRef.current, prefixRef.current);
  }, []);

  const disconnect = useCallback(() => {
    NativeMoq.disconnect();
    setSessionState('idle');
    setBroadcasts([]);
    setIsPlaying(false);
    setIsPaused(false);
    setPlaybackStats(null);
  }, []);

  const play = useCallback(() => {
    NativeMoq.play();
    setIsPaused(false);
  }, []);

  const pause = useCallback(() => {
    NativeMoq.pause();
    setIsPaused(true);
  }, []);

  const updateTargetLatency = useCallback((ms: number) => {
    NativeMoq.updateTargetLatency(ms);
  }, []);

  return {
    sessionState,
    broadcasts,
    isPlaying,
    isPaused,
    playbackStats,
    connect,
    disconnect,
    play,
    pause,
    updateTargetLatency,
  };
}
