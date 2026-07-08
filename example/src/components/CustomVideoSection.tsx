import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { PublishedTrackState, VideoSourceTrack } from 'react-native-moq';
import { Pill } from './ui';
import { useTheme } from '../theme';

// Matches the useVideoSource framerate set in PublishScreen.
const DEMO_FPS = 24;
// The native pattern (R=3y+2f, G=2y+f, B=y+f, all mod 256) repeats every 256
// source rows, so the frame is this tile stacked. Rendering the tile at 8-row
// resolution keeps every channel's band structure (shortest period ~85 rows)
// without aliasing into flicker.
const TILE_ROWS = 256;
const TILE_STRIPES = 32;
const ROWS_PER_STRIPE = TILE_ROWS / TILE_STRIPES;
// Repaint the preview every 2nd pushed frame; the bands drift slowly anyway.
const PREVIEW_FRAME_STEP = 2;

/**
 * Custom video → publish. Each tick fills the next pool slot with an animated CPU
 * test pattern and pushes it, exercising the useVideoSource pipeline. A real app
 * would render into the pool buffers itself (on iOS: into the IOSurface with its
 * own GPU engine, passing a fence).
 *
 * Renders a preview row (no card) so it can sit inside the Sources card: a JS
 * recreation of the native band pattern, driven by the same frame counter that
 * pushes the real frames.
 */
export function CustomVideoSection({
  videoSource,
  enabled,
  publishing,
  trackState,
  sourceHeight,
}: {
  videoSource: VideoSourceTrack;
  enabled: boolean;
  publishing: boolean;
  trackState?: PublishedTrackState;
  sourceHeight: number;
}) {
  const { colors } = useTheme();
  const frameRef = useRef(0);
  const [previewFrame, setPreviewFrame] = useState(0);
  const poolSize = videoSource.buffers.length;

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      const frame = frameRef.current++;
      // Push as soon as publishing starts: the encoder needs frames to emit its
      // first keyframe, so we can't wait for the track to become 'active'.
      if (publishing && poolSize > 0) {
        const bufferIndex = frame % poolSize;
        videoSource.fillTestPattern(bufferIndex, frame);
        // No timestampNs: native stamps the device clock at push time, keeping
        // the track aligned with the live playhead despite JS timer jitter.
        videoSource.pushFrame({ bufferIndex });
      }
      if (frame % PREVIEW_FRAME_STEP === 0) setPreviewFrame(frame);
    }, 1000 / DEMO_FPS);
    return () => clearInterval(id);
  }, [enabled, publishing, poolSize, videoSource]);

  // One tile's stripe colors, reused for every repetition of the tile.
  const f = previewFrame;
  const stripeColors = Array.from({ length: TILE_STRIPES }, (_, i) => {
    const y = i * ROWS_PER_STRIPE + ROWS_PER_STRIPE / 2;
    const r = (3 * y + 2 * f) % 256;
    const g = (2 * y + f) % 256;
    const b = (y + f) % 256;
    return `rgb(${r},${g},${b})`;
  });
  const tileCount = Math.ceil(sourceHeight / TILE_ROWS);
  // Tile height as a fraction of the frame, so partial tiles crop correctly.
  const tileHeightPct = (TILE_ROWS / sourceHeight) * 100;

  return (
    <>
      <View style={styles.previewRow}>
        <View style={styles.preview}>
          {Array.from({ length: tileCount }, (_, tile) => (
            <View
              key={tile}
              style={[styles.tile, { height: `${tileHeightPct}%` }]}
            >
              {stripeColors.map((color, i) => (
                <View
                  key={i}
                  style={[styles.stripe, { backgroundColor: color }]}
                />
              ))}
            </View>
          ))}
        </View>
        <View style={styles.previewSide}>
          <Pill
            text={poolSize > 0 ? `${poolSize}-buffer pool` : 'allocating pool…'}
          />
          <Pill text={`${DEMO_FPS} fps`} />
          {publishing && (
            <Pill tinted text={`track: ${trackState ?? 'idle'}`} />
          )}
        </View>
      </View>
      {!publishing && (
        <Text style={[styles.status, { color: colors.secondaryLabel }]}>
          Publish first to start pushing frames.
        </Text>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  previewRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  preview: {
    height: 200,
    aspectRatio: 9 / 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  tile: { width: '100%' },
  stripe: { flex: 1 },
  previewSide: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  status: { fontSize: 12 },
});
