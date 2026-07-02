import { useEffect, useMemo } from 'react';
import { NativeEventEmitter } from 'react-native';
import NativeMoQMicrophone from '../native/NativeMoQMicrophone';
import { useNativeState } from './useNativeState';

const micEmitter = new NativeEventEmitter(NativeMoQMicrophone);

export type AudioCodec = 'opus' | 'aac';

export type MicrophoneCaptureState =
  | 'idle'
  | 'starting'
  | 'active'
  | `error:${string}`;

export interface AudioEncoderOptions {
  codec: AudioCodec;
  sampleRate: number;
}

export interface MicrophoneOptions {
  audioCodec?: AudioCodec;
  audioSampleRate?: number;
}

export interface MicrophoneTrack {
  // Discriminator used by usePublisher to route to addAudioTrack natively.
  readonly __type: 'microphone';
  readonly state: MicrophoneCaptureState;
  readonly lastError: string | null;
  readonly encoder: AudioEncoderOptions;
}

export function getSupportedAudioCodecs(): AudioCodec[] {
  return NativeMoQMicrophone.getSupportedCodecs() as AudioCodec[];
}

// Ref-counted: the physical mic is shared across consumers. Changing
// audioSampleRate after mount requires re-mounting the hook (e.g. via `key`).
export function useMicrophone(
  options: MicrophoneOptions = {}
): MicrophoneTrack {
  const codec = options.audioCodec ?? 'opus';
  const sampleRate = options.audioSampleRate ?? 48000;

  const { state, lastError } = useNativeState<MicrophoneCaptureState>(
    micEmitter,
    'micStateChanged',
    ['active', 'starting']
  );

  useEffect(() => {
    NativeMoQMicrophone.startCapture(sampleRate);
    return () => NativeMoQMicrophone.stopCapture();
    // Mount-only: sampleRate changes don't affect the running native capture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return useMemo<MicrophoneTrack>(
    () => ({
      __type: 'microphone',
      state,
      lastError,
      encoder: { codec, sampleRate },
    }),
    [state, lastError, codec, sampleRate]
  );
}
