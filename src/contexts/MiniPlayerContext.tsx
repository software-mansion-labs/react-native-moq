import { createContext, useContext } from 'react';
import type { Player } from '../types';

/**
 * API exposed to whatever element is mounted in the VideoPlayerView's
 * `miniControls` slot (the inline, non-fullscreen view). The built-in
 * `<MiniPlayerControls />` reads from this; a custom chrome you pass via
 * `<VideoPlayerView miniControls={...} />` can read it too to respect the
 * same tap-to-toggle behavior the native players use.
 */
export interface MiniPlayerControlsAPI {
  /** Whether controls should currently be on screen. Drives the fade. */
  visible: boolean;
  /** Mark controls as visible and reset the auto-hide timer. */
  show(): void;
  /** Enter fullscreen mode programmatically. */
  enterFullscreen(): void;
  /** The player driving this VideoPlayerView. */
  player: Player;
}

export const MiniPlayerContext = createContext<MiniPlayerControlsAPI | null>(
  null
);

/**
 * Read the mini player controls API from inside a custom `miniControls`
 * element. Throws if used outside a VideoPlayerView inline view — these
 * controls only make sense in that context.
 */
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
