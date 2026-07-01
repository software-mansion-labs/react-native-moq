import { useEffect, useRef, useState } from 'react';
import {
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  useAudioChunks,
  useBroadcasts,
  useSession,
  type AudioChunkFormat,
  type BroadcastInfo,
  type Session,
} from 'react-native-moq';
import { StateIndicator } from '../components/StateIndicator';
import { WaveformMeter } from '../components/WaveformMeter';
import { TranscriptionPanel } from '../components/TranscriptionPanel';
import { useAudioApiPlayback } from '../hooks/useAudioApiPlayback';

const BAR_COUNT = 56;

/**
 * Showcase tab for `useAudioChunks`. Connect to a relay, pick a broadcast, and
 * watch its audio track arrive as raw chunks:
 *  - `encoded` (cross-platform): we can only *inspect* the Opus/AAC objects —
 *    codec, chunk rate, bitrate — since decoding them needs a codec we don't ship
 *    in JS.
 *  - `pcm-f32`: the chunks are already decoded PCM, so we feed them straight into
 *    react-native-audio-api for live playback and draw a level meter from the
 *    samples.
 */
export function AudioChunksScreen({
  url,
  setUrl,
}: {
  url: string;
  setUrl: (url: string) => void;
}) {
  const session = useSession(url);
  const canConnect = session.state === 'idle' || session.state === 'closed';
  const isConnected = session.state === 'connected';

  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected) setSelectedPath(null);
  }, [isConnected]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.intro}>
        Subscribe to a broadcast&apos;s audio track as raw chunks with{' '}
        useAudioChunks, then play decoded PCM through react-native-audio-api.
      </Text>

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

      <StateIndicator state={session.state} />

      {isConnected && (
        <AudioBroadcasts
          session={session}
          selectedPath={selectedPath}
          onSelect={setSelectedPath}
        />
      )}
    </ScrollView>
  );
}

function AudioBroadcasts({
  session,
  selectedPath,
  onSelect,
}: {
  session: Session;
  selectedPath: string | null;
  onSelect: (path: string | null) => void;
}) {
  const broadcasts = useBroadcasts(session, '');

  const selected = broadcasts.find((b) => b.path === selectedPath);

  if (broadcasts.length === 0) {
    return <Text style={styles.muted}>No broadcasts available yet…</Text>;
  }

  if (selected) {
    return (
      <View style={styles.demoWrap}>
        <View style={styles.demoHeader}>
          <Text style={styles.demoPath}>{selected.path}</Text>
          <Button title="Back" onPress={() => onSelect(null)} color="#6b7280" />
        </View>
        <AudioChunksDemo broadcast={selected} />
      </View>
    );
  }

  return (
    <View style={styles.list}>
      <Text style={styles.muted}>Pick a broadcast:</Text>
      {broadcasts.map((b) => {
        const audio = b.audioTracks[0];
        return (
          <View key={b.path} style={styles.pickCard}>
            <View style={styles.pickInfo}>
              <Text style={styles.pickPath}>{b.path}</Text>
              <Text style={styles.muted}>
                {audio
                  ? `${audio.codec.toUpperCase()} · ${audio.sampleRate} Hz`
                  : 'no audio track'}
              </Text>
            </View>
            <Button
              title="Open"
              onPress={() => onSelect(b.path)}
              disabled={!audio}
            />
          </View>
        );
      })}
    </View>
  );
}

interface ChunkStats {
  count: number;
  bytes: number;
  last: number;
  rate: number;
  kbps: number;
}

const EMPTY_STATS: ChunkStats = {
  count: 0,
  bytes: 0,
  last: 0,
  rate: 0,
  kbps: 0,
};

type DemoMode = 'playback' | 'transcribe';

// Decoded-PCM chunks drive the playback / meter demo, and can also be run
// through on-device Whisper — the mode switch toggles between the two. Both run
// on iOS and Android (react-native-executorch ships native libs for both).
function AudioChunksDemo({ broadcast }: { broadcast: BroadcastInfo }) {
  const [mode, setMode] = useState<DemoMode>('playback');

  return (
    <View style={styles.modeWrap}>
      <View style={styles.formatRow}>
        <FormatTab
          label="Playback"
          active={mode === 'playback'}
          onPress={() => setMode('playback')}
        />
        <FormatTab
          label="Transcribe"
          active={mode === 'transcribe'}
          onPress={() => setMode('transcribe')}
        />
      </View>
      {mode === 'playback' ? (
        <PlaybackPanel broadcast={broadcast} />
      ) : (
        <TranscriptionPanel broadcast={broadcast} />
      )}
    </View>
  );
}

