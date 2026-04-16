import type { MoQBroadcastInfo, MoQPlaybackStats } from 'react-native-moq';
import { useState } from 'react';
import {
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { MoQVideoView, useMoQPlayer, useMoQSession } from 'react-native-moq';

export default function App() {
  const [url, setUrl] = useState('http://192.168.1.48:4443');

  const session = useMoQSession(url);

  const canConnect =
    session.sessionState === 'idle' || session.sessionState === 'closed';

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.container}>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            placeholder="Relay URL"
            autoCapitalize="none"
            autoCorrect={false}
            editable={canConnect}
          />

          <Button
            title={canConnect ? 'Connect' : 'Disconnect'}
            onPress={canConnect ? session.connect : session.disconnect}
          />

          <StateIndicator state={session.sessionState} />

          {session.broadcasts.length === 0 &&
            session.sessionState === 'connected' && (
              <Text style={styles.noBroadcasts}>No broadcasts available</Text>
            )}

          {session.broadcasts.map((broadcast) => (
            <BroadcastPlayer key={broadcast.path} broadcast={broadcast} />
          ))}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ── Per-broadcast player ─────────────────────────────────────────────────────

function BroadcastPlayer({ broadcast }: { broadcast: MoQBroadcastInfo }) {
  const player = useMoQPlayer(broadcast.path);

  return (
    <View style={styles.broadcastCard}>
      <Text style={styles.broadcastPath}>{broadcast.path}</Text>

      <MoQVideoView broadcastPath={broadcast.path} style={styles.video} />

      {(player.isPlaying || player.isPaused) && (
        <Button
          title={player.isPaused ? 'Resume' : 'Pause'}
          onPress={player.isPaused ? player.play : player.pause}
        />
      )}

      {player.playbackStats && <StatsPanel stats={player.playbackStats} />}
    </View>
  );
}

// ── State indicator ──────────────────────────────────────────────────────────

const STATE_COLOR: Record<string, string> = {
  idle: '#9ca3af',
  connecting: '#f59e0b',
  connected: '#3b82f6',
  closed: '#9ca3af',
};

function stateColor(state: string) {
  if (state.startsWith('error:')) return '#ef4444';
  return STATE_COLOR[state] ?? '#9ca3af';
}

function StateIndicator({ state }: { state: string }) {
  return (
    <View style={styles.stateRow}>
      <View style={[styles.dot, { backgroundColor: stateColor(state) }]} />
      <Text style={styles.stateText}>{state}</Text>
    </View>
  );
}

// ── Stats panel ──────────────────────────────────────────────────────────────

function StatsPanel({ stats }: { stats: MoQPlaybackStats }) {
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

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    padding: 16,
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  stateText: {
    fontSize: 14,
    color: '#374151',
  },
  noBroadcasts: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    paddingVertical: 8,
  },
  broadcastCard: {
    gap: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
  },
  broadcastPath: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  video: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
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
