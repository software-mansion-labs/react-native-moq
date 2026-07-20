import { NativeEventEmitter } from 'react-native';
import { EventEmitter } from './EventEmitter';
import NativeMoQ from './native/NativeMoQ';
import type { Session, SessionEvents, SessionState } from './types';

const moqEmitter = new NativeEventEmitter(NativeMoQ);

let nextSessionId = 1;

// Native maps are keyed by this string. Internal: hooks mint ids up front so
// the id is stable from the first render.
export function mintSessionId(): string {
  return `s${nextSessionId++}`;
}

/**
 * Hook-free session, owned by the caller: `destroy()` disconnects and detaches
 * the native listener. `url` is read at `connect()` time, so it can be
 * reassigned between connects.
 */
export interface SessionHandle extends Omit<Session, 'url'> {
  url: string;
  destroy(): void;
}

/**
 * Imperative counterpart of `useSession` for non-React code. `state` is a live
 * getter; observe changes via `addListener('stateChange', …)`.
 */
export function createSession(url: string): SessionHandle {
  return createSessionWithId(mintSessionId(), url);
}

// Internal: useSession supplies its pre-minted id and its stable emitter.
export function createSessionWithId(
  id: string,
  url: string,
  emitter: EventEmitter<SessionEvents> = new EventEmitter()
): SessionHandle {
  let state: SessionState = 'idle';

  const sub = moqEmitter.addListener('sessionStateChanged', (event) => {
    const e = event as { sessionId: string; state: string };
    if (e.sessionId !== id) return;
    state = e.state as SessionState;
    emitter.emit('stateChange', { state });
  });

  const handle: SessionHandle = {
    id,
    url,
    get state() {
      return state;
    },
    emitter,
    addListener: (eventName, listener) =>
      emitter.addListener(eventName, listener),
    connect(targetLatencyMs = 200) {
      NativeMoQ.connect(id, handle.url, targetLatencyMs);
    },
    disconnect() {
      NativeMoQ.disconnect(id);
      if (state !== 'idle') {
        state = 'idle';
        emitter.emit('stateChange', { state: 'idle' });
      }
    },
    destroy() {
      sub.remove();
      NativeMoQ.disconnect(id);
    },
  };
  return handle;
}
