import NativeMoQ from './native/NativeMoQ';
import { base64ToArrayBuffer } from './base64';
import {
  buildSubscription,
  trackEmitter as emitter,
  type TrackObjectEvent,
} from './trackObjects';
import type {
  AudioChunk,
  AudioChunkFormat,
  BroadcastInfo,
  ChunkSubscription,
} from './types';

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

// Maps public formats to moq-kit AudioDataStream sample formats.
const PCM_SAMPLE_FORMAT: Record<
  Exclude<AudioChunkFormat, 'encoded'>,
  'f32' | 'i16'
> = {
  'pcm-f32': 'f32',
  'pcm-i16': 'i16',
};

export interface SubscribeAudioChunksOptions {
  /** Start receiving immediately. Defaults to true. */
  autoStart?: boolean;
  /**
   * How to deliver audio. Defaults to `'encoded'` (one Opus/AAC object per
   * chunk); `'pcm-f32'` / `'pcm-i16'` deliver decoded interleaved PCM.
   */
  format?: AudioChunkFormat;
}

/**
 * Subscribe to a broadcast's audio track and receive each chunk as an
 * `ArrayBuffer`. Framework-agnostic; call once per `(broadcast, trackName)`.
 * Chunks are encoded audio by default; pass `format: 'pcm-f32'` / `'pcm-i16'`
 * for decoded interleaved PCM.
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
  // Enrich each chunk with codec/sampleRate from the catalog.
  const info = broadcast.audioTracks.find((t) => t.name === trackName);
  const codec = info?.codec ?? '';
  const sampleRate = info?.sampleRate ?? 0;
  const channelCount = info?.channelCount;

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
      return () => {
        listener.remove();
        NativeMoQ.unsubscribeTrackObjects(sessionId, path, trackName);
      };
    },
    options.autoStart !== false
  );
}

// Decoded-PCM variant of subscribeAudioChunks, backed by moq-kit's
// AudioDataStream; listens on `audioData` and carries the decoder's PCM metadata.
function subscribePcmChunks(
  broadcast: BroadcastInfo,
  trackName: string,
  onChunk: (chunk: AudioChunk) => void,
  format: Exclude<AudioChunkFormat, 'encoded'>,
  options: SubscribeAudioChunksOptions
): ChunkSubscription {
  const { sessionId, path } = broadcast;
  const sampleFormat = PCM_SAMPLE_FORMAT[format];
  const info = broadcast.audioTracks.find((t) => t.name === trackName);
  const codec = info?.codec ?? '';

  return buildSubscription(
    sessionId,
    path,
    trackName,
    () => {
      const listener = emitter.addListener('audioData', (raw) => {
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
      return () => {
        listener.remove();
        NativeMoQ.unsubscribeAudioData(
          sessionId,
          path,
          trackName,
          sampleFormat
        );
      };
    },
    options.autoStart !== false
  );
}
