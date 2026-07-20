import { NativeEventEmitter } from 'react-native';
import type { Listenable } from './EventEmitter';
import NativeMoQScreenBroadcast from './native/NativeMoQScreenBroadcast';
import { createNativeStateHandle, type StateChangeEvents } from './nativeState';
import type { VideoCodec } from './camera';
import type { AudioCodec } from './microphone';
import type { Session } from './types';

// Shared with useScreenBroadcast so both observe the same native module.
export const screenEmitter = new NativeEventEmitter(NativeMoQScreenBroadcast);

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

export type ScreenBroadcastEvents = StateChangeEvents<ScreenBroadcastState>;

/** Hook-free screen broadcast; `destroy()` stops it and detaches listeners. */
export interface ScreenBroadcastHandle
  extends ScreenBroadcast, Listenable<ScreenBroadcastEvents> {
  destroy(): void;
}

// Applies the broadcast config to the out-of-process native side. Shared with
// useScreenBroadcast, which reconfigures whenever its options change.
export function configureScreenBroadcast(
  url: string,
  options: ScreenBroadcastOptions
): void {
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
}

/**
 * Imperative counterpart of `useScreenBroadcast` for non-React code.
 * Configuration is applied once at creation. Like the hook, the broadcast is a
 * device singleton running out-of-process; it opens its own connection from
 * the session's URL rather than reusing the host's MoQ session.
 */
export function createScreenBroadcast(
  session: Pick<Session, 'url'>,
  options: ScreenBroadcastOptions
): ScreenBroadcastHandle {
  configureScreenBroadcast(session.url, options);

  const watched = createNativeStateHandle<ScreenBroadcastState>(
    screenEmitter,
    'screenBroadcastStateChanged',
    ['broadcasting', 'connecting']
  );

  return {
    get state() {
      return watched.state;
    },
    get lastError() {
      return watched.lastError;
    },
    start: () => NativeMoQScreenBroadcast.startScreenBroadcast(),
    stop: () => NativeMoQScreenBroadcast.stopScreenBroadcast(),
    emitter: watched.emitter,
    addListener: watched.addListener,
    destroy() {
      watched.unwatch();
      NativeMoQScreenBroadcast.stopScreenBroadcast();
    },
  };
}
