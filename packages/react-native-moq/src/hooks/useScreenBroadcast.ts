import { useCallback, useEffect, useMemo } from 'react';
import { NativeEventEmitter } from 'react-native';
import NativeMoQScreenBroadcast from '../native/NativeMoQScreenBroadcast';
import type { VideoCodec } from './useCamera';
import type { AudioCodec } from './useMicrophone';
import { useNativeState } from './useNativeState';
import type { Session } from '../types';

const screenEmitter = new NativeEventEmitter(NativeMoQScreenBroadcast);

export type ScreenBroadcastState =
  | 'idle'
  | 'connecting'
  | 'broadcasting'
  | 'stopped'
  | `error:${string}`;

export interface ScreenBroadcastOptions {
  path: string;
  // iOS-only: must match the App Group entitlement on the host app and the
  // Broadcast Upload Extension target. Ignored on Android.
  appGroupIdentifier?: string;
  // iOS-only: capture app audio (RPSampleBufferType.audioApp). Defaults true.
  appAudio?: boolean;
  // Capture mic alongside the screen. Defaults true.
  mic?: boolean;
  videoCodec?: VideoCodec;
  width?: number;
  height?: number;
  framerate?: number;
  audioCodec?: AudioCodec;
  audioSampleRate?: number;
}

export interface ScreenBroadcast {
  readonly state: ScreenBroadcastState;
  readonly lastError: string | null;
  // Android-only: starts the foreground MediaProjection service. On iOS this
  // rejects — the user must tap the <BroadcastPickerView/> to start.
  start(): Promise<void>;
  stop(): void;
}

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
    NativeMoQScreenBroadcast.configureScreenBroadcast(
      url,
      JSON.stringify({
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
      })
    );
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
