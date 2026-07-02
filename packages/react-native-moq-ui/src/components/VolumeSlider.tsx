import { useCallback, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Platform,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PanResponderGestureState,
  type ViewStyle,
} from 'react-native';
import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';
import { useEvent, type Player, type AudioPlayer } from 'react-native-moq';

// Lightweight horizontal volume slider drawn with <View>s to avoid pulling in
// @react-native-community/slider. Drag uses PanResponder (grant + move on the
// same gesture) to avoid the dead-zone of onResponderMove-only handling.
export function VolumeSlider({
  player,
  width = 140,
  theme = 'dark',
}: {
  player: Player | AudioPlayer;
  width?: number;
  // 'dark' = white slider on a dark scrim; 'light' = blue slider on light bg.
  theme?: 'dark' | 'light';
}) {
  // Mirror native state locally during drags; release re-syncs with
  // player.volume so any native clamping wins.
  const [dragValue, setDragValue] = useState<number | null>(null);
  const widthRef = useRef(width);

  const value = dragValue ?? player.volume;

  // Not needed for volume itself; referenced so the slider re-renders if some
  // other surface mutates volume.
  useEvent(player, 'playingChange', { isPlaying: player.isPlaying });

  const isIOS = Platform.OS === 'ios';
  const trackHeight = isIOS ? 3 : 4;
  const thumbSize = isIOS ? 14 : 12;
  // Inset the track range by half a thumb each side so the thumb stays inside
  // the container at v=0 and v=1.
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
          // locationX can go negative or past width while dragging; computeFromX clamps.
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
    // Elevation/shadow keeps the thumb visible against bright frames.
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

// Speaker icon that picks one of Material's four volume glyphs by level.
export function SpeakerGlyph({
  size = 20,
  volume = 1,
  color = '#fff',
}: {
  size?: number;
  // 0..1; 0 shows the muted glyph.
  volume?: number;
  // White for video overlays; pass a darker shade on light backgrounds.
  color?: string;
}) {
  const name =
    volume <= 0
      ? ('volume-off' as const)
      : volume < 1 / 3
        ? ('volume-mute' as const)
        : volume < 2 / 3
          ? ('volume-down' as const)
          : ('volume-up' as const);
  return <MaterialIcons name={name} size={size} color={color} />;
}
