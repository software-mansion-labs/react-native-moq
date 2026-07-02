import { createContext, useContext } from 'react';
import type { Player } from 'react-native-moq';

/**
 * API for the element mounted in the inline `miniControls` slot. Read via
 * `useMiniPlayerControls()` to respect the same tap-to-toggle behavior.
 */
export interface MiniPlayerControlsAPI {
  /** Whether controls are on screen. Drives the fade. */
  visible: boolean;
  /** Mark controls visible and reset the auto-hide timer. */
  show(): void;
  enterFullscreen(): void;
  player: Player;
}

export const MiniPlayerContext = createContext<MiniPlayerControlsAPI | null>(
  null
);

/** Read the mini player controls API. Throws if used outside the inline view. */
export function useMiniPlayerControls(): MiniPlayerControlsAPI {
  const ctx = useContext(MiniPlayerContext);
  if (!ctx) {
    throw new Error(
      'useMiniPlayerControls() must be used inside a VideoPlayerView ' +
        '`miniControls` element (i.e. while the player is inline, not fullscreen).'
    );
  }
  return ctx;
}
