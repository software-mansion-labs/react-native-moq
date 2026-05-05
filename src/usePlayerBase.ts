import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeEventEmitter } from 'react-native';
import { EventEmitter } from './EventEmitter';
import NativeMoQ from './NativeMoQ';
import type { PlaybackStats, PlayerEvents } from './types';
import type { PlayerHandle } from './types';

const moqEmitter = new NativeEventEmitter(NativeMoQ);

export function usePlayerBase(
  player: PlayerHandle,
  onTrackSwitched: (kind: 'video' | 'audio', trackName: string) => void,
  onAllTracksStopped: () => void
) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackStats, setPlaybackStats] = useState<PlaybackStats | null>(
    null
  );

  const playerRef = useRef(player);
  playerRef.current = player;

  const emitterRef = useRef(new EventEmitter<PlayerEvents>());
  const lastPlayingChangeRef = useRef<{ isPlaying: boolean } | null>(null);

  const onTrackSwitchedRef = useRef(onTrackSwitched);
  onTrackSwitchedRef.current = onTrackSwitched;
  const onAllTracksStoppedRef = useRef(onAllTracksStopped);
  onAllTracksStoppedRef.current = onAllTracksStopped;

  const { broadcastPath } = player;

  useEffect(() => {
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
          emitPlayingChange({ isPlaying: false });
          onAllTracksStoppedRef.current();
          emitter.emit('trackStopped', {});
        } else if (
          e.type === 'trackSwitched' &&
          e.trackKind &&
          e.trackName !== undefined
        ) {
          onTrackSwitchedRef.current(
            e.trackKind as 'video' | 'audio',
            e.trackName
          );
          emitter.emit('trackSwitched', {
            trackKind: e.trackKind as 'video' | 'audio',
            trackName: e.trackName,
          });
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
  }, [broadcastPath]);

  const play = useCallback(() => playerRef.current.play(), []);
  const pause = useCallback(() => playerRef.current.pause(), []);
  const stop = useCallback(() => playerRef.current.stop(), []);
  const updateTargetLatency = useCallback(
    (ms: number) => playerRef.current.updateTargetLatency(ms),
    []
  );
  const switchAudioTrack = useCallback(
    (trackName: string) => playerRef.current.switchAudioTrack(trackName),
    []
  );
  const switchVideoTrack = useCallback(
    (trackName: string) => playerRef.current.switchVideoTrack(trackName),
    []
  );
  const addListener = useCallback(
    <TEventName extends keyof PlayerEvents>(
      eventName: TEventName,
      listener: PlayerEvents[TEventName]
    ) => emitterRef.current.addListener(eventName, listener),
    []
  );

  return {
    broadcastPath,
    isPlaying,
    playbackStats,
    playerRef,
    emitterRef,
    play,
    pause,
    stop,
    updateTargetLatency,
    switchAudioTrack,
    switchVideoTrack,
    addListener,
  };
}
