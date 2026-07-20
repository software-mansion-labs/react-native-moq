import type { NativeEventEmitter } from 'react-native';
import { EventEmitter, type EventSubscription } from './EventEmitter';

// Event map shared by every native-state-backed handle (camera, microphone,
// multi-camera, screen broadcast).
export type StateChangeEvents<S extends string> = {
  stateChange: (event: { state: S; lastError: string | null }) => void;
};

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

// The state/emitter half of an imperative handle: live `state` / `lastError`
// getters fed by watchNativeState, re-emitted as `stateChange`. Handles
// forward these members and call `unwatch()` from destroy().
export function createNativeStateHandle<S extends string>(
  nativeEmitter: NativeEventEmitter,
  eventName: string,
  runningStates: readonly S[]
) {
  let state = 'idle' as S;
  let lastError: string | null = null;
  const emitter = new EventEmitter<StateChangeEvents<S>>();
  const unwatch = watchNativeState<S>(
    nativeEmitter,
    eventName,
    runningStates,
    (nextState, nextError) => {
      state = nextState;
      lastError = nextError;
      emitter.emit('stateChange', { state: nextState, lastError: nextError });
    }
  );
  return {
    get state() {
      return state;
    },
    get lastError() {
      return lastError;
    },
    emitter,
    addListener: <TEventName extends keyof StateChangeEvents<S>>(
      name: TEventName,
      listener: StateChangeEvents<S>[TEventName]
    ): EventSubscription => emitter.addListener(name, listener),
    unwatch,
  };
}
