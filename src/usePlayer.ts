import { useEffect, useRef } from 'react';
import type { Player } from './types';
import { PlayerHandle } from './types';
import { usePlayerBase } from './usePlayerBase';

export function usePlayer(
  player: PlayerHandle,
  setup?: (player: Player) => void
): Player {
  const moqPlayer = usePlayerBase(player);

  const moqPlayerRef = useRef(moqPlayer);
  moqPlayerRef.current = moqPlayer;

  const setupRef = useRef(setup);

  useEffect(() => {
    setupRef.current?.(moqPlayerRef.current);
  }, []);

  return moqPlayer;
}
