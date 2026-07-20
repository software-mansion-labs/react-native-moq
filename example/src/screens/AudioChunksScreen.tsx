import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  useAudioChunks,
  useBroadcasts,
  useSession,
  type AudioChunkFormat,
  type BroadcastInfo,
  type Session,
} from 'react-native-moq';
import { BroadcastRow } from '../components/BroadcastRow';
import { ConnectionCard, sessionFlags } from '../components/ConnectionCard';
import { WaveformMeter } from '../components/WaveformMeter';
import { TranscriptionPanel } from '../components/TranscriptionPanel';
import { useAudioApiPlayback } from '../hooks/useAudioApiPlayback';
import { useChunkTally } from '../hooks/useChunkTally';
import {
  Button,
  Card,
  Hint,
  IconButton,
  ScreenScroll,
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
  const session = useSession(url);
  const { canConnect, isConnected } = sessionFlags(session);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected) setSelectedPath(null);
  }, [isConnected]);

  return (
    <ScreenScroll>
      <TwoColumn
        left={
          <>
            <Hint>
              Subscribe to a broadcast&apos;s audio track as raw chunks with
              useAudioChunks, then play decoded PCM through
              react-native-audio-api.
            </Hint>

            <ConnectionCard
              session={session}
              url={url}
              setUrl={setUrl}
              urlEditable={canConnect}
            />
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
    </ScreenScroll>
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
    return <Hint tone="tertiary">No broadcasts available yet…</Hint>;
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
          <BroadcastRow
            key={b.path}
            path={b.path}
            subtitle={
              audio
                ? `${audio.codec.toUpperCase()} · ${audio.sampleRate} Hz`
                : 'no audio track'
            }
            actions={
              <IconButton
                icon="graphic-eq"
                variant="filled"
                accessibilityLabel={`Open ${b.path}`}
                onPress={() => onSelect(b.path)}
                disabled={!audio}
              />
            }
          />
        );
      })}
    </View>
  );
}

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
  const [format, setFormat] = useState<AudioChunkFormat>('pcm-f32');
  const isPcm = format !== 'encoded';

  const playback = useAudioApiPlayback();
  const { stats, onChunk } = useChunkTally(format);

  // Per-chunk levels land in a ref (chunks arrive at frame rate); the meter
  // repaints on its own timer.
  const levelsRef = useRef<number[]>(new Array(BAR_COUNT).fill(0));

  // Reset on format change so the meter reflects only the current stream.
  useEffect(() => {
    levelsRef.current = new Array(BAR_COUNT).fill(0);
  }, [format]);

  useAudioChunks(
    broadcast,
    (chunk) => {
      onChunk(chunk);

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
            <Hint tone="tertiary">
              Chunks are decoding live — press play to hear them and animate the
              meter.
            </Hint>
          )}
        </>
      ) : (
        <Hint tone="tertiary">
          Encoded objects are delivered exactly as published — decode them (e.g.
          with a codec) before playback. Inspect their stats below.
        </Hint>
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
  list: { gap: 8 },
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
