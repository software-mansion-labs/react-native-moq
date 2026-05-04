import type {
  MoQBroadcastInfo,
  MoQPlaybackStats,
  MoQVideoTrackInfo,
} from 'react-native-moq';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  VideoView,
  useEvent,
  useEventListener,
  usePlayer,
  useSession,
} from 'react-native-moq';

// ── Event log ────────────────────────────────────────────────────────────────

type LogEntry = {
  id: number;
  time: string;
  source?: string;
  label: string;
  detail?: string;
};

type AddEntry = (label: string, detail?: string, source?: string) => void;

function useEventLog(): [LogEntry[], AddEntry] {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const counterRef = useRef(0);

  const addEntry = useCallback<AddEntry>((label, detail, source) => {
    const id = counterRef.current++;
    const time = new Date().toLocaleTimeString([], {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setEntries((prev) =>
      [{ id, time, source, label, detail }, ...prev].slice(0, 50)
    );
  }, []);

  return [entries, addEntry];
}

function EventLog({ entries }: { entries: LogEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <View style={styles.logContainer}>
      <Text style={styles.logTitle}>Event log</Text>
      <ScrollView
        style={styles.logScroll}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        {entries.map((e) => (
          <View key={e.id} style={styles.logRow}>
            <Text style={styles.logTime}>{e.time}</Text>
            {e.source != null && (
              <Text style={styles.logSource}>{e.source}</Text>
            )}
            <Text style={styles.logLabel}>{e.label}</Text>
            {e.detail != null && (
              <Text style={styles.logDetail}>{e.detail}</Text>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [url, setUrl] = useState('http://192.168.1.48:4443');
  const [activePaths, setActivePaths] = useState<string[]>([]);

  const session = useSession(url);

  const canConnect =
    session.sessionState === 'idle' || session.sessionState === 'closed';

  useEffect(() => {
    if (canConnect) {
      setActivePaths([]);
    }
  }, [canConnect]);

  const addPlayer = (path: string) => setActivePaths((prev) => [...prev, path]);
  const removePlayer = (path: string) =>
    setActivePaths((prev) => prev.filter((p) => p !== path));

  const [log, addEntry] = useEventLog();

  useEventListener(session.emitter, 'stateChange', ({ state }) => {
    addEntry('stateChange', state);
  });

  useEventListener(session.emitter, 'broadcastAvailable', ({ path }) => {
    addEntry('broadcastAvailable', path);
  });

  useEventListener(session.emitter, 'broadcastUnavailable', ({ path }) => {
    addEntry('broadcastUnavailable', path);
  });

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
            onPress={canConnect ? () => session.connect() : session.disconnect}
          />

          <StateIndicator state={session.sessionState} />

          <EventLog entries={log} />

          {session.sessionState === 'connected' &&
            session.broadcasts.length === 0 && (
              <Text style={styles.noBroadcasts}>No broadcasts available</Text>
            )}

          {session.broadcasts.map((broadcast) =>
            activePaths.includes(broadcast.path) ? (
              <BroadcastPlayer
                key={broadcast.path}
                broadcast={broadcast}
                onRemove={() => removePlayer(broadcast.path)}
                addEntry={addEntry}
              />
            ) : (
              <View key={broadcast.path} style={styles.availableCard}>
                <Text style={styles.broadcastPath}>{broadcast.path}</Text>
                <Button
                  title="Show player"
                  onPress={() => addPlayer(broadcast.path)}
                />
              </View>
            )
          )}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ── Per-broadcast player ─────────────────────────────────────────────────────

function BroadcastPlayer({
  broadcast,
  onRemove,
  addEntry,
}: {
  broadcast: MoQBroadcastInfo;
  onRemove: () => void;
  addEntry: AddEntry;
}) {
  const player = usePlayer(broadcast.player, (p) => {
    p.play();
  });

  const handleRemove = () => {
    player.pause();
    onRemove();
  };

  const sortedVideoTracks = [...broadcast.videoTracks].sort((a, b) => {
    const px = (t: MoQVideoTrackInfo) => (t.width ?? 0) * (t.height ?? 0);
    return px(b) - px(a);
  });

  const lastSwitch = useEvent(player.emitter, 'trackSwitched');

  useEventListener(player.emitter, 'playingChange', ({ isPlaying }) => {
    addEntry('playingChange', `isPlaying=${isPlaying}`, broadcast.path);
  });

  useEventListener(player.emitter, 'trackStopped', () => {
    addEntry('trackStopped', undefined, broadcast.path);
  });

  useEventListener(
    player.emitter,
    'trackSwitched',
    ({ trackKind, trackName }) => {
      addEntry('trackSwitched', `${trackKind} → ${trackName}`, broadcast.path);
    }
  );

  return (
    <View style={styles.broadcastCard}>
      <View style={styles.broadcastHeader}>
        <Text style={styles.broadcastPath}>{broadcast.path}</Text>
        <Button title="Disconnect" onPress={handleRemove} color="#ef4444" />
      </View>

      <VideoView player={player} style={styles.video} />

      {sortedVideoTracks.length > 1 && (
        <RenditionPicker
          tracks={sortedVideoTracks}
          currentTrackName={player.currentVideoTrackName}
          onSelect={(name: string) => player.switchVideoTrack(name)}
        />
      )}

      {lastSwitch != null && (
        <Text style={styles.lastSwitch}>
          Last switch: {lastSwitch.trackKind} → {lastSwitch.trackName}
        </Text>
      )}

      <Button
        title={player.isPlaying ? 'Pause' : 'Resume'}
        onPress={player.isPlaying ? player.pause : player.play}
      />

      {player.playbackStats && <StatsPanel stats={player.playbackStats} />}
    </View>
  );
}

// ── Rendition picker ────────────────────────────────────────────────────────

function trackLabel(track: MoQVideoTrackInfo): string {
  if (track.height) return `${track.height}p`;
  return track.name;
}

function RenditionPicker({
  tracks,
  currentTrackName,
  onSelect,
}: {
  tracks: MoQVideoTrackInfo[];
  currentTrackName: string | undefined;
  onSelect: (name: string) => void;
}) {
  return (
    <View style={styles.renditionRow}>
      {tracks.map((track) => {
        const isActive = track.name === currentTrackName;
        return (
          <TouchableOpacity
            key={track.name}
            style={[styles.renditionBtn, isActive && styles.renditionBtnActive]}
            onPress={() => onSelect(track.name)}
          >
            <Text
              style={[
                styles.renditionBtnText,
                isActive && styles.renditionBtnTextActive,
              ]}
            >
              {trackLabel(track)}
            </Text>
          </TouchableOpacity>
        );
      })}
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
  availableCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
  },
  broadcastCard: {
    gap: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
  },
  broadcastHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  lastSwitch: {
    fontSize: 12,
    color: '#6b7280',
    fontFamily: 'Menlo',
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
  renditionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  renditionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#e5e7eb',
  },
  renditionBtnActive: {
    backgroundColor: '#3b82f6',
  },
  renditionBtnText: {
    fontSize: 13,
    color: '#374151',
  },
  renditionBtnTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  logContainer: {
    borderRadius: 8,
    backgroundColor: '#0f172a',
    padding: 10,
    gap: 6,
  },
  logTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  logScroll: {
    maxHeight: 180,
  },
  logRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingVertical: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1e293b',
  },
  logTime: {
    fontSize: 11,
    fontFamily: 'Menlo',
    color: '#475569',
  },
  logSource: {
    fontSize: 11,
    fontFamily: 'Menlo',
    color: '#fb923c',
  },
  logLabel: {
    fontSize: 11,
    fontFamily: 'Menlo',
    color: '#7dd3fc',
    fontWeight: '600',
  },
  logDetail: {
    fontSize: 11,
    fontFamily: 'Menlo',
    color: '#cbd5e1',
    flexShrink: 1,
  },
});
