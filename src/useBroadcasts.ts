import { useEffect, useState } from 'react';
import { NativeEventEmitter } from 'react-native';
import NativeMoQ from './NativeMoQ';
import type { BroadcastInfo, Session } from './types';
import { PlayerHandle } from './types';

const moqEmitter = new NativeEventEmitter(NativeMoQ);

type Listener = (broadcasts: BroadcastInfo[]) => void;

// One PrefixSub per active prefix. Multiple useBroadcasts hooks subscribed to
// the same prefix share a single underlying native BroadcastSubscription via
// ref-counting on the JS side.
class PrefixSub {
  readonly prefix: string;
  broadcasts: BroadcastInfo[] = [];
  refCount = 0;
  readonly listeners = new Set<Listener>();

  constructor(prefix: string) {
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

function getOrCreate(prefix: string): PrefixSub {
  let s = subs.get(prefix);
  if (!s) {
    s = new PrefixSub(prefix);
    subs.set(prefix, s);
  }
  return s;
}

function ref(prefix: string) {
  const s = getOrCreate(prefix);
  s.refCount++;
  if (s.refCount === 1) {
    NativeMoQ.subscribe(prefix);
  }
}

function unref(prefix: string) {
  const s = subs.get(prefix);
  if (!s) return;
  s.refCount--;
  if (s.refCount === 0) {
    NativeMoQ.unsubscribe(prefix);
    s.setBroadcasts([]);
    if (s.listeners.size === 0) {
      subs.delete(prefix);
    }
  }
}

// Native event wiring.  These listeners live for the lifetime of the JS
// bundle — there is at most one set of native broadcast events to handle and
// we route them to the right PrefixSub by the `prefix` field in the payload.

moqEmitter.addListener('broadcastAvailable', (event) => {
  const raw = event as Omit<BroadcastInfo, 'player'> & {
    prefix: string;
    initialVideoTrackName?: string;
    initialAudioTrackName?: string;
  };
  const s = subs.get(raw.prefix);
  if (!s) return;
  // getPlayer is provided by the C++ TurboModule override on iOS and returns
  // a JSI HostObject.  On Android it is undefined so the handle falls back to
  // bridge calls keyed by broadcastPath.
  const native = (NativeMoQ as any).getPlayer?.(raw.path);
  const player = new PlayerHandle(
    raw.path,
    native,
    raw.initialVideoTrackName,
    raw.initialAudioTrackName
  );
  const info: BroadcastInfo = {
    path: raw.path,
    videoTracks: raw.videoTracks,
    audioTracks: raw.audioTracks,
    player,
  };
  s.setBroadcasts([...s.broadcasts.filter((b) => b.path !== info.path), info]);
});

moqEmitter.addListener('broadcastUnavailable', (event) => {
  const e = event as { prefix: string; path: string };
  const s = subs.get(e.prefix);
  if (!s) return;
  s.setBroadcasts(s.broadcasts.filter((b) => b.path !== e.path));
});

// When the native session disconnects all subscriptions are cleared on its
// side, so we also clear the JS-side broadcast caches.  We keep ref counts in
// place — if a hook is still mounted, the next time the session reconnects
// the `isConnected` effect below will re-issue NativeMoQ.subscribe(prefix).
moqEmitter.addListener('sessionStateChanged', (event) => {
  const { state } = event as { state: string };
  if (state !== 'connected') {
    subs.forEach((s) => {
      if (s.broadcasts.length > 0) s.setBroadcasts([]);
    });
  }
});

/**
 * Subscribe to broadcasts under a given prefix.  Multiple hooks may share the
 * same prefix; the underlying native subscription is shared via ref-counting
 * and torn down when the last hook for that prefix unmounts.
 *
 * The returned array is empty until the session reaches the `connected` state;
 * the hook re-subscribes automatically on reconnect.
 */
export function useBroadcasts(
  session: Session,
  prefix: string = ''
): BroadcastInfo[] {
  const [broadcasts, setBroadcasts] = useState<BroadcastInfo[]>([]);
  const isConnected = session.state === 'connected';

  useEffect(() => {
    if (!isConnected) {
      // Reset local state on disconnect so consumers don't see stale entries.
      setBroadcasts([]);
      return;
    }

    const s = getOrCreate(prefix);
    const listener: Listener = (b) => setBroadcasts(b);
    s.addListener(listener);
    ref(prefix);

    return () => {
      s.removeListener(listener);
      unref(prefix);
    };
  }, [isConnected, prefix]);

  return broadcasts;
}
