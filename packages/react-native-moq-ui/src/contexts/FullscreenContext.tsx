import { createContext, useContext } from 'react';
import type { Player } from 'react-native-moq';

/**
 * API for the element mounted in the fullscreen modal's `controls` slot. Read
 * via `useFullscreenControls()` to respect the same tap-to-toggle behavior.
 */
export interface FullscreenControlsAPI {
  /** Whether controls are on screen. Drives the fade. */
  visible: boolean;
  /** Mark controls visible and reset the auto-hide timer. */
  show(): void;
  exit(): void;
  player: Player;
}

export const FullscreenContext = createContext<FullscreenControlsAPI | null>(
  null
);

/** Read the fullscreen controls API. Throws if used outside a fullscreen modal. */
export function useFullscreenControls(): FullscreenControlsAPI {
  const ctx = useContext(FullscreenContext);
  if (!ctx) {
    throw new Error(
      'useFullscreenControls() must be used inside a VideoPlayerView ' +
        '`controls` element (i.e. while the player is in fullscreen).'
    );
  }
  return ctx;
}
