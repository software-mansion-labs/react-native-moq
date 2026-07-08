import { useEffect, useMemo, useState } from 'react';
import NativeMoQMultiCamera from '../native/NativeMoQMultiCamera';
import {
  multiCameraEmitter,
  multiCameraNoop,
  type MultiCameraOptions,
  type MultiCameraState,
  type MultiCameraTrack,
} from '../multiCamera';
import type { CameraTrack } from '../camera';
import { useNativeState } from './useNativeState';

export { isMultiCameraSupported } from '../multiCamera';
export type {
  MultiCameraOptions,
  MultiCameraState,
  MultiCameraTrack,
} from '../multiCamera';

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
      flip: multiCameraNoop('flip'),
      setPosition: multiCameraNoop('setPosition'),
    };
    const back: CameraTrack = {
      __type: 'camera',
      __name: 'back-camera',
      __source: 'multi-back',
      state,
      lastError,
      position: 'back',
      encoder,
      flip: multiCameraNoop('flip'),
      setPosition: multiCameraNoop('setPosition'),
    };
    return { isSupported, state, lastError, front, back };
  }, [isSupported, state, lastError, codec, width, height, framerate]);
}
