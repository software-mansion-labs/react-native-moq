import { useEffect, useState } from 'react';
import type { NativeEventEmitter } from 'react-native';
import { watchNativeState } from '../nativeState';

// React mirror of watchNativeState — see src/nativeState.ts.
export function useNativeState<S extends string>(
  emitter: NativeEventEmitter,
  eventName: string,
  runningStates: readonly S[]
): { state: S; lastError: string | null } {
  const [state, setState] = useState<S>('idle' as S);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    return watchNativeState<S>(
      emitter,
      eventName,
      runningStates,
      (next, err) => {
        setState(next);
        setLastError(err);
      }
    );
    // `runningStates` is constant per call site; captured once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emitter, eventName]);

  return { state, lastError };
}
