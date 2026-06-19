import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Player } from 'react-native-moq';
import {
  BoyActionCluster,
  BoyDirectionPad,
  BoyStartSelectCluster,
} from './ControlPad';
import { BoyScreenPanel } from './BoyScreenPanel';
import { boyColors } from './theme';
import type { BoyControl } from './types';

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
}

// The plastic shell — power switch, dot-matrix screen, control deck, brand and
// speaker grille. Pure presentation; all state arrives via props. Ported from
// BoyConsoleView.frontFace in moq-kit's iOS demo.
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
}: BoyConsoleProps) {
  return (
    <View style={styles.outer}>
      <View style={styles.topBar}>
        <PowerSwitch isOn={canStop} isBusy={isConnecting} onPress={onPower} />
      </View>

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
    </View>
  );
}

function PowerSwitch({
  isOn,
  isBusy,
  onPress,
}: {
  isOn: boolean;
  isBusy: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.power} onPress={onPress}>
      <Text style={styles.powerLabel}>POWER</Text>
      <View style={styles.powerTrack}>
        <View
          style={[
            styles.powerKnob,
            isOn ? styles.powerKnobOn : styles.powerKnobOff,
            isBusy && styles.powerKnobBusy,
          ]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: { gap: 16 },
  topBar: { flexDirection: 'row', alignItems: 'center' },
  power: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 999,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  powerLabel: {
    color: boyColors.label,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  powerTrack: {
    width: 64,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.18)',
    padding: 3,
    justifyContent: 'center',
  },
  powerKnob: { width: 32, height: 20, borderRadius: 10 },
  powerKnobOff: { alignSelf: 'flex-start', backgroundColor: '#f4f1e8' },
  powerKnobOn: { alignSelf: 'flex-end', backgroundColor: boyColors.batteryOn },
  powerKnobBusy: { backgroundColor: boyColors.shellEdge },
  shell: {
    backgroundColor: boyColors.shellTop,
    borderRadius: 34,
    padding: 22,
    gap: 26,
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
