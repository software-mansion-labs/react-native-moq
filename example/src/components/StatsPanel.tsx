import type { PlaybackStats } from 'react-native-moq';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { SectionHeader } from './ui';
import { useTheme } from '../theme';

export function StatsPanel({ stats }: { stats: PlaybackStats }) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={[
        styles.stats,
        { backgroundColor: colors.fill, borderRadius: radius.control },
      ]}
    >
      <SectionHeader title="Playback stats" />
      {stats.videoLatencyMs != null && (
        <StatRow
          label="Video latency"
          value={`${Math.round(stats.videoLatencyMs)} ms`}
        />
      )}
      {stats.audioLatencyMs != null && (
        <StatRow
          label="Audio latency"
          value={`${Math.round(stats.audioLatencyMs)} ms`}
        />
      )}
      {stats.videoFps != null && (
        <StatRow
          label="Frame rate"
          value={`${Math.round(stats.videoFps)} fps`}
        />
      )}
      {stats.videoBitrateKbps != null && (
        <StatRow
          label="Video bitrate"
          value={
            stats.videoBitrateKbps >= 1000
              ? `${(stats.videoBitrateKbps / 1000).toFixed(1)} Mbps`
              : `${Math.round(stats.videoBitrateKbps)} kbps`
          }
        />
      )}
      {stats.videoJitterBufferMs != null && (
        <StatRow
          label="Jitter buffer"
          value={`${Math.round(stats.videoJitterBufferMs)} ms`}
        />
      )}
    </View>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.statRow}>
      <Text style={[styles.statLabel, { color: colors.secondaryLabel }]}>
        {label}
      </Text>
      <Text style={[styles.statValue, { color: colors.label }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: {
    padding: 12,
    gap: 6,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statLabel: {
    fontSize: 13,
  },
  statValue: {
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
