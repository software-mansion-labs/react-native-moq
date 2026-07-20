import { useEffect, useMemo } from 'react';
import NativeMoQMicrophone from '../native/NativeMoQMicrophone';
import {
  micEmitter,
  resolveMicrophoneOptions,
  type MicrophoneCaptureState,
  type MicrophoneOptions,
  type MicrophoneTrack,
} from '../microphone';
import { useNativeState } from './useNativeState';

export { getSupportedAudioCodecs } from '../microphone';
export type {
  AudioCodec,
  AudioEncoderOptions,
  MicrophoneCaptureState,
  MicrophoneOptions,
  MicrophoneTrack,
} from '../microphone';

// Ref-counted: the physical mic is shared across consumers. Changing
// audioSampleRate after mount requires re-mounting the hook (e.g. via `key`).
export function useMicrophone(
  options: MicrophoneOptions = {}
): MicrophoneTrack {
  const { codec, sampleRate } = resolveMicrophoneOptions(options);
  const enabled = options.enabled ?? true;

  const { state, lastError } = useNativeState<MicrophoneCaptureState>(
    micEmitter,
    'micStateChanged',
    ['active', 'starting']
  );

  useEffect(() => {
    if (!enabled) return;
    NativeMoQMicrophone.startCapture(sampleRate);
    return () => NativeMoQMicrophone.stopCapture();
    // sampleRate changes don't affect the running native capture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

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
