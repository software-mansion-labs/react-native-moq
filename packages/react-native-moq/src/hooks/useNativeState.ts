import { useEffect, useState } from 'react';
import type { NativeEventEmitter } from 'react-native';

// Shared listener for native capture/broadcast modules that emit a `{ state }`
// event of either a known state string or `error:<message>`. Lifts the error
// into `lastError`, clearing it when state re-enters one of `runningStates`.
export function useNativeState<S extends string>(
  emitter: NativeEventEmitter,
  eventName: string,
  runningStates: readonly S[]
): { state: S; lastError: string | null } {
  const [state, setState] = useState<S>('idle' as S);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    const sub = emitter.addListener(eventName, (event) => {
      const next = (event as { state: string }).state as S;
      setState(next);
      if (next.startsWith('error:')) {
        setLastError(next.slice('error:'.length));
      } else if ((runningStates as readonly string[]).includes(next)) {
        setLastError(null);
      }
    });
    return () => sub.remove();
    // `runningStates` is constant per call site; captured once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emitter, eventName]);

  return { state, lastError };
}
