import { useEffect, useMemo, useRef } from 'react';
import { subscribeDataMessages } from '../dataMessages';
import type { DataMessage } from '../dataMessages';
import type { BroadcastInfo, ChunkSubscription } from '../types';

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

  // Key on primitives: `broadcast` may be a fresh object each render.
  const subscription = useMemo(
    () =>
      subscribeDataMessages(
        broadcast,
        trackName,
        (message) => onMessageRef.current(message),
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
