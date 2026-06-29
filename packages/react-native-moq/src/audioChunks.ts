import { NativeEventEmitter, Platform } from 'react-native';
import NativeMoQ from './native/NativeMoQ';
import type {
  AudioChunk,
  AudioChunkFormat,
  BroadcastInfo,
  ChunkSubscription,
} from './types';

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

interface AudioDataEvent {
  sessionId: string;
  broadcastPath: string;
  trackName: string;
  sampleFormat: string; // 'f32' | 'i16'
  data: string; // base64 interleaved PCM
  frameCount: number;
  sampleRate: number;
  channelCount: number;
  timestampUs: number;
}

// `pcm-f32` / `pcm-i16` map to the moq-kit AudioDataStream sample formats the
// native layer understands; `encoded` uses the raw-object path instead.
const PCM_SAMPLE_FORMAT: Record<
  Exclude<AudioChunkFormat, 'encoded'>,
  'f32' | 'i16'
> = {
  'pcm-f32': 'f32',
  'pcm-i16': 'i16',
};

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
  /**
   * How to deliver audio. Defaults to `'encoded'` (one Opus/AAC object per
   * chunk, cross-platform). The `'pcm-f32'` / `'pcm-i16'` formats deliver
   * decoded interleaved PCM via moq-kit's decoder — **iOS only** for now;
   * requesting them on Android throws.
   */
  format?: AudioChunkFormat;
}

/**
 * Subscribe to a broadcast's audio track and receive each chunk as an
 * `ArrayBuffer`. Framework-agnostic — works with or without React. For multiple
 * tracks or broadcasts, call it once per `(broadcast, trackName)`; each call
 * returns its own independent handle.
 *
 * By default chunks are *encoded* audio (one Opus/AAC object) — decode them
 * downstream (e.g. react-native-audio-api) before playback or feeding
 * executorch. Pass `format: 'pcm-f32'` or `'pcm-i16'` to instead receive decoded
 * interleaved PCM (iOS only).
 */
export function subscribeAudioChunks(
  broadcast: BroadcastInfo,
  trackName: string,
  onChunk: (chunk: AudioChunk) => void,
  options: SubscribeAudioChunksOptions = {}
): ChunkSubscription {
  const format = options.format ?? 'encoded';
  if (format !== 'encoded') {
    return subscribePcmChunks(broadcast, trackName, onChunk, format, options);
  }

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
          format: 'encoded',
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

/**
 * Decoded-PCM variant of `subscribeAudioChunks`, backed by moq-kit's
 * `AudioDataStream`. Mirrors the encoded path but listens on the `audioData`
 * event and carries the decoder's PCM metadata (frameCount / timestampUs /
 * decoded sampleRate). iOS only — throws on Android.
 */
function subscribePcmChunks(
  broadcast: BroadcastInfo,
  trackName: string,
  onChunk: (chunk: AudioChunk) => void,
  format: Exclude<AudioChunkFormat, 'encoded'>,
  options: SubscribeAudioChunksOptions
): ChunkSubscription {
  if (Platform.OS !== 'ios') {
    throw new Error(
      `Decoded audio chunks (format: '${format}') are only supported on iOS; ` +
        `use the default 'encoded' format on ${Platform.OS}.`
    );
  }

  const { sessionId, path } = broadcast;
  const sampleFormat = PCM_SAMPLE_FORMAT[format];
  const info = broadcast.audioTracks.find((t) => t.name === trackName);
  const codec = info?.codec ?? '';

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
      listener = emitter.addListener('audioData', (raw) => {
        const event = raw as AudioDataEvent;
        if (
          event.sessionId !== sessionId ||
          event.broadcastPath !== path ||
          event.trackName !== trackName ||
          event.sampleFormat !== sampleFormat
        ) {
          return;
        }
        onChunk({
          data: base64ToArrayBuffer(event.data),
          format,
          trackName,
          codec,
          // Decoded rate/channels come from the decoder, not the catalog.
          sampleRate: event.sampleRate,
          channelCount: event.channelCount,
          frameCount: event.frameCount,
          timestampUs: event.timestampUs,
        });
      });
      NativeMoQ.subscribeAudioData(sessionId, path, trackName, sampleFormat);
    },
    stop() {
      if (!active) return;
      active = false;
      listener?.remove();
      listener = null;
      NativeMoQ.unsubscribeAudioData(sessionId, path, trackName, sampleFormat);
    },
  };

  if (options.autoStart !== false) subscription.start();
  return subscription;
}
