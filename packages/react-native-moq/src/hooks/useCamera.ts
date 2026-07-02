import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NativeEventEmitter } from 'react-native';
import NativeMoQCamera from '../native/NativeMoQCamera';
import { useNativeState } from './useNativeState';

const cameraEmitter = new NativeEventEmitter(NativeMoQCamera);

export type CameraPosition = 'front' | 'back';
export type VideoCodec = 'h264' | 'h265';

// Which native capture backs a track. 'single' is useCamera's shared camera;
// 'multi-*' are the two concurrent sources of a useMultiCamera session.
// usePublisher routes each track to the matching native frame source.
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
  // without conditionally calling the hook.
  enabled?: boolean;
}

export interface CameraTrack {
  // Internal discriminator: usePublisher routes tracks to addVideoTrack.
  readonly __type: 'camera';
  // Internal: published track name and the native capture source backing it.
  readonly __name: string;
  readonly __source: CameraSource;
  readonly state: CameraCaptureState;
  readonly lastError: string | null;
  readonly position: CameraPosition;
  // Snapshotted by usePublisher at publish() time.
  readonly encoder: VideoEncoderOptions;
  flip(): void;
  setPosition(position: CameraPosition): void;
}

export function getSupportedVideoCodecs(): VideoCodec[] {
  return NativeMoQCamera.getSupportedCodecs() as VideoCodec[];
}

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
