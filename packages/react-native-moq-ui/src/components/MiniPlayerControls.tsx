import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';
import { type Player } from 'react-native-moq';
import { useMiniPlayerControls } from '../contexts/MiniPlayerContext';
import { usePlayPause } from '../usePlayPause';
import { SpeakerGlyph, VolumeSlider } from './VolumeSlider';

// Default inline chrome for VideoPlayerView. Mirrors the platform split used
// by FullscreenControls but scaled down for an embedded view:
//   - centered play/pause (smaller than the fullscreen version)
//   - bottom-right fullscreen-enter button (the universal convention for
//     inline players: YouTube embed, AVPlayerViewController inline, Media3
//     PlayerView's default control bar)
// No close button (you're already not fullscreen), no scrubber (live).
//
// Visibility and the enter-fullscreen action are read from MiniPlayerContext;
// this component only renders the chrome itself.
export function MiniPlayerControls() {
  const { player, enterFullscreen, show } = useMiniPlayerControls();
  const { isPlaying, onTogglePlay } = usePlayPause(player, show);

  const onEnterFullscreen = () => {
    show();
    enterFullscreen();
  };

  if (Platform.OS === 'ios') {
    return (
      <IOSChrome
        player={player}
        isPlaying={isPlaying}
        onTogglePlay={onTogglePlay}
        onEnterFullscreen={onEnterFullscreen}
      />
    );
  }
  return (
    <AndroidChrome
      player={player}
      isPlaying={isPlaying}
      onTogglePlay={onTogglePlay}
      onEnterFullscreen={onEnterFullscreen}
    />
  );
}

// ---------------------------------------------------------------------------
// iOS
// ---------------------------------------------------------------------------

function IOSChrome({
  player,
  isPlaying,
  onTogglePlay,
  onEnterFullscreen,
}: {
  player: Player;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onEnterFullscreen: () => void;
}) {
  return (
    <View style={styles.fill} pointerEvents="box-none">
      <View style={styles.center} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          hitSlop={12}
          onPress={onTogglePlay}
          style={({ pressed }) => [
            styles.iosPlayButton,
            pressed && styles.pressed,
          ]}
        >
          <MaterialIcons
            name={isPlaying ? 'pause' : 'play-arrow'}
            size={28}
            color="#fff"
          />
        </Pressable>
      </View>

      <View style={styles.bottomLeft} pointerEvents="box-none">
        <View style={styles.volumeRow}>
          <SpeakerGlyph size={16} volume={player.volume} />
          <VolumeSlider player={player} width={96} />
        </View>
      </View>

      <View style={styles.bottomRight} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Enter fullscreen"
          hitSlop={10}
          onPress={onEnterFullscreen}
          style={({ pressed }) => [
            styles.iosCornerButton,
            pressed && styles.pressed,
          ]}
        >
          <MaterialIcons name="fullscreen" size={20} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Android
// ---------------------------------------------------------------------------

function AndroidChrome({
  player,
  isPlaying,
  onTogglePlay,
  onEnterFullscreen,
}: {
  player: Player;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onEnterFullscreen: () => void;
}) {
  return (
    <View style={styles.fill} pointerEvents="box-none">
      {/* Soft scrim, matching Media3 PlayerView's default look when controls
          are showing. Keeps the icons legible over light video frames. */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.androidScrim]}
      />

      <View style={styles.center} pointerEvents="box-none">
        {/* `borderless: false` for the same reason as the fullscreen play
            button: keeping the bg drawable around the ripple so the dark
            circle is visible over a bright video frame. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          hitSlop={12}
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
            size={30}
            color="#fff"
          />
        </Pressable>
      </View>

      <View style={styles.bottomLeft} pointerEvents="box-none">
        <View style={styles.volumeRow}>
          <SpeakerGlyph size={16} volume={player.volume} />
          <VolumeSlider player={player} width={96} />
        </View>
      </View>

      <View style={styles.bottomRight} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Enter fullscreen"
          hitSlop={10}
          onPress={onEnterFullscreen}
          android_ripple={{ color: 'rgba(255,255,255,0.18)', borderless: true }}
          style={({ pressed }) => [
            styles.androidCornerButton,
            pressed && styles.pressed,
          ]}
        >
          <MaterialIcons name="fullscreen" size={22} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill },
  pressed: { opacity: 0.7 },

  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },

  bottomRight: {
    position: 'absolute',
    right: 8,
    bottom: 8,
  },

  bottomLeft: {
    position: 'absolute',
    left: 8,
    bottom: 8,
  },

  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },

  // iOS — translucent black pills, matching the fullscreen chrome's look.
  iosPlayButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iosCornerButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Android — bounded ripple on the play button, borderless on the corner
  // (the corner button has no background; the ripple alone gives feedback).
  androidPlayButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  androidCornerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  androidScrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
});
