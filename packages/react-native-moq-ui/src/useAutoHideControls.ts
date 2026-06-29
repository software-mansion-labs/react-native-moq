import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';

// Auto-hide timing for player controls. ~3.5s matches the AVPlayer default; the
// fade itself is short so it doesn't feel sluggish.
export const CONTROLS_AUTO_HIDE_MS = 3500;
export const CONTROLS_FADE_MS = 220;

/**
 * Shared auto-hide/fade behavior for the inline and fullscreen controls layers.
 * Tracks a `visible` flag, animates an opacity value to match, and exposes
 * `show()` (mark visible + reset the auto-hide timer) and `onBackgroundPress`
 * (the tap-to-toggle gesture used by both stages).
 *
 * Pass `hasControls = false` when the caller opted out of controls entirely —
 * the auto-hide timer is then skipped (nothing to dismiss).
 */
export function useAutoHideControls(hasControls: boolean) {
  const [visible, setVisible] = useState(true);
  const opacity = useRef(new Animated.Value(1)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const startHideTimer = useCallback(() => {
    clearHideTimer();
    hideTimer.current = setTimeout(() => {
      setVisible(false);
    }, CONTROLS_AUTO_HIDE_MS);
  }, [clearHideTimer]);

  const show = useCallback(() => {
    setVisible(true);
    startHideTimer();
  }, [startHideTimer]);

  useEffect(() => {
    if (!hasControls) return;
    startHideTimer();
    return clearHideTimer;
  }, [hasControls, startHideTimer, clearHideTimer]);

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: CONTROLS_FADE_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [visible, opacity]);

  const onBackgroundPress = useCallback(() => {
    if (visible) {
      // Tapping the video while controls are visible hides them right away,
      // matching the AVPlayer / PlayerView behavior.
      clearHideTimer();
      setVisible(false);
    } else {
      show();
    }
  }, [visible, show, clearHideTimer]);

  return { visible, show, opacity, onBackgroundPress };
}
