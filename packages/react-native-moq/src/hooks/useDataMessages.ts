import { useRef } from 'react';
import { subscribeDataMessages } from '../dataMessages';
import type { DataMessage } from '../dataMessages';
import type { BroadcastInfo, ChunkSubscription } from '../types';
import { useChunkSubscription } from './useChunkSubscription';

export interface UseDataMessagesOptions {
  /**
   * Data track to listen to. Defaults to `'data'`, the `useDataTrack` /
   * `createDataTrack` default. Data tracks don't appear in the catalog, so the
   * name must be agreed upon out of band.
   */
  trackName?: string;
  /**
   * Start receiving as soon as the hook mounts. Defaults to true. Pass false to
   * defer until you call `.start()` on the returned handle.
   */
  autoStart?: boolean;
}

/**
 * Thin single-track convenience over `subscribeDataMessages` — the receive
 * counterpart of `useDataTrack`. Receives each payload sent with
 * `DataTrack.send()` and tears the subscription down on unmount.
 */
export function useDataMessages(
  broadcast: BroadcastInfo,
  onMessage: (message: DataMessage) => void,
  options: UseDataMessagesOptions = {}
): ChunkSubscription {
  const { sessionId, path } = broadcast;
  const trackName = options.trackName ?? 'data';
  const autoStart = options.autoStart !== false;

  // Keep the latest callback without re-creating the subscription each render.
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  return useChunkSubscription(
    () =>
      subscribeDataMessages(
        broadcast,
        trackName,
        (message) => onMessageRef.current(message),
        { autoStart: false }
      ),
    [sessionId, path, trackName],
    autoStart
  );
}
