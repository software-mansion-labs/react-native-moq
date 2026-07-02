import { StyleSheet, Text, View } from 'react-native';
import { VideoView, type Player } from 'react-native-moq';
import { boyColors } from './theme';

interface BoyScreenPanelProps {
  player: Player | null;
  isConnected: boolean;
  isConnecting: boolean;
  selectedGameName: string | null;
  placeholder: { title: string; subtitle: string };
  lastError?: string | null;
}

export function BoyScreenPanel({
  player,
  isConnected,
  isConnecting,
  selectedGameName,
  placeholder,
  lastError,
}: BoyScreenPanelProps) {
  return (
    <View style={styles.bezel}>
      <View style={styles.headerRow}>
        <View
          style={[
            styles.battery,
            isConnected ? styles.batteryOn : styles.batteryOff,
          ]}
        />
        <Text style={styles.dotMatrix}>DOT MATRIX WITH STEREO SOUND</Text>
      </View>

      <View style={styles.screen}>
        {player ? (
          <VideoView player={player} style={StyleSheet.absoluteFill} />
        ) : isConnected || isConnecting ? (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderTitle}>{placeholder.title}</Text>
            <Text style={styles.placeholderSubtitle}>
              {placeholder.subtitle}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.footerRow}>
        <Text style={styles.gameName} numberOfLines={1}>
          {selectedGameName ?? 'NO CARTRIDGE'}
        </Text>
        {!!lastError && (
          <Text style={styles.error} numberOfLines={2}>
            {lastError}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bezel: {
    flex: 1,
    backgroundColor: boyColors.screenBezel,
    borderRadius: 22,
    padding: 16,
    gap: 12,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  battery: { width: 12, height: 12, borderRadius: 6 },
  batteryOn: { backgroundColor: boyColors.batteryOn },
  batteryOff: { backgroundColor: boyColors.batteryOff },
  dotMatrix: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  screen: {
    flex: 1,
    minHeight: 150,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#555',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: { alignItems: 'center', gap: 8, padding: 24 },
  placeholderTitle: {
    color: boyColors.screenInk,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  placeholderSubtitle: {
    color: boyColors.screenInk,
    opacity: 0.7,
    fontSize: 12,
    textAlign: 'center',
  },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gameName: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  error: {
    flex: 1,
    color: '#ff8a8a',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'right',
  },
});
