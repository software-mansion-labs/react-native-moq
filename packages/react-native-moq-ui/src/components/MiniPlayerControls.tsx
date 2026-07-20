import { Platform, StyleSheet, View } from 'react-native';
import { type Player } from 'react-native-moq';
import { useMiniPlayerControls } from '../contexts/MiniPlayerContext';
import { usePlayPause } from '../usePlayPause';
import {
  AndroidScrim,
  ChromeIconButton,
  PlayPauseButton,
  VolumeRow,
} from './chrome';

// Default inline chrome for VideoPlayerView: centered play/pause and a
// bottom-right fullscreen-enter button. Visibility and the enter-fullscreen
// action come from MiniPlayerContext.
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
      <PlayPauseButton
        isPlaying={isPlaying}
        onPress={onTogglePlay}
        size={52}
        iconSize={28}
        hitSlop={12}
      />

      <View style={styles.bottomLeft} pointerEvents="box-none">
        <VolumeRow player={player} size="small" />
      </View>

      <View style={styles.bottomRight} pointerEvents="box-none">
        <ChromeIconButton
          icon="fullscreen"
          iconSize={20}
          size={32}
          hitSlop={10}
          accessibilityLabel="Enter fullscreen"
          onPress={onEnterFullscreen}
        />
      </View>
    </View>
  );
}

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
      <AndroidScrim />

      <PlayPauseButton
        isPlaying={isPlaying}
        onPress={onTogglePlay}
        size={56}
        iconSize={30}
        hitSlop={12}
      />

      <View style={styles.bottomLeft} pointerEvents="box-none">
        <VolumeRow player={player} size="small" />
      </View>

      <View style={styles.bottomRight} pointerEvents="box-none">
        <ChromeIconButton
          icon="fullscreen"
          iconSize={22}
          size={36}
          hitSlop={10}
          accessibilityLabel="Enter fullscreen"
          onPress={onEnterFullscreen}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill },

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
});
