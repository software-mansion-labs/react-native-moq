import { useEffect, useRef } from 'react';
import type { BroadcastInfo, Player } from '../types';
import { usePlayer } from './usePlayer';

export function useVideoPlayer(
  broadcast: BroadcastInfo,
  setup?: (player: Player) => void
): Player {
  const moqPlayer = usePlayer(broadcast.player);

  const moqPlayerRef = useRef(moqPlayer);
  moqPlayerRef.current = moqPlayer;

  const setupRef = useRef(setup);

  useEffect(() => {
    setupRef.current?.(moqPlayerRef.current);
  }, []);

  return moqPlayer;
}
