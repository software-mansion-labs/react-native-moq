import { useCallback, useEffect, useRef, useState } from 'react';
import { EventEmitter } from '../EventEmitter';
import { attachPlayerEvents } from '../player';
import type { PlaybackStats, Player, PlayerEvents } from '../types';
import { PlayerHandle } from '../types';

// Shared event-subscription and state logic for useVideoPlayer and useAudioPlayer.
export function usePlayer(player: PlayerHandle): Player {
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
  const [volume, setVolumeState] = useState(1);

  const playerRef = useRef(player);
  playerRef.current = player;

  const emitterRef = useRef(new EventEmitter<PlayerEvents>());

  const { sessionId, broadcastPath } = player;

  // Keyed on player identity: re-subscribe (and reset the playingChange dedup
  // inside attachPlayerEvents) only when (sessionId, broadcastPath) changes.
  useEffect(() => {
    const emitter = emitterRef.current;
    return attachPlayerEvents(sessionId, broadcastPath, {
      playingChange(next) {
        setIsPlaying(next);
        emitter.emit('playingChange', { isPlaying: next });
      },
      trackStopped() {
        setPlaybackStats(null);
        setCurrentVideoTrackName(undefined);
        setCurrentAudioTrackName(undefined);
        emitter.emit('trackStopped', {});
      },
      trackSwitched(trackKind, trackName) {
        if (trackKind === 'video') setCurrentVideoTrackName(trackName);
        else setCurrentAudioTrackName(trackName);
        emitter.emit('trackSwitched', { trackKind, trackName });
      },
      statsUpdate(stats) {
        setPlaybackStats(stats);
        emitter.emit('statsUpdate', stats);
      },
    });
  }, [sessionId, broadcastPath]);

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

  const setVolume = useCallback((next: number) => {
    const clamped = Math.min(Math.max(next, 0), 1);
    playerRef.current.setVolume(clamped);
    setVolumeState(clamped);
  }, []);

  const addListener = useCallback(
    <TEventName extends keyof PlayerEvents>(
      eventName: TEventName,
      listener: PlayerEvents[TEventName]
    ) => emitterRef.current.addListener(eventName, listener),
    []
  );

  return {
    sessionId,
    broadcastPath,
    isPlaying,
    playbackStats,
    currentVideoTrackName,
    currentAudioTrackName,
    volume,
    emitter: emitterRef.current,
    addListener,
    play,
    pause,
    stop,
    updateTargetLatency,
    switchVideoTrack,
    switchAudioTrack,
    setVolume,
  };
}
