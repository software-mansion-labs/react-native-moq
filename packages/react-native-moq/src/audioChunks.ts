import { NativeEventEmitter } from 'react-native';
import NativeMoQ from './native/NativeMoQ';
import type { AudioChunk, BroadcastInfo, ChunkSubscription } from './types';

// One shared emitter for the MoQ module — mirrors useBroadcasts. The native
// side fans every received track object out as a `trackObject` event; each
// subscription filters by (sessionId, broadcastPath, trackName).
const emitter = new NativeEventEmitter(NativeMoQ);

interface TrackObjectEvent {
  sessionId: string;
  broadcastPath: string;
  trackName: string;
  data: string; // base64
  groupSequence: number;
  objectIndex: number;
}

const BASE64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_LOOKUP = /* @__PURE__ */ (() => {
  const table = new Uint8Array(256);
  for (let i = 0; i < BASE64_CHARS.length; i++) {
    table[BASE64_CHARS.charCodeAt(i)] = i;
  }
  return table;
})();

// Dependency-free base64 → ArrayBuffer. Chunks cross the RN event bridge as
// base64 (JSON can't carry binary); decode once here so consumers get an
// ArrayBuffer ready for react-native-audio-api / executorch.
/* eslint-disable no-bitwise */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const len = base64.length;
  let pad = 0;
  if (len > 0 && base64[len - 1] === '=') pad++;
  if (len > 1 && base64[len - 2] === '=') pad++;
  const byteLength = (len * 3) / 4 - pad;
  const bytes = new Uint8Array(byteLength);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const e1 = BASE64_LOOKUP[base64.charCodeAt(i)] ?? 0;
    const e2 = BASE64_LOOKUP[base64.charCodeAt(i + 1)] ?? 0;
    const e3 = BASE64_LOOKUP[base64.charCodeAt(i + 2)] ?? 0;
    const e4 = BASE64_LOOKUP[base64.charCodeAt(i + 3)] ?? 0;
    bytes[p++] = (e1 << 2) | (e2 >> 4);
    if (p < byteLength) bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (p < byteLength) bytes[p++] = ((e3 & 3) << 6) | e4;
  }
  return bytes.buffer;
}
/* eslint-enable no-bitwise */

export interface SubscribeAudioChunksOptions {
  /** Start receiving immediately. Defaults to true. */
  autoStart?: boolean;
}

/**
 * Subscribe to a broadcast's audio track and receive each encoded chunk
 * (one Opus/AAC object) as an `ArrayBuffer`. Framework-agnostic — works with or
 * without React. For multiple tracks or broadcasts, call it once per
 * `(broadcast, trackName)`; each call returns its own independent handle.
 *
 * The returned chunks are *encoded* audio, not PCM. Decode them downstream
 * (e.g. react-native-audio-api) before playback or feeding executorch.
 */
export function subscribeAudioChunks(
  broadcast: BroadcastInfo,
  trackName: string,
  onChunk: (chunk: AudioChunk) => void,
  options: SubscribeAudioChunksOptions = {}
): ChunkSubscription {
  const { sessionId, path } = broadcast;
  // Enrich every chunk with codec/sampleRate from the catalog so consumers
  // don't have to look the track up themselves. Stable for a given path+track.
  const info = broadcast.audioTracks.find((t) => t.name === trackName);
  const codec = info?.codec ?? '';
  const sampleRate = info?.sampleRate ?? 0;
  const channelCount = info?.channelCount;

  let active = false;
  let listener: { remove: () => void } | null = null;

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
      listener = emitter.addListener('trackObject', (raw) => {
        const event = raw as TrackObjectEvent;
        if (
          event.sessionId !== sessionId ||
          event.broadcastPath !== path ||
          event.trackName !== trackName
        ) {
          return;
        }
        onChunk({
          data: base64ToArrayBuffer(event.data),
          trackName,
          codec,
          sampleRate,
          channelCount,
          groupSequence: event.groupSequence,
          objectIndex: event.objectIndex,
        });
      });
      NativeMoQ.subscribeTrackObjects(sessionId, path, trackName);
    },
    stop() {
      if (!active) return;
      active = false;
      listener?.remove();
      listener = null;
      NativeMoQ.unsubscribeTrackObjects(sessionId, path, trackName);
    },
  };

  if (options.autoStart !== false) subscription.start();
  return subscription;
}
