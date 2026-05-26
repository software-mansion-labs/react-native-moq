import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NativeEventEmitter } from 'react-native';
import NativeMoQCamera from './NativeMoQCamera';

const cameraEmitter = new NativeEventEmitter(NativeMoQCamera);

export type CameraPosition = 'front' | 'back';
export type VideoCodec = 'h264' | 'h265';

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
}

export interface CameraTrack {
  // Discriminator used by usePublisher to route tracks to addVideoTrack on
  // the native side. Don't read it from app code.
  readonly __type: 'camera';
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

  const [state, setState] = useState<CameraCaptureState>('idle');
  const [lastError, setLastError] = useState<string | null>(null);
  const [position, setPositionState] =
    useState<CameraPosition>(initialPosition);

  // Read the latest position inside the mount effect without re-running it —
  // the effect intentionally fires once per hook instance to bump the native
  // refcount exactly once.
  const positionRef = useRef(initialPosition);
  positionRef.current = position;

  useEffect(() => {
    NativeMoQCamera.startCapture(positionRef.current);
    return () => NativeMoQCamera.stopCapture();
  }, []);

  useEffect(() => {
    const sub = cameraEmitter.addListener('cameraStateChanged', (event) => {
      const e = event as { state: string };
      const next = e.state as CameraCaptureState;
      setState(next);
      if (next.startsWith('error:')) {
        setLastError(next.slice('error:'.length));
      } else if (next === 'active' || next === 'starting') {
        setLastError(null);
      }
    });
    return () => sub.remove();
  }, []);

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
