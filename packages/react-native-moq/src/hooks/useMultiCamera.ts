import { useEffect, useMemo, useState } from 'react';
import NativeMoQMultiCamera from '../native/NativeMoQMultiCamera';
import {
  makeMultiCameraTrack,
  multiCameraEmitter,
  resolveMultiCameraOptions,
  type MultiCameraOptions,
  type MultiCameraState,
  type MultiCameraTrack,
} from '../multiCamera';
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
  const { codec, width, height, framerate } =
    resolveMultiCameraOptions(options);
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
    const read = () => ({ state, lastError });
    return {
      isSupported,
      state,
      lastError,
      front: makeMultiCameraTrack('front', read, encoder),
      back: makeMultiCameraTrack('back', read, encoder),
    };
  }, [isSupported, state, lastError, codec, width, height, framerate]);
}
