import { useEvent, type Player } from 'react-native-moq';

/**
 * Reactive play/pause state + toggle shared by FullscreenControls and
 * MiniPlayerControls. Follows the player's `playingChange` event, seeded with
 * the current value to avoid a one-frame mismatch before the first event
 * lands. `show` is called on toggle so the auto-hide timer restarts (we don't
 * want the controls fading out from under the user's finger).
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
