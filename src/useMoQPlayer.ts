import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeEventEmitter } from 'react-native';
import NativeMoQ from './NativeMoQ';
import type {
  MoQPlaybackStats,
  MoQPlayerHandle,
  MoQPlayerState,
  MoQVideoTrackInfo,
} from './types';

const moqEmitter = new NativeEventEmitter(NativeMoQ);

export interface UseMoQPlayerOptions {
  /** Override the target buffering latency in milliseconds for this player. */
  targetLatencyMs?: number;
  /**
   * Available video tracks for this broadcast. When provided, the hook
   * initializes currentVideoTrackName to the first track, matching the
   * default selection made by the native player.
   */
  videoTracks?: MoQVideoTrackInfo[];
}

export function useMoQPlayer(
  broadcastPath: string,
  options: UseMoQPlayerOptions = {}
): MoQPlayerState {
  const { targetLatencyMs, videoTracks } = options;

  const [playerHandle, setPlayerHandle] = useState<MoQPlayerHandle | null>(
    null
  );
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

  const handleRef = useRef<MoQPlayerHandle | null>(null);
  const isPlayingRef = useRef(false);
  const latencyRef = useRef(targetLatencyMs);
  latencyRef.current = targetLatencyMs;
  const videoTracksRef = useRef(videoTracks);
  videoTracksRef.current = videoTracks;

  useEffect(() => {
    const tryCreate = () => {
      if (handleRef.current !== null) {
        NativeMoQ.releasePlayer(handleRef.current);
        handleRef.current = null;
      }

      const h = NativeMoQ.createPlayer(broadcastPath);
      if (h === 0) return; // catalog not yet available

      handleRef.current = h;
      setPlayerHandle(h);
      setIsPlaying(false);
      setIsPaused(false);
      setPlaybackStats(null);
      setCurrentVideoTrackName(videoTracksRef.current?.[0]?.name);
      setCurrentAudioTrackName(undefined);

      if (latencyRef.current !== undefined) {
        NativeMoQ.updateTargetLatency(h, latencyRef.current);
      }
      if (isPlayingRef.current) {
        NativeMoQ.play(h);
      }
    };

    tryCreate();

    const sub = moqEmitter.addListener('broadcastAvailable', (e) => {
      if ((e as { path: string }).path === broadcastPath) tryCreate();
    });

    return () => {
      sub.remove();
      if (handleRef.current !== null) {
        NativeMoQ.releasePlayer(handleRef.current);
        handleRef.current = null;
        setPlayerHandle(null);
      }
      isPlayingRef.current = false;
    };
  }, [broadcastPath]);

  useEffect(() => {
    if (targetLatencyMs !== undefined && handleRef.current !== null) {
      NativeMoQ.updateTargetLatency(handleRef.current, targetLatencyMs);
    }
  }, [targetLatencyMs]);

  useEffect(() => {
    const subs = [
      moqEmitter.addListener('playerEvent', (event) => {
        const e = event as {
          handleId: number;
          type: string;
          trackKind?: string;
          trackName?: string;
        };
        if (e.handleId !== handleRef.current) return;

        if (e.type === 'trackPlaying') {
          isPlayingRef.current = true;
          setIsPlaying(true);
          setIsPaused(false);
        } else if (e.type === 'trackPaused') {
          setIsPaused(true);
          setIsPlaying(false);
        } else if (e.type === 'allTracksStopped') {
          isPlayingRef.current = false;
          setIsPlaying(false);
          setIsPaused(false);
          setPlaybackStats(null);
          setCurrentVideoTrackName(undefined);
          setCurrentAudioTrackName(undefined);
        } else if (e.type === 'trackSwitched') {
          if (e.trackKind === 'video') setCurrentVideoTrackName(e.trackName);
          else if (e.trackKind === 'audio')
            setCurrentAudioTrackName(e.trackName);
        }
      }),

      moqEmitter.addListener('playbackStatsUpdated', (event) => {
        const e = event as { handleId: number } & MoQPlaybackStats;
        if (e.handleId !== handleRef.current) return;
        setPlaybackStats(e);
      }),
    ];

    return () => subs.forEach((s) => s.remove());
  }, []);

  const play = useCallback(() => {
    if (handleRef.current !== null) NativeMoQ.play(handleRef.current);
    setIsPaused(false);
  }, []);

  const pause = useCallback(() => {
    if (handleRef.current !== null) NativeMoQ.pause(handleRef.current);
    setIsPaused(true);
  }, []);

  const stop = useCallback(() => {
    if (handleRef.current === null) return;
    NativeMoQ.releasePlayer(handleRef.current);
    handleRef.current = null;
    isPlayingRef.current = false;
    setPlayerHandle(null);
    setIsPlaying(false);
    setIsPaused(false);
  }, []);

  const updateTargetLatency = useCallback((ms: number) => {
    if (handleRef.current !== null)
      NativeMoQ.updateTargetLatency(handleRef.current, ms);
  }, []);

  const switchVideoTrack = useCallback((trackName: string) => {
    if (handleRef.current !== null)
      NativeMoQ.switchVideoTrack(handleRef.current, trackName);
  }, []);

  const switchAudioTrack = useCallback((trackName: string) => {
    if (handleRef.current !== null)
      NativeMoQ.switchAudioTrack(handleRef.current, trackName);
  }, []);

  return {
    playerHandle,
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
