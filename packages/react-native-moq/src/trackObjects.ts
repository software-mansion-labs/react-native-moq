import { NativeEventEmitter } from 'react-native';
import NativeMoQ from './native/NativeMoQ';
import type { ChunkSubscription } from './types';

// Shared emitter: native fans every track object out as one `trackObject`
// event; each subscription filters by (sessionId, broadcastPath, trackName).
export const trackEmitter = new NativeEventEmitter(NativeMoQ);

// Payload of a `trackObject` event — one raw MoQ object from any track kind
// (encoded audio chunk or data message).
export interface TrackObjectEvent {
  sessionId: string;
  broadcastPath: string;
  trackName: string;
  data: string; // base64
  groupSequence: number;
  objectIndex: number;
}

// Shared lifecycle for track subscriptions: `open` wires up the native
// subscription + listener and returns its teardown; guards start/stop as idempotent.
export function buildSubscription(
  sessionId: string,
  path: string,
  trackName: string,
  open: () => () => void,
  autoStart: boolean
): ChunkSubscription {
  let active = false;
  let close: (() => void) | null = null;

  const subscription: ChunkSubscription = {
    sessionId,
    broadcastPath: path,
    trackName,
    get isActive() {
      return active;
    },
    start() {
      if (active) return;
      active = true;
      close = open();
    },
    stop() {
      if (!active) return;
      active = false;
      close?.();
      close = null;
    },
  };

  if (autoStart) subscription.start();
  return subscription;
}
