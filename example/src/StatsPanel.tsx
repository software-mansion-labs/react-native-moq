import type { PlaybackStats } from 'react-native-moq';
import { StyleSheet, Text, View } from 'react-native';

export function StatsPanel({ stats }: { stats: PlaybackStats }) {
  return (
    <View style={styles.stats}>
      <Text style={styles.statsTitle}>Playback stats</Text>
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
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: {
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    padding: 12,
    gap: 6,
  },
  statsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  statValue: {
    fontSize: 13,
    fontFamily: 'Menlo',
    color: '#111827',
  },
});
