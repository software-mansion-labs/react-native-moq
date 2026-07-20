import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createAudioSourceWithId,
  mintAudioSourceId,
  resolveAudioSourceOptions,
  sendPcm,
  type AudioSourceOptions,
  type AudioSourceTrack,
  type PcmData,
} from '../audioSource';

export type {
  AudioSourceOptions,
  AudioSourceTrack,
  PcmData,
} from '../audioSource';

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
  const { name, channels, encoder } = resolveAudioSourceOptions(options);
  const { codec, sampleRate } = encoder;
  const [id] = useState(() => mintAudioSourceId());

  useEffect(() => {
    const source = createAudioSourceWithId(id, { sampleRate, channels });
    return () => source.destroy();
    // Mount-only: sampleRate/channels are baked into the native source; changing
    // them requires re-mounting the hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const send = useCallback((pcm: PcmData) => sendPcm(id, pcm), [id]);

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
