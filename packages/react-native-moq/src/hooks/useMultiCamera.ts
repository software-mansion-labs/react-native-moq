import { useEffect, useMemo, useState } from 'react';
import { NativeEventEmitter } from 'react-native';
import NativeMoQMultiCamera from '../native/NativeMoQMultiCamera';
import type { CameraCaptureState, CameraTrack, VideoCodec } from './useCamera';
import { useNativeState } from './useNativeState';

const multiCameraEmitter = new NativeEventEmitter(NativeMoQMultiCamera);

// Capture is shared by both streams, so front and back report the same state.
export type MultiCameraState = CameraCaptureState;

export interface MultiCameraOptions {
  videoCodec?: VideoCodec;
  // Applied to both streams. Defaults are portrait (front 720x1280).
  width?: number;
  height?: number;
  framerate?: number;
  // When false the cameras aren't started; toggling starts/stops capture.
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

function noop(label: string) {
  return () => {
    if (__DEV__) {
      console.warn(
        `[react-native-moq] ${label} is not supported on a multi-camera ` +
          `track — front/back positions are fixed.`
      );
    }
  };
}

// Refcounted device singleton, like useCamera, but positions are fixed —
// the two cameras can't be flipped.
export function useMultiCamera(
  options: MultiCameraOptions = {}
): MultiCameraTrack {
  const codec = options.videoCodec ?? 'h264';
  const width = options.width ?? 720;
  const height = options.height ?? 1280;
  const framerate = options.framerate ?? 30;
  const enabled = options.enabled ?? true;

  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  const { state, lastError } = useNativeState<MultiCameraState>(
    multiCameraEmitter,
    'multiCameraStateChanged',
    ['active', 'starting']
  );

  useEffect(() => {
    let cancelled = false;
    NativeMoQMultiCamera.isSupported()
      .then((supported) => {
        if (!cancelled) setIsSupported(supported);
      })
      .catch(() => {
        if (!cancelled) setIsSupported(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    NativeMoQMultiCamera.startCapture(width, height, framerate);
    return () => NativeMoQMultiCamera.stopCapture();
    // Resolution/framerate snapshotted at start; changing needs re-enable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return useMemo<MultiCameraTrack>(() => {
    const encoder = { codec, width, height, framerate };
    const front: CameraTrack = {
      __type: 'camera',
      __name: 'front-camera',
      __source: 'multi-front',
      state,
      lastError,
      position: 'front',
      encoder,
      flip: noop('flip'),
      setPosition: noop('setPosition'),
    };
    const back: CameraTrack = {
      __type: 'camera',
      __name: 'back-camera',
      __source: 'multi-back',
      state,
      lastError,
      position: 'back',
      encoder,
      flip: noop('flip'),
      setPosition: noop('setPosition'),
    };
    return { isSupported, state, lastError, front, back };
  }, [isSupported, state, lastError, codec, width, height, framerate]);
}
