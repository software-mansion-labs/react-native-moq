import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { boyColors, cartridgeColors } from './theme';
import type { BoyGame } from './types';

interface BoyBackFaceProps {
  games: BoyGame[];
  selectedGamePath: string | null;
  selectedGameName: string | null;
  isConnected: boolean;
  onSelectGame: (path: string | null) => void;
  latency: number;
  onLatencyChange: (ms: number) => void;
}

// The flipped-over back face: the cartridge bay.
export function BoyBackFace({
  games,
  selectedGamePath,
  selectedGameName,
  isConnected,
  onSelectGame,
  latency,
  onLatencyChange,
}: BoyBackFaceProps) {
  const stepLatency = (delta: number) =>
    onLatencyChange(Math.min(2000, Math.max(50, latency + delta)));

  const dockColors = cartridgeColors(selectedGameName);

  return (
    <View style={styles.back}>
      <View style={styles.modelRow}>
        <Text style={styles.modelBrand}>BOY</Text>
        <Text style={styles.modelName}>Model DMQ-01</Text>
      </View>

      <View style={styles.dock}>
        <Text style={styles.dockLabel}>CARTRIDGE</Text>
        <View style={styles.slot}>
          {selectedGameName ? (
            <View style={[styles.lip, { backgroundColor: dockColors.top }]}>
              <View style={styles.lipSticker}>
                <Text style={styles.lipName} numberOfLines={1}>
                  {selectedGameName}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={styles.slotEmpty}>NO GAME INSERTED</Text>
          )}
        </View>
      </View>

      <View style={styles.wheelHeader}>
        <Text style={styles.wheelTitle}>CARTRIDGE WHEEL</Text>
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
              ? 'Waiting for games to appear'
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

      <View style={styles.detailRow}>
        <View style={styles.pill}>
          <Text style={styles.pillLabel}>Catalog</Text>
          <Text style={styles.pillValue}>
            {games.length === 0
              ? isConnected
                ? 'Searching'
                : '—'
              : games.length}
          </Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillLabel}>Latency</Text>
          <Pressable
            style={styles.stepButton}
            onPress={() => stepLatency(-50)}
            disabled={latency <= 50}
          >
            <Text style={styles.stepButtonText}>−</Text>
          </Pressable>
          <Text style={styles.pillValue}>{latency} ms</Text>
          <Pressable
            style={styles.stepButton}
            onPress={() => stepLatency(50)}
            disabled={latency >= 2000}
          >
            <Text style={styles.stepButtonText}>+</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.tip}>
        Flip the console, choose a game, then flip back to play.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, gap: 14 },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  modelBrand: { color: boyColors.brand, fontSize: 24, fontWeight: '900' },
  modelName: { color: boyColors.subLabel, fontSize: 11, fontWeight: '700' },
  dock: {
    backgroundColor: boyColors.backPanel,
    borderRadius: 22,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  dockLabel: {
    color: boyColors.subLabel,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  slot: {
    height: 64,
    borderRadius: 16,
    backgroundColor: boyColors.slot,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  slotEmpty: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  lip: {
    width: '80%',
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lipSticker: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 4,
    maxWidth: '85%',
  },
  lipName: { color: boyColors.label, fontSize: 13, fontWeight: '900' },
  wheelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wheelTitle: {
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
    width: 128,
    height: 146,
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
  detailRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  pillLabel: { color: boyColors.subLabel, fontSize: 10, fontWeight: '900' },
  pillValue: {
    color: boyColors.label,
    fontSize: 12,
    fontWeight: '800',
    minWidth: 24,
    textAlign: 'center',
  },
  stepButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  stepButtonText: { color: boyColors.label, fontSize: 18, fontWeight: '800' },
  tip: {
    color: boyColors.subLabel,
    fontSize: 12,
    fontWeight: '600',
  },
});
