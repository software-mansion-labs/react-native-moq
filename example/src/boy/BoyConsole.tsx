import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { Player } from 'react-native-moq';
import { Button } from '../components/ui';
import {
  BoyActionCluster,
  BoyDirectionPad,
  BoyStartSelectCluster,
} from './ControlPad';
import { BoyScreenPanel } from './BoyScreenPanel';
import { BoyBackFace } from './BoyBackFace';
import { boyColors } from './theme';
import type { BoyControl, BoyGame } from './types';

export interface BoyConsoleProps {
  isConnected: boolean;
  isConnecting: boolean;
  canStop: boolean;
  onPower: () => void;
  player: Player | null;
  controlsEnabled: boolean;
  onButton: (control: BoyControl, isPressed: boolean) => void;
  selectedGameName: string | null;
  placeholder: { title: string; subtitle: string };
  lastError?: string | null;
  games: BoyGame[];
  selectedGamePath: string | null;
  onSelectGame: (path: string | null) => void;
  latency: number;
  onLatencyChange: (ms: number) => void;
  // Lifted so it survives the front/back remount on game change.
  showsBack: boolean;
  onToggleFlip: () => void;
  // Fires when the flip settles facing front — cue to mount the game's video.
  onFlipSettled?: () => void;
}

export function BoyConsole({
  isConnected,
  isConnecting,
  canStop,
  onPower,
  player,
  controlsEnabled,
  onButton,
  selectedGameName,
  placeholder,
  lastError,
  games,
  selectedGamePath,
  onSelectGame,
  latency,
  onLatencyChange,
  showsBack,
  onToggleFlip,
  onFlipSettled,
}: BoyConsoleProps) {
  // 0 = front, 1 = back. Init to the current side so remounts don't spin.
  const flip = useRef(new Animated.Value(showsBack ? 1 : 0)).current;

  const onFlipSettledRef = useRef(onFlipSettled);
  onFlipSettledRef.current = onFlipSettled;

  useEffect(() => {
    Animated.spring(flip, {
      toValue: showsBack ? 1 : 0,
      useNativeDriver: true,
      friction: 9,
      tension: 12,
    }).start(({ finished }) => {
      // Only safe to mount the game's video once fully facing front.
      if (finished && !showsBack) onFlipSettledRef.current?.();
    });
  }, [showsBack, flip]);

  const frontRotate = flip.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });
  const backRotate = flip.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });
  // Hard-cut each face at the halfway point; backfaceVisibility is unreliable
  // on Android.
  const frontOpacity = flip.interpolate({
    inputRange: [0, 0.5, 0.5, 1],
    outputRange: [1, 1, 0, 0],
  });
  const backOpacity = flip.interpolate({
    inputRange: [0, 0.5, 0.5, 1],
    outputRange: [0, 0, 1, 1],
  });

  return (
    <View style={styles.outer}>
      <View style={styles.topBar}>
        <Button
          title={
            isConnecting ? 'Starting…' : canStop ? 'Power off' : 'Power on'
          }
          icon="power-settings-new"
          variant={canStop ? 'tonal' : 'filled'}
          destructive={canStop && !isConnecting}
          onPress={onPower}
        />
        <Button
          title={showsBack ? 'Front' : 'Back'}
          icon="autorenew"
          variant="tonal"
          onPress={onToggleFlip}
        />
      </View>

      <View style={styles.flipArea}>
        <Animated.View
          style={[
            styles.face,
            {
              opacity: frontOpacity,
              transform: [{ perspective: 1200 }, { rotateY: frontRotate }],
            },
          ]}
          pointerEvents={showsBack ? 'none' : 'auto'}
        >
          <View style={styles.shell}>
            <BoyScreenPanel
              player={player}
              isConnected={isConnected}
              isConnecting={isConnecting}
              selectedGameName={selectedGameName}
              placeholder={placeholder}
              lastError={lastError}
            />

            <View style={styles.deck}>
              <View style={styles.deckRow}>
                <BoyDirectionPad
                  enabled={controlsEnabled}
                  onPressChange={onButton}
                />
                <BoyActionCluster
                  enabled={controlsEnabled}
                  onPressChange={onButton}
                />
              </View>
              <View style={styles.startSelectWrap}>
                <BoyStartSelectCluster
                  enabled={controlsEnabled}
                  onPressChange={onButton}
                />
              </View>
            </View>

            <View style={styles.brandRow}>
              <Text style={styles.brand}>BOY</Text>
              <View style={styles.grille}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <View key={i} style={styles.grilleBar} />
                ))}
              </View>
            </View>
          </View>
        </Animated.View>

        <Animated.View
          style={[
            styles.face,
            styles.faceAbsolute,
            {
              opacity: backOpacity,
              transform: [{ perspective: 1200 }, { rotateY: backRotate }],
            },
          ]}
          pointerEvents={showsBack ? 'auto' : 'none'}
        >
          <View style={styles.shell}>
            <BoyBackFace
              games={games}
              selectedGamePath={selectedGamePath}
              selectedGameName={selectedGameName}
              isConnected={isConnected}
              onSelectGame={onSelectGame}
              latency={latency}
              onLatencyChange={onLatencyChange}
            />
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, gap: 16 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  flipArea: { flex: 1 },
  face: { flex: 1, backfaceVisibility: 'hidden' },
  faceAbsolute: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  shell: {
    flex: 1,
    backgroundColor: boyColors.shellTop,
    borderRadius: 34,
    padding: 22,
    gap: 22,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
  },
  deck: { gap: 12, paddingHorizontal: 4 },
  deckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  startSelectWrap: { alignItems: 'center', marginTop: 8 },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    color: boyColors.brand,
    fontSize: 24,
    fontWeight: '900',
    fontStyle: 'italic',
  },
  grille: { flexDirection: 'row', gap: 6, paddingRight: 8 },
  grilleBar: {
    width: 4,
    height: 26,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.32)',
    transform: [{ rotate: '22deg' }],
  },
});
