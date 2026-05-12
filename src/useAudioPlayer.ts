import { useEffect, useMemo, useRef } from 'react';
import NativeMoQ from './NativeMoQ';
import type { AudioPlayer, BroadcastInfo, Player } from './types';
import { AUDIO_PLAYER_KEY_SUFFIX, PlayerHandle } from './types';
import { usePlayer } from './usePlayer';

export function useAudioPlayer(
  broadcastInfo: BroadcastInfo,
  setup?: (player: AudioPlayer) => void
): AudioPlayer {
  const audioKey = broadcastInfo.path + AUDIO_PLAYER_KEY_SUFFIX;

  // Bridge-only handle: audio-only players don't use JSI since the native
  // player is created asynchronously after createAudioOnlyPlayer is called.
  const audioHandle = useMemo(
    () =>
      new PlayerHandle(
        audioKey,
        undefined,
        undefined,
        broadcastInfo.audioTracks[0]?.name
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [audioKey]
  );

  useEffect(() => {
    NativeMoQ.createAudioOnlyPlayer(broadcastInfo.path);
    return () => {
      NativeMoQ.stopPlayer(audioKey);
    };
  }, [broadcastInfo.path, audioKey]);

  const player: Player = usePlayer(audioHandle);

  const audioPlayer: AudioPlayer = {
    broadcastPath: player.broadcastPath,
    isPlaying: player.isPlaying,
    playbackStats: player.playbackStats,
    currentAudioTrackName: player.currentAudioTrackName,
    emitter: player.emitter,
    addListener: player.addListener,
    play: player.play,
    pause: player.pause,
    stop: player.stop,
    updateTargetLatency: player.updateTargetLatency,
    switchAudioTrack: player.switchAudioTrack,
  };

  const audioPlayerRef = useRef(audioPlayer);
  audioPlayerRef.current = audioPlayer;

  const setupRef = useRef(setup);

  useEffect(() => {
    setupRef.current?.(audioPlayerRef.current);
  }, []);

  return audioPlayer;
}
