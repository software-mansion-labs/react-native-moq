import { useCallback, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Platform,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PanResponderGestureState,
  type ViewStyle,
} from 'react-native';
import { useEvent } from './useEvent';
import type { Player, AudioPlayer } from './types';

// Lightweight horizontal volume slider, drawn with <View>s so the package
// doesn't pull in @react-native-community/slider. Looks roughly like:
//   - iOS: thin pill track (UISlider-ish), small circular thumb
//   - Android: thicker pill track (Material slider), smaller round thumb
//
// Drag uses PanResponder so we react to grant + move on the same gesture,
// avoiding the dead-zone you'd get with onResponderMove-only handling.
export function VolumeSlider({
  player,
  width = 140,
  theme = 'dark',
}: {
  player: Player | AudioPlayer;
  width?: number;
  // 'dark' = white slider on a translucent dark scrim (video overlay default).
  // 'light' = blue-ish slider on a light card background.
  theme?: 'dark' | 'light';
}) {
  // Mirror native state into a local value during drags. Releasing the touch
  // re-syncs with player.volume so any clamping/native truncation wins.
  const [dragValue, setDragValue] = useState<number | null>(null);
  const widthRef = useRef(width);

  const value = dragValue ?? player.volume;

  // useEvent isn't required here (volume already lives in player state), but
  // referenced so the slider re-renders if some other surface mutates volume.
  useEvent(player, 'playingChange', { isPlaying: player.isPlaying });

  const isIOS = Platform.OS === 'ios';
  const trackHeight = isIOS ? 3 : 4;
  const thumbSize = isIOS ? 14 : 12;
  // Inset the active track range by half a thumb on each side so the thumb
  // stays fully inside the container at v=0 and v=1 (otherwise it visually
  // overflows the right edge and bunches against the icon on the left).
  const inset = thumbSize / 2;

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
  }, []);

  const computeFromX = useCallback(
    (x: number) => {
      const range = widthRef.current - thumbSize;
      if (range <= 0) return 0;
      return Math.min(1, Math.max(0, (x - inset) / range));
    },
    [inset, thumbSize]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e: GestureResponderEvent) => {
          const v = computeFromX(e.nativeEvent.locationX);
          setDragValue(v);
          player.setVolume(v);
        },
        onPanResponderMove: (
          e: GestureResponderEvent,
          g: PanResponderGestureState
        ) => {
          // locationX can go negative or past width while dragging — clamp.
          const startX = e.nativeEvent.locationX - g.dx;
          const v = computeFromX(startX + g.dx);
          setDragValue(v);
          player.setVolume(v);
        },
        onPanResponderRelease: () => setDragValue(null),
        onPanResponderTerminate: () => setDragValue(null),
      }),
    [computeFromX, player]
  );

  const range = Math.max(0, widthRef.current - thumbSize);
  const filled = value * range;
  const isDark = theme === 'dark';
  const trackBg = isDark ? 'rgba(255,255,255,0.3)' : '#d1d5db';
  const fg = isDark ? '#fff' : '#2563eb';

  const container: ViewStyle = {
    width,
    height: Math.max(thumbSize, 24),
    justifyContent: 'center',
  };
  const track: ViewStyle = {
    height: trackHeight,
    borderRadius: trackHeight / 2,
    backgroundColor: trackBg,
    overflow: 'hidden',
    marginHorizontal: inset,
  };
  const fill: ViewStyle = {
    width: filled,
    height: trackHeight,
    backgroundColor: fg,
  };
  const thumb: ViewStyle = {
    position: 'absolute',
    left: filled + inset - thumbSize / 2,
    width: thumbSize,
    height: thumbSize,
    borderRadius: thumbSize / 2,
    backgroundColor: fg,
    // Slight elevation/shadow keeps the thumb visible against bright frames.
    ...(isIOS
      ? {
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 1.5,
          shadowOffset: { width: 0, height: 1 },
        }
      : { elevation: 2 }),
  };

  return (
    <View
      onLayout={onLayout}
      style={container}
      hitSlop={10}
      accessibilityRole="adjustable"
      accessibilityLabel="Volume"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      {...panResponder.panHandlers}
    >
      <View style={track}>
        <View style={fill} />
      </View>
      <View style={thumb} pointerEvents="none" />
    </View>
  );
}

