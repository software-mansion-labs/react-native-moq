import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useEvent, type Player } from 'react-native-moq';
import { useMiniPlayerControls } from '../contexts/MiniPlayerContext';
import { SpeakerGlyph, VolumeSlider } from './VolumeSlider';

// Default inline chrome for VideoPlayerView. Mirrors the platform split used
// by FullscreenControls but scaled down for an embedded view:
//   - centered play/pause (smaller than the fullscreen version)
//   - bottom-right fullscreen-enter button (the universal convention for
//     inline players: YouTube embed, AVPlayerViewController inline, Media3
//     PlayerView's default control bar)
// No close button (you're already not fullscreen), no scrubber (live), no
// volume (the Player API doesn't expose it). Icons are drawn with a handful
// of <View>s so we don't depend on react-native-svg or an icon font.
//
// Visibility and the enter-fullscreen action are read from MiniPlayerContext;
// this component only renders the chrome itself.
export function MiniPlayerControls() {
  const { player, enterFullscreen, show } = useMiniPlayerControls();
  // Reactively follows isPlaying. Seeded with the current value to avoid a
  // one-frame mismatch before the first event lands — same trick as in
  // FullscreenControls.
  const playingEvent = useEvent(player, 'playingChange', {
    isPlaying: player.isPlaying,
  });
  const isPlaying = playingEvent.isPlaying;

  // Any control press counts as activity so the auto-hide timer restarts.
  const onTogglePlay = () => {
    show();
    if (isPlaying) player.pause();
    else player.play();
  };
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
          {isPlaying ? <PauseGlyph size={20} /> : <PlayGlyph size={20} />}
        </Pressable>
      </View>

      <View style={styles.bottomLeft} pointerEvents="box-none">
        <View style={styles.volumeRow}>
          <SpeakerGlyph size={14} volume={player.volume} />
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
          <FullscreenEnterGlyph size={14} />
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
          {isPlaying ? <PauseGlyph size={22} /> : <PlayGlyph size={22} />}
        </Pressable>
      </View>

      <View style={styles.bottomLeft} pointerEvents="box-none">
        <View style={styles.volumeRow}>
          <SpeakerGlyph size={14} volume={player.volume} />
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
          <FullscreenEnterGlyph size={16} />
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Icons (drawn with <View>s — kept small and self-contained)
// ---------------------------------------------------------------------------

function PlayGlyph({
  size = 20,
  color = '#fff',
}: {
  size?: number;
  color?: string;
}) {
  const half = size / 2;
  const dynamic = {
    borderLeftWidth: size,
    borderTopWidth: half,
    borderBottomWidth: half,
    borderLeftColor: color,
    marginLeft: size * 0.25, // optical centering inside the round button
  };
  return <View style={[styles.playGlyph, dynamic]} />;
}

function PauseGlyph({
  size = 20,
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

function FullscreenEnterGlyph({
  size = 16,
  color = '#fff',
  thickness = 2,
}: {
  size?: number;
  color?: string;
  thickness?: number;
}) {
  // Four corner brackets pointing outward — the universal "enter fullscreen"
  // glyph used by YouTube, Media3, etc. Each corner is two thin Views
  // forming an L, anchored to that corner of the icon box.
  const arm = Math.max(4, size * 0.4);
  const horizontal = {
    position: 'absolute' as const,
    width: arm,
    height: thickness,
    backgroundColor: color,
    borderRadius: thickness / 2,
  };
  const vertical = {
    position: 'absolute' as const,
    width: thickness,
    height: arm,
    backgroundColor: color,
    borderRadius: thickness / 2,
  };
  const container = { width: size, height: size };
  return (
    <View style={container}>
      {/* Top-left */}
      <View style={[horizontal, styles.cornerTL]} />
      <View style={[vertical, styles.cornerTL]} />
      {/* Top-right */}
      <View style={[horizontal, styles.cornerTR]} />
      <View style={[vertical, styles.cornerTR]} />
      {/* Bottom-left */}
      <View style={[horizontal, styles.cornerBL]} />
      <View style={[vertical, styles.cornerBL]} />
      {/* Bottom-right */}
      <View style={[horizontal, styles.cornerBR]} />
      <View style={[vertical, styles.cornerBR]} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
  pressed: { opacity: 0.7 },

  center: {
    ...StyleSheet.absoluteFillObject,
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

  playGlyph: {
    width: 0,
    height: 0,
    borderRightWidth: 0,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  pauseRow: { flexDirection: 'row' },
  pauseBar: { borderRadius: 1.5 },
  cornerTL: { top: 0, left: 0 },
  cornerTR: { top: 0, right: 0 },
  cornerBL: { bottom: 0, left: 0 },
  cornerBR: { bottom: 0, right: 0 },
});
