import { useEffect, useRef } from 'react';
import type { BroadcastInfo, Player } from './types';
import { usePlayerBase } from './usePlayerBase';

export function usePlayer(
  broadcast: BroadcastInfo,
  setup?: (player: Player) => void
): Player {
  const moqPlayer = usePlayerBase(broadcast.player);

  const moqPlayerRef = useRef(moqPlayer);
  moqPlayerRef.current = moqPlayer;

  const setupRef = useRef(setup);

  useEffect(() => {
    setupRef.current?.(moqPlayerRef.current);
  }, []);

  return moqPlayer;
}
