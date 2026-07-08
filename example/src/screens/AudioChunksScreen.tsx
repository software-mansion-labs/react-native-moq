import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
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
import {
  Button,
  Card,
  IconButton,
  Input,
  SectionHeader,
  Segmented,
  TwoColumn,
} from '../components/ui';
import { useTheme } from '../theme';

const BAR_COUNT = 56;

/**
 * Showcase tab for `useAudioChunks`. Pick a broadcast and watch its audio track
 * arrive as raw chunks: `encoded` objects can only be inspected (decoding needs
 * a codec we don't ship in JS); `pcm-f32` chunks are fed into
 * react-native-audio-api for live playback + a level meter.
 */
export function AudioChunksScreen({
  url,
  setUrl,
}: {
  url: string;
  setUrl: (url: string) => void;
}) {
  const { colors } = useTheme();
  const session = useSession(url);
  const canConnect = session.state === 'idle' || session.state === 'closed';
  const isConnected = session.state === 'connected';

  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected) setSelectedPath(null);
  }, [isConnected]);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="automatic"
    >
      <TwoColumn
        left={
          <>
            <Text style={[styles.intro, { color: colors.secondaryLabel }]}>
              Subscribe to a broadcast&apos;s audio track as raw chunks with
              useAudioChunks, then play decoded PCM through
              react-native-audio-api.
            </Text>

            <Card>
              <SectionHeader title="Connection" />
              <Input
                value={url}
                onChangeText={setUrl}
                placeholder="Relay URL"
                autoCapitalize="none"
                autoCorrect={false}
                editable={canConnect}
              />
              <View style={styles.connectRow}>
                <StateIndicator state={session.state} />
                <Button
                  title={canConnect ? 'Connect' : 'Disconnect'}
                  icon={canConnect ? 'link' : 'link-off'}
                  variant={canConnect ? 'filled' : 'tonal'}
                  destructive={!canConnect}
                  onPress={
                    canConnect ? () => session.connect() : session.disconnect
                  }
                />
              </View>
            </Card>
          </>
        }
        right={
          isConnected && (
            <AudioBroadcasts
              session={session}
              selectedPath={selectedPath}
              onSelect={setSelectedPath}
            />
          )
        }
      />
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
  const { colors } = useTheme();
  const broadcasts = useBroadcasts(session, '');

  const selected = broadcasts.find((b) => b.path === selectedPath);

  if (broadcasts.length === 0) {
    return (
      <Text style={[styles.muted, { color: colors.tertiaryLabel }]}>
        No broadcasts available yet…
      </Text>
    );
  }

  if (selected) {
    return (
      <View style={styles.demoWrap}>
        <View style={styles.demoHeader}>
          <IconButton
            icon="arrow-back"
            size={32}
            accessibilityLabel="Back to broadcast list"
            onPress={() => onSelect(null)}
          />
          <Text
            style={[styles.demoPath, { color: colors.label }]}
            numberOfLines={1}
          >
            {selected.path}
          </Text>
        </View>
        <AudioChunksDemo broadcast={selected} />
      </View>
    );
  }

  return (
    <View style={styles.list}>
      <SectionHeader title="Pick a broadcast" />
      {broadcasts.map((b) => {
        const audio = b.audioTracks[0];
        return (
          <Card key={b.path} style={styles.pickCard}>
            <View style={styles.pickInfo}>
              <Text
                style={[styles.pickPath, { color: colors.label }]}
                numberOfLines={1}
              >
                {b.path}
              </Text>
              <Text style={[styles.muted, { color: colors.secondaryLabel }]}>
                {audio
                  ? `${audio.codec.toUpperCase()} · ${audio.sampleRate} Hz`
                  : 'no audio track'}
              </Text>
            </View>
            <IconButton
              icon="graphic-eq"
              variant="filled"
              accessibilityLabel={`Open ${b.path}`}
              onPress={() => onSelect(b.path)}
              disabled={!audio}
            />
          </Card>
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

// Mode switch between the playback/meter demo and on-device Whisper transcription.
function AudioChunksDemo({ broadcast }: { broadcast: BroadcastInfo }) {
  const [mode, setMode] = useState<DemoMode>('playback');

  return (
    <View style={styles.modeWrap}>
      <Segmented
        value={mode}
        options={[
          { value: 'playback', label: 'Playback' },
          { value: 'transcribe', label: 'Transcribe' },
        ]}
        onChange={setMode}
      />
      {mode === 'playback' ? (
        <PlaybackPanel broadcast={broadcast} />
      ) : (
        <TranscriptionPanel broadcast={broadcast} />
      )}
    </View>
  );
}

function PlaybackPanel({ broadcast }: { broadcast: BroadcastInfo }) {
  const { colors } = useTheme();
  const [format, setFormat] = useState<AudioChunkFormat>('pcm-f32');
  const isPcm = format !== 'encoded';

  const playback = useAudioApiPlayback();

  // Per-chunk data lands in refs (chunks arrive at frame rate); a timer flushes
  // a snapshot to state.
  const levelsRef = useRef<number[]>(new Array(BAR_COUNT).fill(0));
  const tally = useRef({ count: 0, bytes: 0, last: 0, rate: 0 });
  const windowRef = useRef({ bytes: 0, t0: Date.now() });
  const [stats, setStats] = useState<ChunkStats>(EMPTY_STATS);

  // Reset on format change so numbers/meter reflect only the current stream.
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
    <Card>
      <Segmented
        value={format}
        options={[
          { value: 'pcm-f32' as AudioChunkFormat, label: 'Decoded PCM' },
          { value: 'encoded' as AudioChunkFormat, label: 'Encoded' },
        ]}
        onChange={(next) => {
          if (next === 'encoded') playback.stop();
          setFormat(next);
        }}
      />

      {isPcm ? (
        <>
          <WaveformMeter levelsRef={levelsRef} active={playback.isPlaying} />
          <Button
            title={playback.isPlaying ? 'Stop playback' : 'Play audio'}
            icon={playback.isPlaying ? 'stop' : 'play-arrow'}
            variant={playback.isPlaying ? 'tonal' : 'filled'}
            onPress={playback.isPlaying ? playback.stop : playback.start}
          />
          {!playback.isPlaying && (
            <Text style={[styles.muted, { color: colors.tertiaryLabel }]}>
              Chunks are decoding live — press play to hear them and animate the
              meter.
            </Text>
          )}
        </>
      ) : (
        <Text style={[styles.muted, { color: colors.tertiaryLabel }]}>
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
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, { color: colors.label }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.tertiaryLabel }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
  },
  intro: { fontSize: 13, lineHeight: 18 },
  connectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  muted: { fontSize: 13, lineHeight: 18 },
  list: { gap: 8 },
  pickCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  pickInfo: { flex: 1, gap: 2 },
  pickPath: { fontSize: 14, fontWeight: '600' },
  demoWrap: { gap: 12 },
  demoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  demoPath: { flex: 1, fontSize: 14, fontWeight: '600' },
  modeWrap: { gap: 12 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statCell: { width: '33.33%', paddingVertical: 6 },
  statValue: {
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  statLabel: { fontSize: 11, textTransform: 'uppercase' },
});
