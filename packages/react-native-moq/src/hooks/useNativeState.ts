import { useEffect, useState } from 'react';
import type { NativeEventEmitter } from 'react-native';

// Shared listener for the native capture / broadcast modules. They all emit a
// `{ state }` event whose value is either a known state string or
// `error:<message>`. This tracks the latest state and lifts the error message
// into `lastError`, clearing it again whenever capture re-enters one of the
// `runningStates` (e.g. 'active' / 'broadcasting'). Used by useCamera,
// useMicrophone, useMultiCamera and useScreenBroadcast.
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
    // `runningStates` is constant per call site; the listener captures it once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emitter, eventName]);

  return { state, lastError };
}
