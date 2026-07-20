import { NativeEventEmitter } from 'react-native';
import type { Listenable } from './EventEmitter';
import NativeMoQMicrophone from './native/NativeMoQMicrophone';
import { createNativeStateHandle, type StateChangeEvents } from './nativeState';

// Shared with useMicrophone so both observe the same native module.
export const micEmitter = new NativeEventEmitter(NativeMoQMicrophone);

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
  // When false the mic isn't started (state stays 'idle'); toggling it
  // starts/stops the shared capture. Lets an app run the mic conditionally
  // without conditionally calling the hook. Hook-only; createMicrophone always
  // starts capture.
  enabled?: boolean;
}

export interface MicrophoneTrack {
  // Discriminator used by the publisher to route to addAudioTrack natively.
  readonly __type: 'microphone';
  readonly state: MicrophoneCaptureState;
  readonly lastError: string | null;
  readonly encoder: AudioEncoderOptions;
}

export type MicrophoneEvents = StateChangeEvents<MicrophoneCaptureState>;

/** Hook-free microphone track; `destroy()` stops the (ref-counted) capture. */
export interface MicrophoneHandle
  extends MicrophoneTrack, Listenable<MicrophoneEvents> {
  destroy(): void;
}

export function getSupportedAudioCodecs(): AudioCodec[] {
  return NativeMoQMicrophone.getSupportedCodecs() as AudioCodec[];
}

// Single source of the microphone defaults, shared by createMicrophone and
// useMicrophone.
export function resolveMicrophoneOptions(
  options: MicrophoneOptions
): AudioEncoderOptions {
  return {
    codec: options.audioCodec ?? 'opus',
    sampleRate: options.audioSampleRate ?? 48000,
  };
}

/**
 * Imperative counterpart of `useMicrophone` for non-React code: starts capture
 * immediately and keeps it alive until `destroy()`. Ref-counted — the physical
 * mic is shared across consumers.
 */
export function createMicrophone(
  options: Omit<MicrophoneOptions, 'enabled'> = {}
): MicrophoneHandle {
  const encoder = resolveMicrophoneOptions(options);

  const watched = createNativeStateHandle<MicrophoneCaptureState>(
    micEmitter,
    'micStateChanged',
    ['active', 'starting']
  );

  NativeMoQMicrophone.startCapture(encoder.sampleRate);

  return {
    __type: 'microphone',
    get state() {
      return watched.state;
    },
    get lastError() {
      return watched.lastError;
    },
    encoder,
    emitter: watched.emitter,
    addListener: watched.addListener,
    destroy() {
      watched.unwatch();
      NativeMoQMicrophone.stopCapture();
    },
  };
}
