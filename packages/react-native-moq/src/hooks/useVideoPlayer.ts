import type { BroadcastInfo, Player } from '../types';
import { usePlayer } from './usePlayer';
import { useSetupOnce } from './useSetupOnce';

export function useVideoPlayer(
  broadcast: BroadcastInfo,
  setup?: (player: Player) => void
): Player {
  const moqPlayer = usePlayer(broadcast.player);
  useSetupOnce(moqPlayer, setup);
  return moqPlayer;
}
