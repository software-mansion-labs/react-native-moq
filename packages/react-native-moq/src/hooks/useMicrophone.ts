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
  // Snapshotted by usePublisher at publish() time.
  readonly encoder: AudioEncoderOptions;
}

export function getSupportedAudioCodecs(): AudioCodec[] {
  return NativeMoQMicrophone.getSupportedCodecs() as AudioCodec[];
}

// Starts the microphone capture on mount, stops on unmount. Ref-counted — the
// physical mic is shared across all consumers. The initial sampleRate sets the
// AudioRecord capture format on Android; changing audioSampleRate after mount
// is only honored by re-mounting the hook (e.g. with a `key` prop).
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
    // Intentionally mount-only: changing sampleRate after start has no effect
    // on the native capture, so re-running the effect would just churn the
    // refcount. Document this in the public API instead.
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
