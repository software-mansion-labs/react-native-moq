import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioChunk, AudioChunkFormat } from 'react-native-moq';

export interface ChunkStats {
  count: number;
  bytes: number;
  last: number;
  frames: number;
  rate: number;
  kbps: number;
}

const EMPTY_STATS: ChunkStats = {
  count: 0,
  bytes: 0,
  last: 0,
  frames: 0,
  rate: 0,
  kbps: 0,
};

/**
 * Running tally of incoming audio chunks. Chunks arrive at frame rate, so
 * `onChunk` accumulates in a ref and a timer flushes a snapshot (plus a
 * windowed bitrate) to state. Resets when `format` changes so numbers reflect
 * only the current stream.
 */
export function useChunkTally(format: AudioChunkFormat) {
  const tally = useRef({ count: 0, bytes: 0, last: 0, frames: 0, rate: 0 });
  const windowRef = useRef({ bytes: 0, t0: Date.now() });
  const [stats, setStats] = useState<ChunkStats>(EMPTY_STATS);

  useEffect(() => {
    tally.current = { count: 0, bytes: 0, last: 0, frames: 0, rate: 0 };
    windowRef.current = { bytes: 0, t0: Date.now() };
    setStats(EMPTY_STATS);
  }, [format]);

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const w = windowRef.current;
      const secs = (now - w.t0) / 1000;
      const kbps = secs > 0 ? (w.bytes * 8) / secs / 1000 : 0;
      windowRef.current = { bytes: 0, t0: now };
      setStats({ ...tally.current, kbps });
    }, 500);
    return () => clearInterval(id);
  }, []);

  const onChunk = useCallback((chunk: AudioChunk) => {
    tally.current.count += 1;
    tally.current.bytes += chunk.data.byteLength;
    tally.current.last = chunk.data.byteLength;
    tally.current.frames = chunk.frameCount ?? 0;
    tally.current.rate = chunk.sampleRate;
    windowRef.current.bytes += chunk.data.byteLength;
  }, []);

  return { stats, onChunk };
}
