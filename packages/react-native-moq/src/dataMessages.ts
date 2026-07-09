import NativeMoQ from './native/NativeMoQ';
import { base64ToArrayBuffer } from './base64';
import { utf8Decode } from './utf8';
import {
  buildSubscription,
  trackEmitter as emitter,
  type TrackObjectEvent,
} from './trackObjects';
import type { BroadcastInfo, ChunkSubscription } from './types';

export interface DataMessage {
  /** The payload exactly as passed to `DataTrack.send()` on the publisher. */
  payload: string;
  trackName: string;
  /** MoQ group sequence for gap/ordering detection. */
  groupSequence: number;
  /** Object index within the group. */
  objectIndex: number;
}

export interface SubscribeDataMessagesOptions {
  /** Start receiving immediately. Defaults to true. */
  autoStart?: boolean;
}

/**
 * Subscribe to a broadcast's data track and receive each payload sent with
 * `DataTrack.send()` as a string. Framework-agnostic; call once per
 * `(broadcast, trackName)`. Data tracks don't appear in the catalog, so the
 * name must be agreed upon out of band (the publish-side default is `'data'`).
 */
export function subscribeDataMessages(
  broadcast: BroadcastInfo,
  trackName: string,
  onMessage: (message: DataMessage) => void,
  options: SubscribeDataMessagesOptions = {}
): ChunkSubscription {
  const { sessionId, path } = broadcast;

  return buildSubscription(
    sessionId,
    path,
    trackName,
    () => {
      const listener = emitter.addListener('trackObject', (raw) => {
        const event = raw as TrackObjectEvent;
        if (
          event.sessionId !== sessionId ||
          event.broadcastPath !== path ||
          event.trackName !== trackName
        ) {
          return;
        }
        onMessage({
          payload: utf8Decode(new Uint8Array(base64ToArrayBuffer(event.data))),
          trackName,
          groupSequence: event.groupSequence,
          objectIndex: event.objectIndex,
        });
      });
      NativeMoQ.subscribeTrackObjects(sessionId, path, trackName);
      return () => {
        listener.remove();
        NativeMoQ.unsubscribeTrackObjects(sessionId, path, trackName);
      };
    },
    options.autoStart !== false
  );
}
