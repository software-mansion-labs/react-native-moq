import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';
import { type Player } from 'react-native-moq';
import { useFullscreenControls } from '../contexts/FullscreenContext';
import { usePlayPause } from '../usePlayPause';
import { SpeakerGlyph, VolumeSlider } from './VolumeSlider';

// Default fullscreen chrome, mirroring platform conventions: close button
// top-left on iOS / top-right on Android, centered play/pause, bottom volume
// row. Visibility and exit come from FullscreenContext.
export function FullscreenControls() {
  const { player, exit, show } = useFullscreenControls();
  // Respect all four edges: insets can appear on left/right in landscape.
  const insets = useSafeAreaInsets();
  const { isPlaying, onTogglePlay } = usePlayPause(player, show);

  const onExit = () => {
    show();
    exit();
  };

  if (Platform.OS === 'ios') {
    return (
      <IOSChrome
        player={player}
        isPlaying={isPlaying}
        insets={insets}
        onTogglePlay={onTogglePlay}
        onExit={onExit}
      />
    );
  }
  return (
    <AndroidChrome
      player={player}
      isPlaying={isPlaying}
      insets={insets}
      onTogglePlay={onTogglePlay}
      onExit={onExit}
    />
  );
}

type EdgeInsets = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

function IOSChrome({
  player,
  isPlaying,
  insets,
  onTogglePlay,
  onExit,
}: {
  player: Player;
  isPlaying: boolean;
  insets: EdgeInsets;
  onTogglePlay: () => void;
  onExit: () => void;
}) {
  // Extra margin over the inset so the pill doesn't butt up against the island.
  const topBarStyle = {
    paddingTop: insets.top + 8,
    paddingLeft: insets.left + 16,
    paddingRight: insets.right + 16,
  };
  return (
    <View style={styles.fill} pointerEvents="box-none">
      <View style={[styles.topBar, topBarStyle]} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Exit fullscreen"
          hitSlop={12}
          onPress={onExit}
          style={({ pressed }) => [
            styles.iosCircleButton,
            pressed && styles.pressed,
          ]}
        >
          <MaterialIcons name="close" size={20} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.center} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          hitSlop={16}
          onPress={onTogglePlay}
          style={({ pressed }) => [
            styles.iosPlayButton,
            pressed && styles.pressed,
          ]}
        >
          <MaterialIcons
            name={isPlaying ? 'pause' : 'play-arrow'}
            size={40}
            color="#fff"
          />
        </Pressable>
      </View>

      <View
        style={[
          styles.bottomBar,
          {
            paddingLeft: insets.left + 16,
            paddingRight: insets.right + 16,
            paddingBottom: insets.bottom + 12,
          },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.volumeRow}>
          <SpeakerGlyph size={20} volume={player.volume} />
          <VolumeSlider player={player} width={160} />
        </View>
      </View>
    </View>
  );
}

function AndroidChrome({
  player,
  isPlaying,
  insets,
  onTogglePlay,
  onExit,
}: {
  player: Player;
  isPlaying: boolean;
  insets: EdgeInsets;
  onTogglePlay: () => void;
  onExit: () => void;
}) {
  // Pad horizontally to clear the system gesture exclusion zones (sides in
  // landscape).
  const topBarStyle = {
    paddingTop: insets.top + 4,
    paddingLeft: insets.left + 8,
    paddingRight: insets.right + 8,
  };
  return (
    <View style={styles.fill} pointerEvents="box-none">
      {/* Soft scrim so icons stay legible over light video frames. */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.androidScrim]}
      />

      <View style={[styles.topBar, topBarStyle]} pointerEvents="box-none">
        <View style={styles.flexFill} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Exit fullscreen"
          hitSlop={12}
          onPress={onExit}
          android_ripple={{ color: 'rgba(255,255,255,0.18)', borderless: true }}
          style={({ pressed }) => [
            styles.androidIconButton,
            pressed && styles.pressed,
          ]}
        >
          <MaterialIcons name="close" size={24} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.center} pointerEvents="box-none">
        {/* `borderless: false` on purpose: borderless swaps out the bg
            drawable, so the dark circle would disappear over a dark frame. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          hitSlop={16}
          onPress={onTogglePlay}
          android_ripple={{
            color: 'rgba(255,255,255,0.18)',
            borderless: false,
          }}
          style={({ pressed }) => [
            styles.androidPlayButton,
            pressed && styles.pressed,
          ]}
        >
          <MaterialIcons
            name={isPlaying ? 'pause' : 'play-arrow'}
            size={42}
            color="#fff"
          />
        </Pressable>
      </View>

      <View
        style={[
          styles.bottomBar,
          {
            paddingLeft: insets.left + 12,
            paddingRight: insets.right + 12,
            paddingBottom: insets.bottom + 12,
          },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.volumeRow}>
          <SpeakerGlyph size={20} volume={player.volume} />
          <VolumeSlider player={player} width={160} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill },
  flexFill: { flex: 1 },
  pressed: { opacity: 0.7 },

  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },

  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },

  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },

  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },

  iosCircleButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iosPlayButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  androidIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  androidPlayButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  androidScrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
});
