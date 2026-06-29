import { useEffect, useMemo, useState } from 'react';
import { NativeEventEmitter } from 'react-native';
import NativeMoQMultiCamera from '../native/NativeMoQMultiCamera';
import type { CameraCaptureState, CameraTrack, VideoCodec } from './useCamera';
import { useNativeState } from './useNativeState';

const multiCameraEmitter = new NativeEventEmitter(NativeMoQMultiCamera);

// Mirrors CameraCaptureState — the capture is shared by both streams, so the
// front and back tracks report the same state.
export type MultiCameraState = CameraCaptureState;

export interface MultiCameraOptions {
  videoCodec?: VideoCodec;
  // Applied to both the front and back streams. Defaults are portrait to match
  // moq-kit's multi-cam demo (front 720x1280).
  width?: number;
  height?: number;
  framerate?: number;
  // When false the cameras aren't started (state stays 'idle'); the support
  // check still runs. Toggling it starts/stops the concurrent capture. Lets an
  // app keep this hook mounted while running a single camera instead.
  enabled?: boolean;
}

// Whether this device can capture the front and back cameras concurrently.
// Useful for gating UI before mounting useMultiCamera (which starts hardware).
export function isMultiCameraSupported(): Promise<boolean> {
  return NativeMoQMultiCamera.isSupported();
}

export interface MultiCameraTrack {
  // Whether this device can run front + back concurrently. null while the
  // async capability check is in flight (resolves on mount).
  readonly isSupported: boolean | null;
  readonly state: MultiCameraState;
  readonly lastError: string | null;
  // Publishable tracks for each camera. Pass them to publisher.publish({ tracks })
  // and to <PublisherView camera={...} /> just like a single-camera track.
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

// Starts a concurrent front+back capture on mount and keeps it alive until
// unmount. Like useCamera, the capture is a refcounted device singleton, so
// mounting the hook twice costs no extra hardware. Unlike useCamera the two
// cameras can't be flipped — the positions are fixed.
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
    // Resolution/framerate are snapshotted when capture starts — changing them
    // requires remounting (or re-enabling) the hook, matching useCamera.
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
