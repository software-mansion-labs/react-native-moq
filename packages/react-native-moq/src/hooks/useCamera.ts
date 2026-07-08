import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NativeMoQCamera from '../native/NativeMoQCamera';
import {
  cameraEmitter,
  type CameraCaptureState,
  type CameraOptions,
  type CameraPosition,
  type CameraTrack,
} from '../camera';
import { useNativeState } from './useNativeState';

export { getSupportedVideoCodecs } from '../camera';
export type {
  CameraCaptureState,
  CameraOptions,
  CameraPosition,
  CameraSource,
  CameraTrack,
  VideoCodec,
  VideoEncoderOptions,
} from '../camera';

// Starts capture on mount, keeps it alive until unmount. The camera is a device
// singleton: hook instances share one native, ref-counted capture session, and
// position changes apply to the shared session (visible to every consumer).
export function useCamera(options: CameraOptions = {}): CameraTrack {
  const initialPosition = options.position ?? 'front';
  const codec = options.videoCodec ?? 'h264';
  const width = options.width ?? 1280;
  const height = options.height ?? 720;
  const framerate = options.framerate ?? 30;
  const enabled = options.enabled ?? true;

  const [position, setPositionState] =
    useState<CameraPosition>(initialPosition);
  const { state, lastError } = useNativeState<CameraCaptureState>(
    cameraEmitter,
    'cameraStateChanged',
    ['active', 'starting']
  );

  // Read latest position in the mount effect without re-running it — the effect
  // fires once per instance to bump the native refcount exactly once.
  const positionRef = useRef(initialPosition);
  positionRef.current = position;

  useEffect(() => {
    if (!enabled) return;
    NativeMoQCamera.startCapture(positionRef.current);
    return () => NativeMoQCamera.stopCapture();
  }, [enabled]);

  const setPosition = useCallback((next: CameraPosition) => {
    if (next === positionRef.current) return;
    NativeMoQCamera.setPosition(next);
    setPositionState(next);
  }, []);

  const flip = useCallback(() => {
    setPosition(positionRef.current === 'front' ? 'back' : 'front');
  }, [setPosition]);

  return useMemo<CameraTrack>(
    () => ({
      __type: 'camera',
      __name: 'camera',
      __source: 'single',
      state,
      lastError,
      position,
      encoder: { codec, width, height, framerate },
      flip,
      setPosition,
    }),
    [
      state,
      lastError,
      position,
      codec,
      width,
      height,
      framerate,
      flip,
      setPosition,
    ]
  );
}
