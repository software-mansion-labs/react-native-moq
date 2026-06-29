import { useEffect, useRef, useState } from 'react';
import { Button, Platform, StyleSheet, Text, View } from 'react-native';
import {
  useAudioChunks,
  type AudioChunkFormat,
  type BroadcastInfo,
} from 'react-native-moq';

// Decoded PCM is iOS-only for now; Android falls back to encoded objects.
const DEFAULT_FORMAT: AudioChunkFormat =
  Platform.OS === 'ios' ? 'pcm-f32' : 'encoded';

/**
 * Demonstrates `useAudioChunks`: subscribes to the broadcast's audio track and
 * shows a live tally of the chunks arriving as ArrayBuffers. On iOS it requests
 * decoded `pcm-f32` chunks (one tap on the title toggles back to the raw
 * encoded objects); Android always gets encoded. In a real app you'd feed
 * `chunk.data` straight to playback / an ML model when it's PCM, or to a decoder
 * (react-native-audio-api) first when it's encoded.
 */
export function AudioChunksMeter({ broadcast }: { broadcast: BroadcastInfo }) {
  const [format, setFormat] = useState<AudioChunkFormat>(DEFAULT_FORMAT);
  // Chunks arrive at frame rate, so accumulate in a ref and flush to state on a
  // timer rather than re-rendering on every chunk.
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

  // Reset the tally whenever the delivery format changes so the numbers reflect
  // the current stream rather than a mix of encoded + PCM.
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
    <View style={styles.card}>
      <Text
        style={styles.title}
        onPress={
          canToggle
            ? () => setFormat((f) => (f === 'encoded' ? 'pcm-f32' : 'encoded'))
            : undefined
        }
      >
        Audio chunks · {isPcm ? 'PCM f32' : (track?.codec.toUpperCase() ?? '—')}
        {canToggle ? ' (tap to switch)' : ''}
      </Text>
      <Text style={styles.stat}>received: {display.count}</Text>
      <Text style={styles.stat}>
        total: {(display.bytes / 1024).toFixed(1)} KiB
      </Text>
      <Text style={styles.stat}>last: {display.last} B</Text>
      {isPcm && (
        <Text style={styles.stat}>
          frames: {display.frames} @ {display.rate} Hz
        </Text>
      )}
      <Button
        title={running ? 'Stop chunks' : 'Start chunks'}
        onPress={() => {
          if (running) chunks.stop();
          else chunks.start();
          setRunning((r) => !r);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  stat: {
    fontSize: 13,
    color: '#374151',
    fontVariant: ['tabular-nums'],
  },
});
