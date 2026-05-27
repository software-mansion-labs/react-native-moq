import { useCallback, useEffect, useMemo, useState } from 'react';
import { NativeEventEmitter } from 'react-native';
import NativeMoQScreenBroadcast from './NativeMoQScreenBroadcast';
import type { VideoCodec } from './useCamera';
import type { AudioCodec } from './useMicrophone';
import type { Session } from './types';

const screenEmitter = new NativeEventEmitter(NativeMoQScreenBroadcast);

export type ScreenBroadcastState =
  | 'idle'
  | 'connecting'
  | 'broadcasting'
  | 'stopped'
  | `error:${string}`;

export interface ScreenBroadcastOptions {
  path: string;
  // iOS-only. Must match the App Group entitlement on both the host app and
  // the Broadcast Upload Extension target. Required on iOS, ignored on Android.
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
// Android foreground service), so it doesn't reuse the host's MoQ session — it
// opens its own connection using the session's URL. We still take a Session
// rather than a raw URL to keep the API symmetric with usePublisher.
//
// Reconfigures the native side whenever URL or any option changes. On iOS this
// rewrites the App Group descriptor the extension reads at launch; on Android
// it caches the config for the next start() call. Screen broadcast is a device
// singleton (one ReplayKit / MediaProjection session at a time), so state is
// not session-scoped — multiple hook instances will observe the same state.
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

  const [state, setState] = useState<ScreenBroadcastState>('idle');
  const [lastError, setLastError] = useState<string | null>(null);

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

  useEffect(() => {
    const sub = screenEmitter.addListener(
      'screenBroadcastStateChanged',
      (event) => {
        const { state: rawState } = event as { state: string };
        const next = rawState as ScreenBroadcastState;
        setState(next);
        if (next.startsWith('error:')) {
          setLastError(next.slice('error:'.length));
        } else if (next === 'broadcasting' || next === 'connecting') {
          setLastError(null);
        }
      }
    );
    return () => {
      sub.remove();
      NativeMoQScreenBroadcast.stopScreenBroadcast();
    };
  }, []);

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
