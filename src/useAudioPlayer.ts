import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioPlayer } from './types';
import { PlayerHandle } from './types';
import { usePlayerBase } from './usePlayerBase';

export function useAudioPlayer(
  player: PlayerHandle,
  setup?: (player: AudioPlayer) => void
): AudioPlayer {
  const [currentAudioTrackName, setCurrentAudioTrackName] = useState<
    string | undefined
  >(player.initialAudioTrackName);

  const base = usePlayerBase(
    player,
    (kind, trackName) => {
      if (kind === 'audio') setCurrentAudioTrackName(trackName);
    },
    () => {
      setCurrentAudioTrackName(undefined);
    }
  );

  const play = useCallback(
    () => base.playerRef.current.playAudioOnly(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const audioPlayer: AudioPlayer = {
    broadcastPath: base.broadcastPath,
    isPlaying: base.isPlaying,
    playbackStats: base.playbackStats,
    currentAudioTrackName,
    emitter: base.emitterRef.current,
    addListener: base.addListener,
    play,
    pause: base.pause,
    stop: base.stop,
    updateTargetLatency: base.updateTargetLatency,
    switchAudioTrack: base.switchAudioTrack,
  };

  const audioPlayerRef = useRef(audioPlayer);
  audioPlayerRef.current = audioPlayer;

  const setupRef = useRef(setup);

  useEffect(() => {
    setupRef.current?.(audioPlayerRef.current);
  }, []);

  return audioPlayer;
}
