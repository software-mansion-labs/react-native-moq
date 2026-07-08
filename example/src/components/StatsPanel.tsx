import type { PlaybackStats, StallStats } from 'react-native-moq';
import { useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ColorValue,
} from 'react-native';
import MaterialIcons from '@react-native-vector-icons/material-icons';
import { useTheme, type Theme } from '../theme';

export function StatsPanel({ stats }: { stats: PlaybackStats }) {
  const theme = useTheme();
  const { colors, radius } = theme;
  const [expanded, setExpanded] = useState(false);

  return (
    <View
      style={[
        styles.stats,
        { backgroundColor: colors.fill, borderRadius: radius.control },
      ]}
    >
      <Pressable
        onPress={() => setExpanded((e) => !e)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={styles.header}
      >
        <Text style={[styles.headerTitle, { color: colors.secondaryLabel }]}>
          STATS FOR NERDS
        </Text>
        <View style={styles.headerSummary}>
          {stats.videoLatencyMs != null && (
            <Text
              style={[
                styles.summaryText,
                { color: latencyColor(stats.videoLatencyMs, theme) },
              ]}
            >
              {formatMs(stats.videoLatencyMs)}
            </Text>
          )}
          {stats.videoFps != null && (
            <Text style={[styles.summaryText, { color: colors.tertiaryLabel }]}>
              {Math.round(stats.videoFps)} fps
            </Text>
          )}
          <MaterialIcons
            name={expanded ? 'expand-less' : 'expand-more'}
            size={18}
            color={colors.tertiaryLabel}
          />
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.sections}>
          <Section title="Startup">
            <StatRow
              label="Time to first video frame"
              value={stats.timeToFirstVideoFrameMs}
              format={formatMs}
              color={startupColor(stats.timeToFirstVideoFrameMs, theme)}
            />
            <StatRow
              label="Time to first audio frame"
              value={stats.timeToFirstAudioFrameMs}
              format={formatMs}
              color={startupColor(stats.timeToFirstAudioFrameMs, theme)}
            />
          </Section>
          <Section title="Latency">
            <StatRow
              label="Video live latency"
              value={stats.videoLatencyMs}
              format={formatMs}
              color={latencyColor(stats.videoLatencyMs, theme)}
            />
            <StatRow
              label="Audio live latency"
              value={stats.audioLatencyMs}
              format={formatMs}
              color={latencyColor(stats.audioLatencyMs, theme)}
            />
          </Section>
          <Section title="Buffers">
            <StatRow
              label="Video jitter buffer"
              value={stats.videoJitterBufferMs}
              format={formatMs}
            />
            <StatRow
              label="Audio ring buffer"
              value={stats.audioRingBufferMs}
              format={formatMs}
            />
          </Section>
          <Section title="Throughput">
            <StatRow
              label="Video bitrate"
              value={stats.videoBitrateKbps}
              format={formatBitrate}
            />
            <StatRow
              label="Audio bitrate"
              value={stats.audioBitrateKbps}
              format={formatBitrate}
            />
            <StatRow
              label="Displayed frame rate"
              value={stats.videoFps}
              format={(fps) => `${Math.round(fps)} fps`}
            />
          </Section>
          <Section title="Health">
            <StatRow
              label="Video stalls"
              value={stats.videoStalls}
              format={formatStalls}
              color={stallColor(stats.videoStalls, theme)}
            />
            <StatRow
              label="Audio stalls"
              value={stats.audioStalls}
              format={formatStalls}
              color={stallColor(stats.audioStalls, theme)}
            />
            <StatRow
              label="Video frames dropped"
              value={stats.videoFramesDropped}
              format={String}
              color={
                stats.videoFramesDropped ? theme.colors.warning : undefined
              }
            />
            <StatRow
              label="Audio frames dropped"
              value={stats.audioFramesDropped}
              format={String}
              color={
                stats.audioFramesDropped ? theme.colors.warning : undefined
              }
            />
          </Section>
        </View>
      )}
    </View>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const rows = (
    Array.isArray(children) ? children : [children]
  ) as React.ReactElement<{ value?: unknown }>[];
  if (rows.every((row) => row.props.value == null)) return null;
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.tertiaryLabel }]}>
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function StatRow<T>({
  label,
  value,
  format,
  color,
}: {
  label: string;
  value: T | undefined;
  format: (value: T) => string;
  color?: ColorValue;
}) {
  const { colors } = useTheme();
  if (value == null) return null;
  return (
    <View style={styles.statRow}>
      <Text style={[styles.statLabel, { color: colors.secondaryLabel }]}>
        {label}
      </Text>
      <Text style={[styles.statValue, { color: color ?? colors.label }]}>
        {format(value)}
      </Text>
    </View>
  );
}

function latencyColor(ms: number | undefined, theme: Theme) {
  if (ms == null) return undefined;
  if (ms < 150) return theme.colors.success;
  if (ms < 500) return theme.colors.warning;
  return theme.colors.destructive;
}

function startupColor(ms: number | undefined, theme: Theme) {
  if (ms == null) return undefined;
  if (ms < 250) return theme.colors.success;
  if (ms < 1000) return theme.colors.warning;
  return theme.colors.destructive;
}

function stallColor(stalls: StallStats | undefined, theme: Theme) {
  return stalls && stalls.count > 0 ? theme.colors.warning : undefined;
}

function formatMs(ms: number) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${Math.round(ms)} ms`;
}

function formatBitrate(kbps: number) {
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} Mbps`;
  return `${Math.round(kbps)} kbps`;
}

// count / total duration / rebuffering ratio
function formatStalls(stalls: StallStats) {
  return `${stalls.count} / ${formatMs(stalls.totalDurationMs)} / ${(
    stalls.rebufferingRatio * 100
  ).toFixed(1)}%`;
}

const styles = StyleSheet.create({
  stats: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  headerSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryText: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  sections: {
    marginTop: 10,
    gap: 12,
  },
  section: {
    gap: 5,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  statLabel: {
    fontSize: 13,
  },
  statValue: {
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
