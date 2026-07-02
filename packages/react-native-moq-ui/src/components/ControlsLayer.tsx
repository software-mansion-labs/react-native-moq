import type { ReactNode } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';

/**
 * Tap-to-toggle controls layer shared by the inline and fullscreen stages: a
 * full-bleed Pressable wrapping a fading Animated.View. When hidden, taps fall
 * through to the Pressable to bring the controls back.
 */
export function ControlsLayer({
  visible,
  opacity,
  onBackgroundPress,
  children,
}: {
  visible: boolean;
  opacity: Animated.Value;
  onBackgroundPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      style={StyleSheet.absoluteFill}
      onPress={onBackgroundPress}
      // Avoid the click sound on each tap-to-toggle on Android.
      android_disableSound
    >
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity }]}
        pointerEvents={visible ? 'box-none' : 'none'}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}
