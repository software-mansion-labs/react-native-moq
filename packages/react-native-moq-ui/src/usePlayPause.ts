import { useEvent, type Player } from 'react-native-moq';

/**
 * Reactive play/pause state + toggle. Follows `playingChange`, seeded with the
 * current value to avoid a one-frame mismatch. `show` restarts the auto-hide
 * timer on toggle so controls don't fade out under the user's finger.
 */
export function usePlayPause(player: Player, show: () => void) {
  const playingEvent = useEvent(player, 'playingChange', {
    isPlaying: player.isPlaying,
  });
  const isPlaying = playingEvent.isPlaying;

  const onTogglePlay = () => {
    show();
    if (isPlaying) player.pause();
    else player.play();
  };

  return { isPlaying, onTogglePlay };
}
