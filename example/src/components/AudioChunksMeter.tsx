import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import {
  useAudioChunks,
  type AudioChunkFormat,
  type BroadcastInfo,
} from 'react-native-moq';
import { Button } from './ui';
import { useTheme } from '../theme';

// Decoded PCM is iOS-only for now; Android falls back to encoded objects.
const DEFAULT_FORMAT: AudioChunkFormat =
  Platform.OS === 'ios' ? 'pcm-f32' : 'encoded';

/**
 * Demonstrates `useAudioChunks`: subscribes to the audio track and shows a live
 * tally of arriving chunks. iOS requests decoded `pcm-f32` (tap the title to
 * toggle to encoded); Android always gets encoded.
 */
export function AudioChunksMeter({ broadcast }: { broadcast: BroadcastInfo }) {
  const { colors, radius } = useTheme();
  const [format, setFormat] = useState<AudioChunkFormat>(DEFAULT_FORMAT);
  // Chunks arrive at frame rate; accumulate in a ref, flush to state on a timer.
  const tally = useRef({ count: 0, bytes: 0, last: 0, frames: 0, rate: 0 });
  const [display, setDisplay] = useState({
    count: 0,
    bytes: 0,
    last: 0,
    frames: 0,
    rate: 0,
  });
  const [running, setRunning] = useState(true);

  const chunks = useAudioChunks(
    broadcast,
    (chunk) => {
      tally.current.count += 1;
      tally.current.bytes += chunk.data.byteLength;
      tally.current.last = chunk.data.byteLength;
      tally.current.frames = chunk.frameCount ?? 0;
      tally.current.rate = chunk.sampleRate;
    },
    { format }
  );

  // Reset the tally on format change so numbers reflect only the current stream.
  useEffect(() => {
    tally.current = { count: 0, bytes: 0, last: 0, frames: 0, rate: 0 };
  }, [format]);

  useEffect(() => {
    const id = setInterval(() => setDisplay({ ...tally.current }), 500);
    return () => clearInterval(id);
  }, []);

  const track = broadcast.audioTracks[0];
  const isPcm = format !== 'encoded';
  const canToggle = Platform.OS === 'ios';

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.fill, borderRadius: radius.control },
      ]}
    >
      <Text
        style={[styles.title, { color: colors.label }]}
        onPress={
          canToggle
            ? () => setFormat((f) => (f === 'encoded' ? 'pcm-f32' : 'encoded'))
            : undefined
        }
      >
        Audio chunks · {isPcm ? 'PCM f32' : (track?.codec.toUpperCase() ?? '—')}
        {canToggle ? ' (tap to switch)' : ''}
      </Text>
      <Stat text={`received: ${display.count}`} />
      <Stat text={`total: ${(display.bytes / 1024).toFixed(1)} KiB`} />
      <Stat text={`last: ${display.last} B`} />
      {isPcm && (
        <Stat text={`frames: ${display.frames} @ ${display.rate} Hz`} />
      )}
      <Button
        title={running ? 'Stop chunks' : 'Start chunks'}
        icon={running ? 'stop' : 'play-arrow'}
        variant="tonal"
        onPress={() => {
          if (running) chunks.stop();
          else chunks.start();
          setRunning((r) => !r);
        }}
      />
    </View>
  );
}

function Stat({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.stat, { color: colors.secondaryLabel }]}>{text}</Text>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 6,
    padding: 12,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  stat: {
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
});
