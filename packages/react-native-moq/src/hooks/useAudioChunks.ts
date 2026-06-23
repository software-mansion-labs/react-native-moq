import { useEffect, useMemo, useRef } from 'react';
import { subscribeAudioChunks } from '../audioChunks';
import type { AudioChunk, BroadcastInfo, ChunkSubscription } from '../types';

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
}

/**
 * Thin single-track convenience over `subscribeAudioChunks`. Receives each
 * encoded audio chunk (one Opus/AAC object) as an `ArrayBuffer` and tears the
 * subscription down on unmount.
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

  // Keep the latest callback without re-creating the subscription each render.
  const onChunkRef = useRef(onChunk);
  onChunkRef.current = onChunk;

  // Re-create only when the identity of the target track changes — `broadcast`
  // may be a fresh object every render, but codec/sampleRate are stable per
  // (path, track), so keying on primitives is enough (mirrors useAudioPlayer).
  const subscription = useMemo(
    () =>
      subscribeAudioChunks(
        broadcast,
        trackName,
        (chunk) => onChunkRef.current(chunk),
        { autoStart: false }
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId, path, trackName]
  );

  useEffect(() => {
    if (autoStart) subscription.start();
    return () => subscription.stop();
  }, [subscription, autoStart]);

  return subscription;
}
