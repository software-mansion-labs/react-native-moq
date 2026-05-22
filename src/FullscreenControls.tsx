import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEvent } from './useEvent';
import { useFullscreenControls } from './FullscreenContext';
import { SpeakerGlyph, VolumeSlider } from './VolumeSlider';
import type { Player } from './types';

// Default fullscreen chrome. The intent is to look like the platform's
// native video player while staying pure-RN: AVPlayerViewController on iOS
// (close button top-left, centered play/pause, no scrim) and Media3
// PlayerView on Android (close button top-right, centered play/pause, soft
// scrim). Icons are drawn with a handful of <View>s so we don't depend on
// react-native-svg or an icon font.
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
          <CloseX size={14} />
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
          {isPlaying ? <PauseGlyph size={28} /> : <PlayGlyph size={28} />}
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
          <SpeakerGlyph size={16} volume={player.volume} />
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
          <CloseX />
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
          {isPlaying ? <PauseGlyph size={30} /> : <PlayGlyph size={30} />}
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
          <SpeakerGlyph size={16} volume={player.volume} />
          <VolumeSlider player={player} width={160} />
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Icons (drawn with <View>s — kept small and self-contained)
// ---------------------------------------------------------------------------

function PlayGlyph({
  size = 28,
  color = '#fff',
}: {
  size?: number;
  color?: string;
}) {
  // CSS triangle trick: a zero-sized box with thick borders on three sides
  // produces a right-pointing equilateral-ish triangle. Offsetting by half
  // the right border keeps the optical center aligned with its container.
  const half = size / 2;
  const dynamic = {
    borderLeftWidth: size,
    borderTopWidth: half,
    borderBottomWidth: half,
    borderLeftColor: color,
    marginLeft: size * 0.25, // optical centering inside a round button
  };
  return <View style={[styles.playGlyph, dynamic]} />;
}

function PauseGlyph({
  size = 28,
  color = '#fff',
}: {
  size?: number;
  color?: string;
}) {
  const barWidth = Math.max(3, size * 0.22);
  const gap = Math.max(4, size * 0.22);
  const row = { gap };
  const bar = { width: barWidth, height: size, backgroundColor: color };
  return (
    <View style={[styles.pauseRow, row]}>
      <View style={[styles.pauseBar, bar]} />
      <View style={[styles.pauseBar, bar]} />
    </View>
  );
}

function CloseX({
  size = 18,
  color = '#fff',
  thickness = 2,
}: {
  size?: number;
  color?: string;
  thickness?: number;
}) {
  const container = { width: size, height: size };
  const bar = {
    top: (size - thickness) / 2,
    width: size,
    height: thickness,
    backgroundColor: color,
    borderRadius: thickness / 2,
  };
  return (
    <View style={container}>
      <View style={[styles.closeBar, bar, styles.rot45]} />
      <View style={[styles.closeBar, bar, styles.rotNeg45]} />
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

  playGlyph: {
    width: 0,
    height: 0,
    borderRightWidth: 0,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  pauseRow: { flexDirection: 'row' },
  pauseBar: { borderRadius: 1.5 },
  closeBar: { position: 'absolute', left: 0 },
  rot45: { transform: [{ rotate: '45deg' }] },
  rotNeg45: { transform: [{ rotate: '-45deg' }] },
});
