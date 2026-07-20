import { NativeEventEmitter } from 'react-native';
import type { Listenable } from './EventEmitter';
import NativeMoQCamera from './native/NativeMoQCamera';
import { createNativeStateHandle, type StateChangeEvents } from './nativeState';

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

export type CameraEvents = StateChangeEvents<CameraCaptureState>;

/** Hook-free camera track; `destroy()` stops the (ref-counted) capture. */
export interface CameraHandle extends CameraTrack, Listenable<CameraEvents> {
  destroy(): void;
}

export function getSupportedVideoCodecs(): VideoCodec[] {
  return NativeMoQCamera.getSupportedCodecs() as VideoCodec[];
}

// Single source of the camera defaults, shared by createCamera and useCamera.
export function resolveCameraOptions(options: CameraOptions): {
  position: CameraPosition;
  encoder: VideoEncoderOptions;
} {
  return {
    position: options.position ?? 'front',
    encoder: {
      codec: options.videoCodec ?? 'h264',
      width: options.width ?? 1280,
      height: options.height ?? 720,
      framerate: options.framerate ?? 30,
    },
  };
}

/**
 * Imperative counterpart of `useCamera` for non-React code: starts capture
 * immediately and keeps it alive until `destroy()`. The camera is a device
 * singleton shared with every other consumer — see useCamera.
 */
export function createCamera(
  options: Omit<CameraOptions, 'enabled'> = {}
): CameraHandle {
  const { position: initialPosition, encoder } = resolveCameraOptions(options);
  let position = initialPosition;

  const watched = createNativeStateHandle<CameraCaptureState>(
    cameraEmitter,
    'cameraStateChanged',
    ['active', 'starting']
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
      return watched.state;
    },
    get lastError() {
      return watched.lastError;
    },
    get position() {
      return position;
    },
    encoder,
    flip: () => setPosition(position === 'front' ? 'back' : 'front'),
    setPosition,
    emitter: watched.emitter,
    addListener: watched.addListener,
    destroy() {
      watched.unwatch();
      NativeMoQCamera.stopCapture();
    },
  };
}
