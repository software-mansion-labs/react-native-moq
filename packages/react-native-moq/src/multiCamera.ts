import { NativeEventEmitter } from 'react-native';
import { EventEmitter, type EventSubscription } from './EventEmitter';
import NativeMoQMultiCamera from './native/NativeMoQMultiCamera';
import { watchNativeState } from './nativeState';
import type { CameraCaptureState, CameraTrack, VideoCodec } from './camera';

// Shared with useMultiCamera so both observe the same native module.
export const multiCameraEmitter = new NativeEventEmitter(NativeMoQMultiCamera);

// Capture is shared by both streams, so front and back report the same state.
export type MultiCameraState = CameraCaptureState;

export interface MultiCameraOptions {
  videoCodec?: VideoCodec;
  // Applied to both streams. Defaults are portrait (front 720x1280).
  width?: number;
  height?: number;
  framerate?: number;
  // When false the cameras aren't started; toggling starts/stops capture.
  // Hook-only; createMultiCamera always starts capture.
  enabled?: boolean;
}

// Whether this device can capture front and back concurrently. Useful for
// gating UI before mounting useMultiCamera (which starts hardware).
export function isMultiCameraSupported(): Promise<boolean> {
  return NativeMoQMultiCamera.isSupported();
}

export interface MultiCameraTrack {
  // null while the async capability check is in flight (resolves on mount).
  readonly isSupported: boolean | null;
  readonly state: MultiCameraState;
  readonly lastError: string | null;
  readonly front: CameraTrack;
  readonly back: CameraTrack;
}

export type MultiCameraEvents = {
  stateChange: (event: {
    state: MultiCameraState;
    lastError: string | null;
  }) => void;
};

/** Hook-free multi-camera; `destroy()` stops the (ref-counted) capture. */
export interface MultiCameraHandle extends MultiCameraTrack {
  readonly emitter: EventEmitter<MultiCameraEvents>;
  addListener<TEventName extends keyof MultiCameraEvents>(
    eventName: TEventName,
    listener: MultiCameraEvents[TEventName]
  ): EventSubscription;
  destroy(): void;
}

// Positions on a multi-camera track are fixed; warn instead of acting.
export function multiCameraNoop(label: string) {
  return () => {
    if (__DEV__) {
      console.warn(
        `[react-native-moq] ${label} is not supported on a multi-camera ` +
          `track — front/back positions are fixed.`
      );
    }
  };
}

/**
 * Imperative counterpart of `useMultiCamera` for non-React code: starts both
 * cameras immediately and keeps them alive until `destroy()`. Check
 * `isMultiCameraSupported()` before creating one — unsupported devices error.
 */
export function createMultiCamera(
  options: Omit<MultiCameraOptions, 'enabled'> = {}
): MultiCameraHandle {
  const codec = options.videoCodec ?? 'h264';
  const width = options.width ?? 720;
  const height = options.height ?? 1280;
  const framerate = options.framerate ?? 30;

  let isSupported: boolean | null = null;
  NativeMoQMultiCamera.isSupported()
    .then((supported) => {
      isSupported = supported;
    })
    .catch(() => {
      isSupported = false;
    });

  let state: MultiCameraState = 'idle';
  let lastError: string | null = null;
  const emitter = new EventEmitter<MultiCameraEvents>();
  const unwatch = watchNativeState<MultiCameraState>(
    multiCameraEmitter,
    'multiCameraStateChanged',
    ['active', 'starting'],
    (nextState, nextError) => {
      state = nextState;
      lastError = nextError;
      emitter.emit('stateChange', { state: nextState, lastError: nextError });
    }
  );

  NativeMoQMultiCamera.startCapture(width, height, framerate);

  const encoder = { codec, width, height, framerate };
  const cameraTrack = (source: 'front' | 'back'): CameraTrack => ({
    __type: 'camera',
    __name: `${source}-camera`,
    __source: `multi-${source}`,
    get state() {
      return state;
    },
    get lastError() {
      return lastError;
    },
    position: source,
    encoder,
    flip: multiCameraNoop('flip'),
    setPosition: multiCameraNoop('setPosition'),
  });

  return {
    get isSupported() {
      return isSupported;
    },
    get state() {
      return state;
    },
    get lastError() {
      return lastError;
    },
    front: cameraTrack('front'),
    back: cameraTrack('back'),
    emitter,
    addListener: (eventName, listener) =>
      emitter.addListener(eventName, listener),
    destroy() {
      unwatch();
      NativeMoQMultiCamera.stopCapture();
    },
  };
}
