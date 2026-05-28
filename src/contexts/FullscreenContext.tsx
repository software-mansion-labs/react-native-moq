import { createContext, useContext } from 'react';
import type { Player } from '../types';

/**
 * API exposed to whatever element is mounted in the fullscreen modal's
 * `controls` slot. The built-in `<FullscreenControls />` reads from this; a
 * custom chrome you pass via `<VideoPlayerView controls={...} />` can read it too
 * to respect the same tap-to-toggle behavior the native players use.
 */
export interface FullscreenControlsAPI {
  /** Whether controls should currently be on screen. Drives the fade. */
  visible: boolean;
  /** Mark controls as visible and reset the auto-hide timer. */
  show(): void;
  /** Exit fullscreen mode programmatically. */
  exit(): void;
  /** The player driving this VideoPlayerView. */
  player: Player;
}

export const FullscreenContext = createContext<FullscreenControlsAPI | null>(
  null
);

/**
 * Read the fullscreen controls API from inside a custom `controls` element.
 * Throws if used outside a VideoPlayerView fullscreen modal — controls only
 * make sense in that context.
 */
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
