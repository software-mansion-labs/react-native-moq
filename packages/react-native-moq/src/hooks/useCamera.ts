import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NativeEventEmitter } from 'react-native';
import NativeMoQCamera from '../native/NativeMoQCamera';
import { useNativeState } from './useNativeState';

const cameraEmitter = new NativeEventEmitter(NativeMoQCamera);

export type CameraPosition = 'front' | 'back';
export type VideoCodec = 'h264' | 'h265';

// Which native capture backs a camera track. 'single' is the shared
// front-or-back camera owned by useCamera; the 'multi-*' values are the two
// concurrent sources of a useMultiCamera session. usePublisher reads this to
// route each track to the correct native frame source.
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
  // When false the camera isn't started (state stays 'idle'). Toggling it
  // starts/stops the shared capture. Lets an app conditionally run the camera
  // without conditionally calling the hook — useful when switching between
  // single and multi-camera modes so only one capture is ever live.
  enabled?: boolean;
}

export interface CameraTrack {
  // Discriminator used by usePublisher to route tracks to addVideoTrack on
  // the native side. Don't read it from app code.
  readonly __type: 'camera';
  // Published track name and the native capture source backing it. Internal —
  // usePublisher serializes these and PublisherView branches on __source.
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

// Starts the camera capture on mount and keeps it alive until unmount. The
// camera is a device singleton — multiple hook instances share one capture
// session and ref-count it natively, so mounting two useCamera hooks costs no
// extra hardware. Position changes are applied to the shared session, so
// they're visible to every consumer (preview, publish).
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

  // Read the latest position inside the mount effect without re-running it —
  // the effect intentionally fires once per hook instance to bump the native
  // refcount exactly once.
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
