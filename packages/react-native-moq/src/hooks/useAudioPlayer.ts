import { useEffect, useMemo } from 'react';
import NativeMoQ from '../native/NativeMoQ';
import type { AudioPlayer, BroadcastInfo } from '../types';
import { AUDIO_PLAYER_KEY_SUFFIX, PlayerHandle } from '../types';
import { usePlayer } from './usePlayer';
import { useSetupOnce } from './useSetupOnce';

export function useAudioPlayer(
  broadcastInfo: BroadcastInfo,
  setup?: (player: AudioPlayer) => void
): AudioPlayer {
  const { sessionId } = broadcastInfo;
  const audioKey = broadcastInfo.path + AUDIO_PLAYER_KEY_SUFFIX;

  // Bridge-only handle: the native player is created async after
  // createAudioOnlyPlayer, so there's no JSI object yet.
  const audioHandle = useMemo(
    () =>
      new PlayerHandle(
        sessionId,
        audioKey,
        undefined,
        undefined,
        broadcastInfo.audioTracks[0]?.name
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId, audioKey]
  );

  useEffect(() => {
    NativeMoQ.createAudioOnlyPlayer(sessionId, broadcastInfo.path);
    return () => {
      NativeMoQ.stopPlayer(sessionId, audioKey);
    };
  }, [sessionId, broadcastInfo.path, audioKey]);

  // Player is structurally an AudioPlayer; the narrower type hides the
  // video-track members.
  const audioPlayer: AudioPlayer = usePlayer(audioHandle);

  useSetupOnce(audioPlayer, setup);

  return audioPlayer;
}
