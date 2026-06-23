import { useEffect, useRef, useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import { useAudioChunks, type BroadcastInfo } from 'react-native-moq';

/**
 * Demonstrates `useAudioChunks`: subscribes to the broadcast's audio track and
 * shows a live tally of the encoded chunks arriving as ArrayBuffers. In a real
 * app you'd hand `chunk.data` to a decoder (react-native-audio-api) and then to
 * playback or an ML model (react-native-executorch) — here we just measure it.
 */
export function AudioChunksMeter({ broadcast }: { broadcast: BroadcastInfo }) {
  // Chunks arrive at frame rate, so accumulate in a ref and flush to state on a
  // timer rather than re-rendering on every chunk.
  const tally = useRef({ count: 0, bytes: 0, last: 0 });
  const [display, setDisplay] = useState({ count: 0, bytes: 0, last: 0 });
  const [running, setRunning] = useState(true);

  const chunks = useAudioChunks(broadcast, (chunk) => {
    tally.current.count += 1;
    tally.current.bytes += chunk.data.byteLength;
    tally.current.last = chunk.data.byteLength;
  });

  useEffect(() => {
    const id = setInterval(() => setDisplay({ ...tally.current }), 500);
    return () => clearInterval(id);
  }, []);

  const track = broadcast.audioTracks[0];

  return (
    <View style={styles.card}>
      <Text style={styles.title}>
        Audio chunks{track ? ` · ${track.codec.toUpperCase()}` : ''}
      </Text>
      <Text style={styles.stat}>received: {display.count}</Text>
      <Text style={styles.stat}>
        total: {(display.bytes / 1024).toFixed(1)} KiB
      </Text>
      <Text style={styles.stat}>last: {display.last} B</Text>
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
