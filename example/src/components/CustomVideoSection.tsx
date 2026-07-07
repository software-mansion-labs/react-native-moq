import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { PublishedTrackState, VideoSourceTrack } from 'react-native-moq';

// Matches the useVideoSource framerate set in PublishScreen.
const DEMO_FPS = 24;

/**
 * Custom video → publish. Each tick fills the next pool slot with an animated CPU
 * test pattern and pushes it, exercising the zero-copy useVideoSource pipeline. A
 * real app would render into the IOSurface with its own GPU engine and pass a fence.
 */
export function CustomVideoSection({
  videoSource,
  enabled,
  publishing,
  trackState,
}: {
  videoSource: VideoSourceTrack;
  enabled: boolean;
  publishing: boolean;
  trackState?: PublishedTrackState;
}) {
  const frameRef = useRef(0);
  const poolSize = videoSource.buffers.length;

  // Push as soon as publishing starts: the encoder needs frames to emit its first
  // keyframe, so we can't wait for the track to become 'active' first.
  const running = enabled && publishing && poolSize > 0;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const frame = frameRef.current++;
      const bufferIndex = frame % poolSize;
      videoSource.fillTestPattern(bufferIndex, frame);
      // No timestampNs: native stamps the device clock at push time, keeping the
      // track aligned with the live playhead despite JS timer jitter.
      videoSource.pushFrame({ bufferIndex });
    }, 1000 / DEMO_FPS);
    return () => clearInterval(id);
  }, [running, poolSize, videoSource]);

  return (
    <View style={styles.card}>
      <Text style={styles.sectionLabel}>CUSTOM VIDEO (TEST PATTERN)</Text>
      <Text style={styles.status}>
        {poolSize === 0
          ? 'Allocating buffer pool…'
          : `${poolSize}-buffer pool · ${DEMO_FPS} fps`}
      </Text>
      {publishing ? (
        <Text style={styles.status}>Track: {trackState ?? 'idle'}</Text>
      ) : (
        <Text style={styles.status}>
          Publish first to start pushing frames.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
  },
  status: { fontSize: 12, color: '#6b7280' },
});
