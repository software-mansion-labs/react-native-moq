import { NativeEventEmitter } from 'react-native';
import NativeMoQ from './native/NativeMoQ';
import type { BroadcastInfo, Session } from './types';
import { PlayerHandle } from './types';

const moqEmitter = new NativeEventEmitter(NativeMoQ);

type Listener = (broadcasts: BroadcastInfo[]) => void;

// One PrefixSub per active (sessionId, prefix). Multiple subscribers watching
// the same session+prefix share a single underlying native
// BroadcastSubscription via JS-side ref-counting.
class PrefixSub {
  readonly sessionId: string;
  readonly prefix: string;
  broadcasts: BroadcastInfo[] = [];
  refCount = 0;
  readonly listeners = new Set<Listener>();

  constructor(sessionId: string, prefix: string) {
    this.sessionId = sessionId;
    this.prefix = prefix;
  }

  addListener(listener: Listener) {
    this.listeners.add(listener);
    // Push current state so a late subscriber sees broadcasts that arrived
    // before it mounted.
    listener(this.broadcasts);
  }

  removeListener(listener: Listener) {
    this.listeners.delete(listener);
  }

  setBroadcasts(next: BroadcastInfo[]) {
    this.broadcasts = next;
    this.listeners.forEach((l) => l(next));
  }
}

const subs = new Map<string, PrefixSub>();

function subKey(sessionId: string, prefix: string) {
  return `${sessionId} ${prefix}`;
}

function getOrCreate(sessionId: string, prefix: string): PrefixSub {
  const key = subKey(sessionId, prefix);
  let s = subs.get(key);
  if (!s) {
    s = new PrefixSub(sessionId, prefix);
    subs.set(key, s);
  }
  return s;
}

function ref(sessionId: string, prefix: string) {
  const s = getOrCreate(sessionId, prefix);
  s.refCount++;
  if (s.refCount === 1) {
    NativeMoQ.subscribe(sessionId, prefix);
  }
}

function unref(sessionId: string, prefix: string) {
  const key = subKey(sessionId, prefix);
  const s = subs.get(key);
  if (!s) return;
  s.refCount--;
  if (s.refCount === 0) {
    NativeMoQ.unsubscribe(sessionId, prefix);
    s.setBroadcasts([]);
    if (s.listeners.size === 0) {
      subs.delete(key);
    }
  }
}

// Listeners live for the JS bundle's lifetime; routed to the right PrefixSub by
// (sessionId, prefix) in the payload.
moqEmitter.addListener('broadcastAvailable', (event) => {
  const raw = event as Omit<BroadcastInfo, 'player' | 'sessionId'> & {
    sessionId: string;
    prefix: string;
    initialVideoTrackName?: string;
    initialAudioTrackName?: string;
  };
  const s = subs.get(subKey(raw.sessionId, raw.prefix));
  if (!s) return;
  // getPlayer returns a JSI HostObject on iOS; undefined on Android, where the
  // handle falls back to bridge calls keyed by (sessionId, broadcastPath).
  const native = (NativeMoQ as any).getPlayer?.(raw.sessionId, raw.path);
  const player = new PlayerHandle(
    raw.sessionId,
    raw.path,
    native,
    raw.initialVideoTrackName,
    raw.initialAudioTrackName
  );
  const info: BroadcastInfo = {
    sessionId: raw.sessionId,
    path: raw.path,
    videoTracks: raw.videoTracks,
    audioTracks: raw.audioTracks,
    player,
  };
  s.setBroadcasts([...s.broadcasts.filter((b) => b.path !== info.path), info]);
});

moqEmitter.addListener('broadcastUnavailable', (event) => {
  const e = event as { sessionId: string; prefix: string; path: string };
  const s = subs.get(subKey(e.sessionId, e.prefix));
  if (!s) return;
  s.setBroadcasts(s.broadcasts.filter((b) => b.path !== e.path));
});

// On disconnect the native side clears all subscriptions, so clear the JS-side
// caches too. Ref counts are kept so subscribers re-subscribe on reconnect.
moqEmitter.addListener('sessionStateChanged', (event) => {
  const { sessionId, state } = event as { sessionId: string; state: string };
  if (state !== 'connected') {
    subs.forEach((s) => {
      if (s.sessionId === sessionId && s.broadcasts.length > 0) {
        s.setBroadcasts([]);
      }
    });
  }
});

export interface SubscribeBroadcastsOptions {
  /** Start watching immediately. Defaults to true. */
  autoStart?: boolean;
}

/**
 * Handle to a running broadcast watch. `broadcasts` is a live snapshot;
 * `stop()` releases the (ref-counted) native prefix subscription.
 */
export interface BroadcastSubscription {
  readonly sessionId: string;
  readonly prefix: string;
  readonly broadcasts: BroadcastInfo[];
  readonly isActive: boolean;
  /** (Re)start watching. Idempotent. */
  start(): void;
  /** Stop watching and release the native subscription. Idempotent. */
  stop(): void;
}

/**
 * Imperative counterpart of `useBroadcasts`: watch the broadcasts available
 * under `prefix` on a session. `onChange` fires with the full list on every
 * change (including an initial call with the current list once the session is
 * connected, and `[]` on disconnect). The native subscription only exists
 * while the session is connected; reconnects re-subscribe automatically.
 */
export function subscribeBroadcasts(
  session: Pick<Session, 'id' | 'state'>,
  prefix: string,
  onChange: (broadcasts: BroadcastInfo[]) => void,
  options: SubscribeBroadcastsOptions = {}
): BroadcastSubscription {
  const sessionId = session.id;
  let active = false;
  let reffed = false;
  let broadcasts: BroadcastInfo[] = [];
  let stateSub: { remove(): void } | null = null;

  const listener: Listener = (next) => {
    broadcasts = next;
    onChange(next);
  };

  const setReffed = (next: boolean) => {
    if (next === reffed) return;
    reffed = next;
    if (next) {
      getOrCreate(sessionId, prefix).addListener(listener);
      ref(sessionId, prefix);
    } else {
      subs.get(subKey(sessionId, prefix))?.removeListener(listener);
      unref(sessionId, prefix);
      if (broadcasts.length > 0) {
        broadcasts = [];
        onChange([]);
      }
    }
  };

  const subscription: BroadcastSubscription = {
    sessionId,
    prefix,
    get broadcasts() {
      return broadcasts;
    },
    get isActive() {
      return active;
    },
    start() {
      if (active) return;
      active = true;
      stateSub = moqEmitter.addListener('sessionStateChanged', (event) => {
        const e = event as { sessionId: string; state: string };
        if (e.sessionId !== sessionId) return;
        setReffed(e.state === 'connected');
      });
      setReffed(session.state === 'connected');
    },
    stop() {
      if (!active) return;
      active = false;
      stateSub?.remove();
      stateSub = null;
      setReffed(false);
    },
  };

  if (options.autoStart !== false) subscription.start();
  return subscription;
}
