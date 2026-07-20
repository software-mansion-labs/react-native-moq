import { NativeEventEmitter } from 'react-native';
import type { Listenable } from './EventEmitter';
import NativeMoQMultiCamera from './native/NativeMoQMultiCamera';
import { createNativeStateHandle, type StateChangeEvents } from './nativeState';
import type {
  CameraCaptureState,
  CameraTrack,
  VideoCodec,
  VideoEncoderOptions,
} from './camera';

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

export type MultiCameraEvents = StateChangeEvents<MultiCameraState>;

/** Hook-free multi-camera; `destroy()` stops the (ref-counted) capture. */
export interface MultiCameraHandle
  extends MultiCameraTrack, Listenable<MultiCameraEvents> {
  destroy(): void;
}

// Single source of the multi-camera defaults (portrait), shared by
// createMultiCamera and useMultiCamera.
export function resolveMultiCameraOptions(
  options: MultiCameraOptions
): VideoEncoderOptions {
  return {
    codec: options.videoCodec ?? 'h264',
    width: options.width ?? 720,
    height: options.height ?? 1280,
    framerate: options.framerate ?? 30,
  };
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

// One of the two fixed tracks; `read` supplies the capture state both share.
// Used by createMultiCamera and useMultiCamera.
export function makeMultiCameraTrack(
  source: 'front' | 'back',
  read: () => { state: MultiCameraState; lastError: string | null },
  encoder: VideoEncoderOptions
): CameraTrack {
  return {
    __type: 'camera',
    __name: `${source}-camera`,
    __source: `multi-${source}`,
    get state() {
      return read().state;
    },
    get lastError() {
      return read().lastError;
    },
    position: source,
    encoder,
    flip: multiCameraNoop('flip'),
    setPosition: multiCameraNoop('setPosition'),
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
  const encoder = resolveMultiCameraOptions(options);

  let isSupported: boolean | null = null;
  NativeMoQMultiCamera.isSupported()
    .then((supported) => {
      isSupported = supported;
    })
    .catch(() => {
      isSupported = false;
    });

  const watched = createNativeStateHandle<MultiCameraState>(
    multiCameraEmitter,
    'multiCameraStateChanged',
    ['active', 'starting']
  );

  NativeMoQMultiCamera.startCapture(
    encoder.width,
    encoder.height,
    encoder.framerate
  );

  const read = () => ({ state: watched.state, lastError: watched.lastError });

  return {
    get isSupported() {
      return isSupported;
    },
    get state() {
      return watched.state;
    },
    get lastError() {
      return watched.lastError;
    },
    front: makeMultiCameraTrack('front', read, encoder),
    back: makeMultiCameraTrack('back', read, encoder),
    emitter: watched.emitter,
    addListener: watched.addListener,
    destroy() {
      watched.unwatch();
      NativeMoQMultiCamera.stopCapture();
    },
  };
}
