import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';
import { useEvent, type Player } from 'react-native-moq';
import { useFullscreenControls } from '../contexts/FullscreenContext';
import { SpeakerGlyph, VolumeSlider } from './VolumeSlider';

// Default fullscreen chrome. Mirrors the platform conventions: a close
// button positioned per-platform (top-left on iOS like AVPlayerViewController,
// top-right on Android like Media3 PlayerView), a centered play/pause, and
// a volume row along the bottom.
//
// Visibility and exit are read from FullscreenContext; this component only
// renders the chrome itself.
export function FullscreenControls() {
  const { player, exit, show } = useFullscreenControls();
  // The Modal can put the top button behind notches / the dynamic island in
  // landscape too (where insets show up on left/right). We respect all four
  // edges so the layout stays correct in any orientation.
  const insets = useSafeAreaInsets();
  // Reactively follows isPlaying. The Player keeps its own isPlaying flag in
  // sync via this event, so seeding with the current value avoids a brief
  // mismatch on mount before the first event lands.
  const playingEvent = useEvent(player, 'playingChange', {
    isPlaying: player.isPlaying,
  });
  const isPlaying = playingEvent.isPlaying;

  // Any control press should count as activity, so the auto-hide timer
  // restarts (and we don't immediately fade out underneath the user's finger).
  const onTogglePlay = () => {
    show();
    if (isPlaying) player.pause();
    else player.play();
  };
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

// ---------------------------------------------------------------------------
// iOS
// ---------------------------------------------------------------------------

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
  // AVPlayerViewController sits its close pill a comfortable distance below
  // the dynamic island / notch and slightly inside the safe area on the
  // sides. We add a small extra margin on top of the inset so the pill
  // doesn't visually butt up against the island.
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

// ---------------------------------------------------------------------------
// Android
// ---------------------------------------------------------------------------

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
  // Media3 PlayerView places its close button inside the cutout-safe area
  // and pads horizontally so the icon sits flush with the system gesture
  // exclusion zones (which appear on the sides in landscape).
  const topBarStyle = {
    paddingTop: insets.top + 4,
    paddingLeft: insets.left + 8,
    paddingRight: insets.right + 8,
  };
  return (
    <View style={styles.fill} pointerEvents="box-none">
      {/* Soft scrim: Media3's default PlayerView dims the video slightly when
          controls are showing so light text stays legible. The center scrim
          is intentionally light — too dark would feel heavier than native. */}
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
        {/* The android_ripple below is `borderless: false` on purpose:
            `borderless: true` swaps the View's background drawable for
            ?attr/selectableItemBackgroundBorderless, which has no
            background, so the dark circle from `androidPlayButton` would
            disappear and the button would look invisible against a dark
            video frame. Bounded ripple keeps the bg and lets the ripple
            ride on top of it, clipped to the border radius. */}
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

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
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
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // iOS uses a soft translucent black circle (mimicking the system blur
  // material — we'd need a native blur view for the real thing).
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

  // Material uses borderless ripples on icon buttons; the background sits
  // a hair lighter than the iOS pill to read against the slight scrim.
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
