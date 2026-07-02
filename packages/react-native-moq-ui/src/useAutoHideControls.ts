import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';

// ~3.5s matches the AVPlayer default.
export const CONTROLS_AUTO_HIDE_MS = 3500;
export const CONTROLS_FADE_MS = 220;

/**
 * Shared auto-hide/fade behavior for the controls layers. Tracks `visible`,
 * animates opacity to match, and exposes `show()` and `onBackgroundPress`.
 * Pass `hasControls = false` to skip the auto-hide timer.
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
      // Tapping while visible hides immediately (AVPlayer/PlayerView behavior).
      clearHideTimer();
      setVisible(false);
    } else {
      show();
    }
  }, [visible, show, clearHideTimer]);

  return { visible, show, opacity, onBackgroundPress };
}
