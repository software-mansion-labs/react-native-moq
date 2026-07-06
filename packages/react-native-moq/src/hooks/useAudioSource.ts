import { useCallback, useEffect, useMemo, useState } from 'react';
import NativeMoQAudioSource from '../native/NativeMoQAudioSource';
import { base64Encode } from '../base64';
import type { AudioCodec, AudioEncoderOptions } from './useMicrophone';

// Unique id per instance so the native source registry can address it
// independently of the track name (two tracks may share the default "audio").
let nextAudioSourceId = 0;

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
  // Internal discriminator: usePublisher routes to addAudioTrack.
  readonly __type: 'audioSource';
  readonly __name: string;
  readonly __id: string;
  readonly encoder: AudioEncoderOptions;
  readonly channels: number;
  // Push PCM to subscribers. No-op until the publisher has published and started.
  send(pcm: PcmData): void;
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

/**
 * A publishable audio track fed by app-supplied PCM — the custom-audio
 * counterpart of useMicrophone. Pass it into
 * `publisher.publish({ tracks: [audioSource, …] })`, then call `send(pcm)` to
 * stream synthesized speech (TTS), music, or any PCM your app produces. The
 * native side paces sends out in real time, so a whole utterance can go at once.
 *
 * `sampleRate` / `channels` are fixed for the source's lifetime; change them by
 * re-mounting the hook (e.g. via a React `key`).
 */
export function useAudioSource(
  options: AudioSourceOptions = {}
): AudioSourceTrack {
  const name = options.name ?? 'audio';
  const codec = options.audioCodec ?? 'opus';
  const sampleRate = options.sampleRate ?? 48000;
  const channels = options.channels ?? 1;
  const [id] = useState(() => `audioSource-${nextAudioSourceId++}`);

  useEffect(() => {
    NativeMoQAudioSource.create(id, sampleRate, channels);
    return () => NativeMoQAudioSource.destroy(id);
    // Mount-only: sampleRate/channels are baked into the native source; changing
    // them requires re-mounting the hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const send = useCallback(
    (pcm: PcmData) => {
      const bytes = toInt16Bytes(pcm);
      if (bytes.length === 0) return;
      NativeMoQAudioSource.send(id, base64Encode(bytes));
    },
    [id]
  );

  return useMemo<AudioSourceTrack>(
    () => ({
      __type: 'audioSource',
      __name: name,
      __id: id,
      encoder: { codec, sampleRate },
      channels,
      send,
    }),
    [name, id, codec, sampleRate, channels, send]
  );
}
