import type { NativeEventEmitter } from 'react-native';

// Shared listener for native capture/broadcast modules that emit a `{ state }`
// event of either a known state string or `error:<message>`. Lifts the error
// into `lastError`, clearing it when state re-enters one of `runningStates`.
// Returns a detach function.
export function watchNativeState<S extends string>(
  emitter: NativeEventEmitter,
  eventName: string,
  runningStates: readonly S[],
  onChange: (state: S, lastError: string | null) => void
): () => void {
  let lastError: string | null = null;
  const sub = emitter.addListener(eventName, (event) => {
    const next = (event as { state: string }).state as S;
    if (next.startsWith('error:')) {
      lastError = next.slice('error:'.length);
    } else if ((runningStates as readonly string[]).includes(next)) {
      lastError = null;
    }
    onChange(next, lastError);
  });
  return () => sub.remove();
}
