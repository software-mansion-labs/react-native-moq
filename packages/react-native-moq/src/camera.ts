import { NativeEventEmitter } from 'react-native';
import { EventEmitter, type EventSubscription } from './EventEmitter';
import NativeMoQCamera from './native/NativeMoQCamera';
import { watchNativeState } from './nativeState';

// Shared with useCamera so both observe the same native module.
export const cameraEmitter = new NativeEventEmitter(NativeMoQCamera);

export type CameraPosition = 'front' | 'back';
export type VideoCodec = 'h264' | 'h265';

// Which native capture backs a track. 'single' is useCamera's shared camera;
// 'multi-*' are the two concurrent sources of a useMultiCamera session.
// The publisher routes each track to the matching native frame source.
export type CameraSource = 'single' | 'multi-front' | 'multi-back';

export type CameraCaptureState =
  | 'idle'
  | 'starting'
  | 'active'
  | `error:${string}`;

export interface VideoEncoderOptions {
  codec: VideoCodec;
  width: number;
  height: number;
  framerate: number;
}

export interface CameraOptions {
  position?: CameraPosition;
  videoCodec?: VideoCodec;
  width?: number;
  height?: number;
  framerate?: number;
  // When false the camera isn't started (state stays 'idle'); toggling it
  // starts/stops the shared capture. Lets an app run the camera conditionally
  // without conditionally calling the hook. Hook-only; createCamera always
  // starts capture.
  enabled?: boolean;
}

export interface CameraTrack {
  // Internal discriminator: the publisher routes tracks to addVideoTrack.
  readonly __type: 'camera';
  // Internal: published track name and the native capture source backing it.
  readonly __name: string;
  readonly __source: CameraSource;
  readonly state: CameraCaptureState;
  readonly lastError: string | null;
  readonly position: CameraPosition;
  // Snapshotted by the publisher at publish() time.
  readonly encoder: VideoEncoderOptions;
  flip(): void;
  setPosition(position: CameraPosition): void;
}

export type CameraEvents = {
  stateChange: (event: {
    state: CameraCaptureState;
    lastError: string | null;
  }) => void;
};

/** Hook-free camera track; `destroy()` stops the (ref-counted) capture. */
export interface CameraHandle extends CameraTrack {
  readonly emitter: EventEmitter<CameraEvents>;
  addListener<TEventName extends keyof CameraEvents>(
    eventName: TEventName,
    listener: CameraEvents[TEventName]
  ): EventSubscription;
  destroy(): void;
}

export function getSupportedVideoCodecs(): VideoCodec[] {
  return NativeMoQCamera.getSupportedCodecs() as VideoCodec[];
}

/**
 * Imperative counterpart of `useCamera` for non-React code: starts capture
 * immediately and keeps it alive until `destroy()`. The camera is a device
 * singleton shared with every other consumer — see useCamera.
 */
export function createCamera(
  options: Omit<CameraOptions, 'enabled'> = {}
): CameraHandle {
  let position = options.position ?? 'front';
  const codec = options.videoCodec ?? 'h264';
  const width = options.width ?? 1280;
  const height = options.height ?? 720;
  const framerate = options.framerate ?? 30;

  let state: CameraCaptureState = 'idle';
  let lastError: string | null = null;
  const emitter = new EventEmitter<CameraEvents>();
  const unwatch = watchNativeState<CameraCaptureState>(
    cameraEmitter,
    'cameraStateChanged',
    ['active', 'starting'],
    (nextState, nextError) => {
      state = nextState;
      lastError = nextError;
      emitter.emit('stateChange', { state: nextState, lastError: nextError });
    }
  );

  NativeMoQCamera.startCapture(position);

  const setPosition = (next: CameraPosition) => {
    if (next === position) return;
    NativeMoQCamera.setPosition(next);
    position = next;
  };

  return {
    __type: 'camera',
    __name: 'camera',
    __source: 'single',
    get state() {
      return state;
    },
    get lastError() {
      return lastError;
    },
    get position() {
      return position;
    },
    encoder: { codec, width, height, framerate },
    flip: () => setPosition(position === 'front' ? 'back' : 'front'),
    setPosition,
    emitter,
    addListener: (eventName, listener) =>
      emitter.addListener(eventName, listener),
    destroy() {
      unwatch();
      NativeMoQCamera.stopCapture();
    },
  };
}
