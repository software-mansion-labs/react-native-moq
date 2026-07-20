import NativeMoQAudioSource from './native/NativeMoQAudioSource';
import { base64Encode } from './base64';
import type { AudioCodec, AudioEncoderOptions } from './microphone';

// Unique id per instance so the native source registry can address it
// independently of the track name (two tracks may share the default "audio").
let nextAudioSourceId = 0;

// Internal: useAudioSource mints its id up front so it survives StrictMode
// remounts.
export function mintAudioSourceId(): string {
  return `audioSource-${nextAudioSourceId++}`;
}

// PCM the app pushes: Float32 samples in [-1, 1], or interleaved signed 16-bit.
export type PcmData = ArrayBuffer | Int16Array | Float32Array;

export interface AudioSourceOptions {
  // Track name in the broadcast catalog. Defaults to "audio".
  name?: string;
  audioCodec?: AudioCodec;
  // Hz of the PCM you push. Defaults to 48000.
  sampleRate?: number;
  // 1 = mono, 2 = interleaved stereo. Defaults to 1.
  channels?: number;
}

export interface AudioSourceTrack {
  // Internal discriminator: the publisher routes to addAudioTrack.
  readonly __type: 'audioSource';
  readonly __name: string;
  readonly __id: string;
  readonly encoder: AudioEncoderOptions;
  readonly channels: number;
  // Push PCM to subscribers. No-op until the publisher has published and started.
  send(pcm: PcmData): void;
}

/** Hook-free audio source; `destroy()` releases the native source. */
export interface AudioSourceHandle extends AudioSourceTrack {
  destroy(): void;
}

// Single source of the audio-source defaults, shared by createAudioSource and
// useAudioSource.
export function resolveAudioSourceOptions(options: AudioSourceOptions): {
  name: string;
  channels: number;
  encoder: AudioEncoderOptions;
} {
  return {
    name: options.name ?? 'audio',
    channels: options.channels ?? 1,
    encoder: {
      codec: options.audioCodec ?? 'opus',
      sampleRate: options.sampleRate ?? 48000,
    },
  };
}

// Normalize the pushed PCM to raw interleaved 16-bit LE bytes for the bridge.
function toInt16Bytes(pcm: PcmData): Uint8Array {
  if (pcm instanceof Float32Array) {
    const out = new Int16Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) {
      const s = Math.max(-1, Math.min(1, pcm[i] ?? 0));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return new Uint8Array(out.buffer);
  }
  if (pcm instanceof Int16Array) {
    return new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  }
  return new Uint8Array(pcm);
}

// Internal: shared by the factory and useAudioSource.
export function sendPcm(id: string, pcm: PcmData): void {
  const bytes = toInt16Bytes(pcm);
  if (bytes.length === 0) return;
  NativeMoQAudioSource.send(id, base64Encode(bytes));
}

/**
 * Imperative counterpart of `useAudioSource` for non-React code: a publishable
 * audio track fed by app-supplied PCM. Owns a native source until `destroy()`.
 * Pass it into `publisher.publish({ tracks: [audioSource, …] })`, then call
 * `send(pcm)` to stream synthesized speech (TTS), music, or any PCM your app
 * produces. The native side paces sends out in real time, so a whole utterance
 * can go at once.
 *
 * `sampleRate` / `channels` are fixed for the source's lifetime.
 */
export function createAudioSource(
  options: AudioSourceOptions = {}
): AudioSourceHandle {
  return createAudioSourceWithId(mintAudioSourceId(), options);
}

// Internal: useAudioSource supplies its pre-minted id.
export function createAudioSourceWithId(
  id: string,
  options: AudioSourceOptions = {}
): AudioSourceHandle {
  const { name, channels, encoder } = resolveAudioSourceOptions(options);

  NativeMoQAudioSource.create(id, encoder.sampleRate, channels);

  return {
    __type: 'audioSource',
    __name: name,
    __id: id,
    encoder,
    channels,
    send: (pcm) => sendPcm(id, pcm),
    destroy: () => NativeMoQAudioSource.destroy(id),
  };
}
