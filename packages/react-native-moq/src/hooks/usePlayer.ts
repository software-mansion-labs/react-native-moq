import { useCallback, useEffect, useRef, useState } from 'react';
import { EventEmitter } from '../EventEmitter';
import {
  attachPlayerEvents,
  clampVolume,
  createPlayerEventBridge,
  type PlayerEventState,
} from '../player';
import type { Player, PlayerEvents } from '../types';
import { PlayerHandle } from '../types';

// Shared event-subscription and state logic for useVideoPlayer and useAudioPlayer.
export function usePlayer(player: PlayerHandle): Player {
  const [snapshot, setSnapshot] = useState<PlayerEventState>(() => ({
    isPlaying: false,
    playbackStats: null,
    currentVideoTrackName: player.initialVideoTrackName,
    currentAudioTrackName: player.initialAudioTrackName,
  }));
  const [volume, setVolumeState] = useState(1);

  const playerRef = useRef(player);
  playerRef.current = player;

  const emitterRef = useRef(new EventEmitter<PlayerEvents>());

  const { sessionId, broadcastPath } = player;

  // Keyed on player identity: re-subscribe (and reset the playingChange dedup
  // inside attachPlayerEvents) only when (sessionId, broadcastPath) changes.
  useEffect(() => {
    const emitter = emitterRef.current;
    const { state, sink } = createPlayerEventBridge(emitter, {
      videoTrackName: playerRef.current.initialVideoTrackName,
      audioTrackName: playerRef.current.initialAudioTrackName,
    });
    const mirror = () => setSnapshot({ ...state });
    mirror();
    const subs = (
      ['playingChange', 'trackStopped', 'trackSwitched', 'statsUpdate'] as const
    ).map((eventName) => emitter.addListener(eventName, mirror));
    const detach = attachPlayerEvents(sessionId, broadcastPath, sink);
    return () => {
      detach();
      subs.forEach((s) => s.remove());
    };
  }, [sessionId, broadcastPath]);

  // Stable command wrappers; `playerRef` keeps them pointed at the latest handle.
  const commands = useRef({
    play: () => playerRef.current.play(),
    pause: () => playerRef.current.pause(),
    stop: () => playerRef.current.stop(),
    updateTargetLatency: (ms: number) =>
      playerRef.current.updateTargetLatency(ms),
    switchVideoTrack: (trackName: string) =>
      playerRef.current.switchVideoTrack(trackName),
    switchAudioTrack: (trackName: string) =>
      playerRef.current.switchAudioTrack(trackName),
  }).current;

  const setVolume = useCallback((next: number) => {
    const clamped = clampVolume(next);
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
    ...snapshot,
    volume,
    emitter: emitterRef.current,
    addListener,
    ...commands,
    setVolume,
  };
}
