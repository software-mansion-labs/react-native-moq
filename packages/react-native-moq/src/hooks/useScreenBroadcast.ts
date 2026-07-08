import { useCallback, useEffect, useMemo } from 'react';
import NativeMoQScreenBroadcast from '../native/NativeMoQScreenBroadcast';
import {
  configureScreenBroadcast,
  screenEmitter,
  type ScreenBroadcast,
  type ScreenBroadcastOptions,
  type ScreenBroadcastState,
} from '../screenBroadcast';
import { useNativeState } from './useNativeState';
import type { Session } from '../types';

export type {
  ScreenBroadcast,
  ScreenBroadcastOptions,
  ScreenBroadcastState,
} from '../screenBroadcast';

// Screen broadcasting runs out-of-process (iOS Broadcast Upload Extension /
// Android foreground service), so it opens its own connection from the
// session's URL rather than reusing the host's MoQ session. It's a device
// singleton (one ReplayKit / MediaProjection at a time), so state is not
// session-scoped — multiple hook instances observe the same state.
export function useScreenBroadcast(
  session: Session,
  options: ScreenBroadcastOptions
): ScreenBroadcast {
  const {
    path,
    appGroupIdentifier,
    appAudio,
    mic,
    videoCodec,
    width,
    height,
    framerate,
    audioCodec,
    audioSampleRate,
  } = options;
  const url = session.url;

  const { state, lastError } = useNativeState<ScreenBroadcastState>(
    screenEmitter,
    'screenBroadcastStateChanged',
    ['broadcasting', 'connecting']
  );

  useEffect(() => {
    configureScreenBroadcast(url, {
      path,
      appGroupIdentifier,
      appAudio,
      mic,
      videoCodec,
      width,
      height,
      framerate,
      audioCodec,
      audioSampleRate,
    });
  }, [
    url,
    path,
    appGroupIdentifier,
    appAudio,
    mic,
    videoCodec,
    width,
    height,
    framerate,
    audioCodec,
    audioSampleRate,
  ]);

  // Stop the device-singleton broadcast when the last hook instance unmounts.
  useEffect(() => () => NativeMoQScreenBroadcast.stopScreenBroadcast(), []);

  const start = useCallback(
    () => NativeMoQScreenBroadcast.startScreenBroadcast(),
    []
  );
  const stop = useCallback(
    () => NativeMoQScreenBroadcast.stopScreenBroadcast(),
    []
  );

  return useMemo<ScreenBroadcast>(
    () => ({ state, lastError, start, stop }),
    [state, lastError, start, stop]
  );
}
