import { useEffect, useMemo } from 'react';
import type { ChunkSubscription } from '../types';

// Shared lifecycle for the single-track subscription hooks (useAudioChunks,
// useDataMessages): memoize the subscription on primitive keys — the broadcast
// object may be fresh each render — and start/stop it with the component.
export function useChunkSubscription(
  create: () => ChunkSubscription,
  keys: readonly unknown[],
  autoStart: boolean
): ChunkSubscription {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const subscription = useMemo(create, keys);

  useEffect(() => {
    if (autoStart) subscription.start();
    return () => subscription.stop();
  }, [subscription, autoStart]);

  return subscription;
}
