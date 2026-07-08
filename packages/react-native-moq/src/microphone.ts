import { NativeEventEmitter } from 'react-native';
import { EventEmitter, type EventSubscription } from './EventEmitter';
import NativeMoQMicrophone from './native/NativeMoQMicrophone';
import { watchNativeState } from './nativeState';

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
}

export interface MicrophoneTrack {
  // Discriminator used by the publisher to route to addAudioTrack natively.
  readonly __type: 'microphone';
  readonly state: MicrophoneCaptureState;
  readonly lastError: string | null;
  readonly encoder: AudioEncoderOptions;
}

export type MicrophoneEvents = {
  stateChange: (event: {
    state: MicrophoneCaptureState;
    lastError: string | null;
  }) => void;
};

/** Hook-free microphone track; `destroy()` stops the (ref-counted) capture. */
export interface MicrophoneHandle extends MicrophoneTrack {
  readonly emitter: EventEmitter<MicrophoneEvents>;
  addListener<TEventName extends keyof MicrophoneEvents>(
    eventName: TEventName,
    listener: MicrophoneEvents[TEventName]
  ): EventSubscription;
  destroy(): void;
}

export function getSupportedAudioCodecs(): AudioCodec[] {
  return NativeMoQMicrophone.getSupportedCodecs() as AudioCodec[];
}

/**
 * Imperative counterpart of `useMicrophone` for non-React code: starts capture
 * immediately and keeps it alive until `destroy()`. Ref-counted — the physical
 * mic is shared across consumers.
 */
export function createMicrophone(
  options: MicrophoneOptions = {}
): MicrophoneHandle {
  const codec = options.audioCodec ?? 'opus';
  const sampleRate = options.audioSampleRate ?? 48000;

  let state: MicrophoneCaptureState = 'idle';
  let lastError: string | null = null;
  const emitter = new EventEmitter<MicrophoneEvents>();
  const unwatch = watchNativeState<MicrophoneCaptureState>(
    micEmitter,
    'micStateChanged',
    ['active', 'starting'],
    (nextState, nextError) => {
      state = nextState;
      lastError = nextError;
      emitter.emit('stateChange', { state: nextState, lastError: nextError });
    }
  );

  NativeMoQMicrophone.startCapture(sampleRate);

  return {
    __type: 'microphone',
    get state() {
      return state;
    },
    get lastError() {
      return lastError;
    },
    encoder: { codec, sampleRate },
    emitter,
    addListener: (eventName, listener) =>
      emitter.addListener(eventName, listener),
    destroy() {
      unwatch();
      NativeMoQMicrophone.stopCapture();
    },
  };
}
