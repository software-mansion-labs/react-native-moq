import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Player } from 'react-native-moq';
import { useFullscreenControls } from '../contexts/FullscreenContext';
import { usePlayPause } from '../usePlayPause';
import {
  AndroidScrim,
  ChromeIconButton,
  PlayPauseButton,
  VolumeRow,
} from './chrome';

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
        <ChromeIconButton
          icon="close"
          iconSize={20}
          size={36}
          hitSlop={12}
          accessibilityLabel="Exit fullscreen"
          onPress={onExit}
        />
      </View>

      <PlayPauseButton
        isPlaying={isPlaying}
        onPress={onTogglePlay}
        size={72}
        iconSize={40}
        hitSlop={16}
      />

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
        <VolumeRow player={player} size="large" />
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
      <AndroidScrim />

      <View style={[styles.topBar, topBarStyle]} pointerEvents="box-none">
        <View style={styles.flexFill} />
        <ChromeIconButton
          icon="close"
          iconSize={24}
          size={44}
          hitSlop={12}
          accessibilityLabel="Exit fullscreen"
          onPress={onExit}
        />
      </View>

      <PlayPauseButton
        isPlaying={isPlaying}
        onPress={onTogglePlay}
        size={72}
        iconSize={42}
        hitSlop={16}
      />

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
        <VolumeRow player={player} size="large" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill },
  flexFill: { flex: 1 },

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
});
