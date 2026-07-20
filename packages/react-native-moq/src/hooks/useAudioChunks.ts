import { useRef } from 'react';
import { subscribeAudioChunks } from '../audioChunks';
import type {
  AudioChunk,
  AudioChunkFormat,
  BroadcastInfo,
  ChunkSubscription,
} from '../types';
import { useChunkSubscription } from './useChunkSubscription';

export interface UseAudioChunksOptions {
  /**
   * Audio track to listen to. Defaults to the broadcast's first audio track.
   */
  trackName?: string;
  /**
   * Start receiving as soon as the hook mounts. Defaults to true. Pass false to
   * defer until you call `.start()` on the returned handle.
   */
  autoStart?: boolean;
  /**
   * How to deliver audio. Defaults to `'encoded'` (one Opus/AAC object per
   * chunk). Pass `'pcm-f32'` / `'pcm-i16'` for decoded PCM.
   */
  format?: AudioChunkFormat;
}

/**
 * Thin single-track convenience over `subscribeAudioChunks`. Receives each audio
 * chunk as an `ArrayBuffer` and tears the subscription down on unmount. Chunks
 * are encoded Opus/AAC objects by default; pass `format: 'pcm-f32' | 'pcm-i16'`
 * for decoded PCM.
 *
 * For a dynamic set of tracks/broadcasts, call `subscribeAudioChunks` inside
 * your own effect instead — it's the same core this hook wraps, with no
 * rules-of-hooks constraints.
 */
export function useAudioChunks(
  broadcast: BroadcastInfo,
  onChunk: (chunk: AudioChunk) => void,
  options: UseAudioChunksOptions = {}
): ChunkSubscription {
  const { sessionId, path } = broadcast;
  const trackName = options.trackName ?? broadcast.audioTracks[0]?.name ?? '';
  const autoStart = options.autoStart !== false;
  const format = options.format ?? 'encoded';

  // Keep the latest callback without re-creating the subscription each render.
  const onChunkRef = useRef(onChunk);
  onChunkRef.current = onChunk;

  return useChunkSubscription(
    () =>
      subscribeAudioChunks(
        broadcast,
        trackName,
        (chunk) => onChunkRef.current(chunk),
        { autoStart: false, format }
      ),
    [sessionId, path, trackName, format],
    autoStart
  );
}