function PlaybackPanel({ broadcast }: { broadcast: BroadcastInfo }) {
  const [format, setFormat] = useState<AudioChunkFormat>('pcm-f32');
  const isPcm = format !== 'encoded';

  const playback = useAudioApiPlayback();

  // Per-chunk data lands in refs (chunks arrive at frame rate); a timer flushes
  // a snapshot to state for display.
  const levelsRef = useRef<number[]>(new Array(BAR_COUNT).fill(0));
  const tally = useRef({ count: 0, bytes: 0, last: 0, rate: 0 });
  const windowRef = useRef({ bytes: 0, t0: Date.now() });
  const [stats, setStats] = useState<ChunkStats>(EMPTY_STATS);

  // Reset everything when the delivery format changes so numbers/meter reflect
  // only the current stream.
  useEffect(() => {
    tally.current = { count: 0, bytes: 0, last: 0, rate: 0 };
    levelsRef.current = new Array(BAR_COUNT).fill(0);
    windowRef.current = { bytes: 0, t0: Date.now() };
    setStats(EMPTY_STATS);
  }, [format]);

  useAudioChunks(
    broadcast,
    (chunk) => {
      tally.current.count += 1;
      tally.current.bytes += chunk.data.byteLength;
      tally.current.last = chunk.data.byteLength;
      tally.current.rate = chunk.sampleRate;
      windowRef.current.bytes += chunk.data.byteLength;

      if (chunk.format !== 'encoded') {
        // Peak amplitude over a subsampling of the PCM → one meter bar.
        const samples = new Float32Array(chunk.data);
        const step = Math.max(1, Math.floor(samples.length / 256));
        let peak = 0;
        for (let i = 0; i < samples.length; i += step) {
          const a = Math.abs(samples[i] ?? 0);
          if (a > peak) peak = a;
        }
        const arr = levelsRef.current;
        arr.push(peak);
        if (arr.length > BAR_COUNT) arr.shift();

        playback.enqueue(chunk);
      }
    },
    { format }
  );

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const w = windowRef.current;
      const secs = (now - w.t0) / 1000;
      const kbps = secs > 0 ? (w.bytes * 8) / secs / 1000 : 0;
      windowRef.current = { bytes: 0, t0: now };
      setStats({
        count: tally.current.count,
        bytes: tally.current.bytes,
        last: tally.current.last,
        rate: tally.current.rate,
        kbps,
      });
    }, 500);
    return () => clearInterval(id);
  }, []);

  const track = broadcast.audioTracks[0];

  return (
    <View style={styles.demo}>
      <View style={styles.formatRow}>
        <FormatTab
          label="Decoded PCM"
          active={isPcm}
          onPress={() => setFormat('pcm-f32')}
        />
        <FormatTab
          label="Encoded"
          active={!isPcm}
          onPress={() => {
            playback.stop();
            setFormat('encoded');
          }}
        />
      </View>

      {isPcm ? (
        <>
          <WaveformMeter levelsRef={levelsRef} active={playback.isPlaying} />
          <Button
            title={playback.isPlaying ? 'Stop playback' : 'Play audio'}
            onPress={playback.isPlaying ? playback.stop : playback.start}
          />
          {!playback.isPlaying && (
            <Text style={styles.muted}>
              Chunks are decoding live — press play to hear them and animate the
              meter.
            </Text>
          )}
        </>
      ) : (
        <Text style={styles.muted}>
          Encoded objects are delivered exactly as published — decode them (e.g.
          with a codec) before playback. Inspect their stats below.
        </Text>
      )}

      <View style={styles.statsGrid}>
        <Stat label="codec" value={track?.codec.toUpperCase() ?? '—'} />
        <Stat label="format" value={isPcm ? 'PCM f32' : 'encoded object'} />
        <Stat label="chunks" value={String(stats.count)} />
        <Stat label="bitrate" value={`${stats.kbps.toFixed(0)} kbps`} />
        <Stat label="last chunk" value={`${stats.last} B`} />
        <Stat
          label="sample rate"
          value={stats.rate ? `${stats.rate} Hz` : '—'}
        />
      </View>
    </View>
  );
}

function FormatTab({
  label,
  active,
  disabled,
  onPress,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Text
      onPress={disabled ? undefined : onPress}
      style={[
        styles.formatTab,
        active && styles.formatTabActive,
        disabled && styles.formatTabDisabled,
      ]}
    >
      {label}
    </Text>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 16, gap: 12 },
  intro: { fontSize: 13, color: '#6b7280', lineHeight: 18 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  muted: { fontSize: 13, color: '#9ca3af', lineHeight: 18 },
  list: { gap: 8 },
  pickCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  pickInfo: { flex: 1, gap: 2 },
  pickPath: { fontSize: 13, fontWeight: '600', color: '#374151' },
  demoWrap: { gap: 12 },
  demoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  demoPath: { flex: 1, fontSize: 13, fontWeight: '600', color: '#374151' },
  modeWrap: { gap: 12 },
  demo: {
    gap: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
  },
  formatRow: { flexDirection: 'row', gap: 8 },
  formatTab: {
    flex: 1,
    textAlign: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '600',
    overflow: 'hidden',
  },
  formatTabActive: { backgroundColor: '#2563eb', color: '#fff' },
  formatTabDisabled: { opacity: 0.4 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statCell: { width: '33.33%', paddingVertical: 6 },
  statValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    fontVariant: ['tabular-nums'],
  },
  statLabel: { fontSize: 11, color: '#9ca3af', textTransform: 'uppercase' },
});
