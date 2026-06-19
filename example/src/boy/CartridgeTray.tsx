import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { boyColors, cartridgeColors } from './theme';
import type { BoyGame } from './types';

interface CartridgeTrayProps {
  games: BoyGame[];
  selectedGamePath: string | null;
  isConnected: boolean;
  onSelectGame: (path: string | null) => void;
  latency: number;
  onLatencyChange: (ms: number) => void;
}

// The cartridge picker — a horizontal wheel of game cards plus eject and the
// target-latency control. Collapses moq-kit's flip-to-back cartridge dock into
// an always-visible tray below the console.
export function CartridgeTray({
  games,
  selectedGamePath,
  isConnected,
  onSelectGame,
  latency,
  onLatencyChange,
}: CartridgeTrayProps) {
  const stepLatency = (delta: number) =>
    onLatencyChange(Math.min(2000, Math.max(50, latency + delta)));

  return (
    <View style={styles.tray}>
      <View style={styles.header}>
        <Text style={styles.title}>CARTRIDGES</Text>
        {selectedGamePath != null && (
          <Pressable onPress={() => onSelectGame(null)} hitSlop={8}>
            <Text style={styles.eject}>Eject</Text>
          </Pressable>
        )}
      </View>

      {games.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {isConnected
              ? 'Scanning for cartridges…'
              : 'Power on to scan for games'}
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cards}
        >
          {games.map((game) => {
            const selected = game.broadcastPath === selectedGamePath;
            const colors = cartridgeColors(game.name);
            return (
              <Pressable
                key={game.broadcastPath}
                onPress={() => onSelectGame(game.broadcastPath)}
                style={[
                  styles.card,
                  { backgroundColor: colors.top, borderColor: colors.bottom },
                  selected && styles.cardSelected,
                ]}
              >
                <View style={styles.cardTopRow}>
                  <Text style={styles.cardBrand}>BOY</Text>
                  <View
                    style={[
                      styles.cardDot,
                      selected ? styles.cardDotOn : styles.cardDotOff,
                    ]}
                  />
                </View>
                <View style={styles.cardLabel}>
                  <Text style={styles.cardName} numberOfLines={3}>
                    {game.name}
                  </Text>
                  <Text style={styles.cardHint}>
                    {selected ? 'Inserted' : 'Tap to insert'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.latencyRow}>
        <Text style={styles.latencyLabel}>TARGET LATENCY</Text>
        <View style={styles.stepper}>
          <Pressable
            style={styles.stepButton}
            onPress={() => stepLatency(-50)}
            disabled={latency <= 50}
          >
            <Text style={styles.stepButtonText}>−</Text>
          </Pressable>
          <Text style={styles.latencyValue}>{latency} ms</Text>
          <Pressable
            style={styles.stepButton}
            onPress={() => stepLatency(50)}
            disabled={latency >= 2000}
          >
            <Text style={styles.stepButtonText}>+</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tray: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 24,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: boyColors.label,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
  },
  eject: { color: boyColors.indicator, fontSize: 12, fontWeight: '700' },
  empty: {
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: 18,
  },
  emptyText: { color: boyColors.label, fontSize: 13, fontWeight: '700' },
  cards: { gap: 12, paddingVertical: 4 },
  card: {
    width: 132,
    height: 150,
    borderRadius: 18,
    padding: 12,
    justifyContent: 'space-between',
    borderWidth: 2,
  },
  cardSelected: { borderColor: '#fff' },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardBrand: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 11,
    fontWeight: '900',
  },
  cardDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff' },
  cardDotOn: { opacity: 0.95 },
  cardDotOff: { opacity: 0.42 },
  cardLabel: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 14,
    padding: 10,
    gap: 6,
    alignItems: 'center',
  },
  cardName: {
    color: boyColors.label,
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  cardHint: { color: boyColors.subLabel, fontSize: 10, fontWeight: '700' },
  latencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  latencyLabel: {
    color: boyColors.subLabel,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  stepButtonText: { color: boyColors.label, fontSize: 20, fontWeight: '800' },
  latencyValue: {
    color: boyColors.label,
    fontSize: 14,
    fontWeight: '800',
    minWidth: 64,
    textAlign: 'center',
  },
});
