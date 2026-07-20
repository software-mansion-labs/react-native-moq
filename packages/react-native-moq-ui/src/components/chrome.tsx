import type { ComponentProps } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';
import { type Player } from 'react-native-moq';
import { SpeakerGlyph, VolumeSlider } from './VolumeSlider';

// Shared chrome primitives composed by FullscreenControls (large sizes) and
// MiniPlayerControls (small sizes). Platform styling (iOS dark circles vs
// Android ripples) lives here; layout stays in the composition layers.

const RIPPLE_COLOR = 'rgba(255,255,255,0.18)';

/** Centered play/pause circle button in an absolute-fill wrapper. */
export function PlayPauseButton({
  isPlaying,
  onPress,
  size,
  iconSize,
  hitSlop,
}: {
  isPlaying: boolean;
  onPress: () => void;
  /** Circle diameter. */
  size: number;
  iconSize: number;
  hitSlop: number;
}) {
  const circle = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={styles.center} pointerEvents="box-none">
      {/* `borderless: false` on purpose: borderless swaps out the bg
          drawable, so the dark circle would disappear over a dark frame. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
        hitSlop={hitSlop}
        onPress={onPress}
        android_ripple={{ color: RIPPLE_COLOR, borderless: false }}
        style={({ pressed }) => [
          styles.playButton,
          circle,
          pressed && styles.pressed,
        ]}
      >
        <MaterialIcons
          name={isPlaying ? 'pause' : 'play-arrow'}
          size={iconSize}
          color="#fff"
        />
      </Pressable>
    </View>
  );
}

/**
 * Small circular icon button (close / enter-fullscreen). Dark background on
 * iOS; bare icon with a borderless ripple on Android.
 */
export function ChromeIconButton({
  icon,
  iconSize,
  size,
  hitSlop,
  accessibilityLabel,
  onPress,
}: {
  icon: ComponentProps<typeof MaterialIcons>['name'];
  iconSize: number;
  /** Circle diameter. */
  size: number;
  hitSlop: number;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const circle = { width: size, height: size, borderRadius: size / 2 };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={hitSlop}
      onPress={onPress}
      android_ripple={{ color: RIPPLE_COLOR, borderless: true }}
      style={({ pressed }) => [
        styles.iconButton,
        circle,
        pressed && styles.pressed,
      ]}
    >
      <MaterialIcons name={icon} size={iconSize} color="#fff" />
    </Pressable>
  );
}

/** SpeakerGlyph + VolumeSlider in a dark pill. */
export function VolumeRow({
  player,
  size,
}: {
  player: Player;
  /** 'large' for fullscreen chrome, 'small' for the inline mini player. */
  size: 'large' | 'small';
}) {
  const large = size === 'large';
  return (
    <View style={large ? styles.volumeRowLarge : styles.volumeRowSmall}>
      <SpeakerGlyph size={large ? 20 : 16} volume={player.volume} />
      <VolumeSlider player={player} width={large ? 160 : 96} />
    </View>
  );
}

/** Soft scrim so icons stay legible over light video frames. */
export function AndroidScrim() {
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.androidScrim]}
    />
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },

  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },

  playButton: {
    backgroundColor:
      Platform.OS === 'ios' ? 'rgba(0, 0, 0, 0.35)' : 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'ios'
      ? { backgroundColor: 'rgba(0, 0, 0, 0.45)' }
      : null),
  },

  volumeRowLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  volumeRowSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },

  androidScrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
});