// Speaker icon used alongside the slider. Drawn from <View>s — three vertical
// segments form a trapezoid speaker body, plus three wave bars to the right
// (like iOS Control Center) that light up as volume increases. Inactive bars
// stay visible in a muted shade so the icon still reads as a volume control.
export function SpeakerGlyph({
  size = 16,
  volume = 1,
  color = '#fff',
}: {
  size?: number;
  // 0..1; sets which of the three wave bars are active. Volume === 0 also
  // hides the waves entirely and shows the mute slash, matching iOS.
  volume?: number;
  // Defaults to white for video-overlay use; pass a darker shade on light
  // backgrounds (e.g. the audio-only card in the example app).
  color?: string;
}) {
  const muted = volume <= 0;
  // 3 tiers: roughly third / two-thirds / full. Above 0 we always light at
  // least one bar so a quiet-but-not-muted state is visible.
  const activeBars = muted
    ? 0
    : Math.min(3, Math.max(1, Math.ceil(volume * 3)));
  const inactiveColor = withAlpha(color, 0.35);

  const stemH = size * 0.3;
  const bodyH = size * 0.6;
  const flareH = size * 0.9;
  const segW = size * 0.18;
  const arcThickness = Math.max(1.2, size * 0.1);
  const arcGap = Math.max(1.5, size * 0.1);

  const stem = {
    width: segW,
    height: stemH,
    backgroundColor: color,
    borderRadius: 1,
  };
  const body = {
    width: segW,
    height: bodyH,
    backgroundColor: color,
    marginLeft: -1,
  };
  const flare = {
    width: segW,
    height: flareH,
    backgroundColor: color,
    marginLeft: -1,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  };

  // Three concentric ")" arcs of growing height, like the iOS Control Center
  // speaker. Each arc is a Box with only its right border visible and the
  // right corners rounded by half the height — that forces the right edge to
  // curve into a semicircular arc.
  //
  // Each arc View is `h/2` wide but only the rightmost edge is visible, so a
  // default flex-row layout would leave the visible curves far apart. We
  // compensate with a negative marginLeft per arc, sized so neighbouring
  // curves end up `arcSpacing` pixels apart regardless of the arc's height.
  const arcHeights = [size * 0.4, size * 0.65, size * 0.9];
  const arcSpacing = Math.max(1.5, size * 0.12);
  const waves = arcHeights.map((h, i) => {
    const w = h / 2;
    return {
      width: w,
      height: h,
      borderWidth: arcThickness,
      borderColor: 'transparent' as const,
      borderRightColor: i < activeBars ? color : inactiveColor,
      borderTopRightRadius: h / 2,
      borderBottomRightRadius: h / 2,
      backgroundColor: 'transparent' as const,
      marginLeft: i === 0 ? arcGap : arcSpacing - w,
    };
  });

  const container = { height: size };
  const muteBar = { width: size * 1.1, backgroundColor: color };

  return (
    <View style={[stylesIcon.row, container]}>
      <View style={stem} />
      <View style={body} />
      <View style={flare} />
      {muted ? null : waves.map((w, i) => <View key={i} style={w} />)}
      {muted && (
        <View pointerEvents="none" style={[stylesIcon.muteBar, muteBar]} />
      )}
    </View>
  );
}

// Lightly transparent variant of a color string. Used for the inactive wave
// bars so they still read against dark / light backgrounds.
function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('rgba(')) return color;
  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
  }
  // Hex (#fff, #ffffff). Anything else falls back to a generic gray, which
  // is fine for the limited set of colors we hand it.
  const hex = color.replace('#', '');
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  if (full.length !== 6) return `rgba(127, 127, 127, ${alpha})`;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const stylesIcon = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  muteBar: {
    position: 'absolute',
    height: 2,
    left: -2,
    top: '50%',
    transform: [{ rotate: '-30deg' }],
    borderRadius: 1,
  },
});
