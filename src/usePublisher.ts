import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NativeEventEmitter } from 'react-native';
import { EventEmitter, type EventSubscription } from './EventEmitter';
import NativeMoQPublisher from './NativeMoQPublisher';
import type { CameraTrack, VideoCodec } from './useCamera';
import type { AudioCodec, MicrophoneTrack } from './useMicrophone';
import type { Session } from './types';

const publisherEmitter = new NativeEventEmitter(NativeMoQPublisher);

export type PublisherState =
  | 'idle'
  | 'connecting'
  | 'publishing'
  | 'stopped'
  | `error:${string}`;

export type ScreenBroadcastState =
  | 'idle'
  | 'connecting'
  | 'broadcasting'
  | 'stopped'
  | `error:${string}`;

export type PublishedTrackState = 'idle' | 'starting' | 'active' | 'stopped';

export type PublishTrack = CameraTrack | MicrophoneTrack;

export interface PublishOptions {
  path: string;
  // Snapshotted at this call — changing the array later does not affect a
  // running broadcast. To change the published source set, call publish() again
  // (which restarts the broadcast).
  tracks: PublishTrack[];
}

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

export type PublisherEvents = {
  stateChange: (event: { state: PublisherState }) => void;
  trackStateChange: (event: {
    name: string;
    state: PublishedTrackState;
    error?: string;
  }) => void;
  screenBroadcastStateChange: (event: { state: ScreenBroadcastState }) => void;
};

export interface Publisher {
  readonly state: PublisherState;
  readonly trackStates: Record<string, PublishedTrackState>;
  readonly lastError: string | null;
  readonly screenBroadcastState: ScreenBroadcastState;
  readonly emitter: EventEmitter<PublisherEvents>;
  addListener<TEventName extends keyof PublisherEvents>(
    eventName: TEventName,
    listener: PublisherEvents[TEventName]
  ): EventSubscription;
  publish(opts: PublishOptions): void;
  stop(): void;
  // Persist the screen-broadcast config. On iOS this writes to the App Group
  // descriptor store so the Broadcast Upload Extension can read it on launch.
  // On Android this caches it for the next startScreenBroadcast() call.
  configureScreenBroadcast(opts: ScreenBroadcastOptions): void;
  // Android-only: starts the foreground MediaProjection service. On iOS this
  // rejects — the user must tap the <BroadcastPickerView/> to start.
  startScreenBroadcast(): Promise<void>;
  stopScreenBroadcast(): void;
}

interface SerializedTrack {
  type: 'camera' | 'microphone';
  name: string;
  encoder: Record<string, unknown>;
}

function serializeTracks(tracks: PublishTrack[]): SerializedTrack[] {
  return tracks.map((t) => {
    if (t.__type === 'camera') {
      return { type: 'camera', name: 'camera', encoder: { ...t.encoder } };
    }
    return { type: 'microphone', name: 'mic', encoder: { ...t.encoder } };
  });
}

export function usePublisher(session: Session): Publisher {
  const [state, setState] = useState<PublisherState>('idle');
  const [trackStates, setTrackStates] = useState<
    Record<string, PublishedTrackState>
  >({});
  const [lastError, setLastError] = useState<string | null>(null);
  const [screenBroadcastState, setScreenBroadcastState] =
    useState<ScreenBroadcastState>('idle');

  // Screen broadcast runs out-of-process (iOS Broadcast Upload Extension /
  // Android foreground service), so it can't reuse the host's session — it
  // opens its own MoQ connection using the session's URL.
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const sessionId = session.id;

  const emitterRef = useRef(new EventEmitter<PublisherEvents>());

  useEffect(() => {
    const emitter = emitterRef.current;
    const stateSub = publisherEmitter.addListener(
      'publisherStateChanged',
      (event) => {
        const e = event as { sessionId: string; state: string };
        if (e.sessionId !== sessionId) return;
        const typedState = e.state as PublisherState;
        setState(typedState);
        if (typedState.startsWith('error:')) {
          setLastError(typedState.slice('error:'.length));
        } else if (typedState === 'idle') {
          setTrackStates({});
        }
        emitter.emit('stateChange', { state: typedState });
      }
    );
    const trackSub = publisherEmitter.addListener(
      'publisherTrackStateChanged',
      (event) => {
        const e = event as {
          sessionId: string;
          name: string;
          state: PublishedTrackState;
          error?: string;
        };
        if (e.sessionId !== sessionId) return;
        setTrackStates((prev) => ({ ...prev, [e.name]: e.state }));
        emitter.emit('trackStateChange', {
          name: e.name,
          state: e.state,
          error: e.error,
        });
      }
    );
    // Screen broadcast is currently single-instance per device (one
    // ReplayKit / MediaProjection session at a time), so it is not
    // session-scoped.
    const screenSub = publisherEmitter.addListener(
      'screenBroadcastStateChanged',
      (event) => {
        const { state: rawState } = event as { state: string };
        const typedState = rawState as ScreenBroadcastState;
        setScreenBroadcastState(typedState);
        emitter.emit('screenBroadcastStateChange', { state: typedState });
      }
    );

    return () => {
      stateSub.remove();
      trackSub.remove();
      screenSub.remove();
      NativeMoQPublisher.stop(sessionId);
      NativeMoQPublisher.stopScreenBroadcast();
    };
  }, [sessionId]);

  const publish = useCallback(
    (opts: PublishOptions) => {
      setLastError(null);
      const tracksJson = JSON.stringify(serializeTracks(opts.tracks));
      NativeMoQPublisher.publish(sessionId, opts.path, tracksJson);
    },
    [sessionId]
  );

  const stop = useCallback(() => {
    NativeMoQPublisher.stop(sessionId);
  }, [sessionId]);

  const configureScreenBroadcast = useCallback(
    (opts: ScreenBroadcastOptions) => {
      NativeMoQPublisher.configureScreenBroadcast(
        sessionRef.current.url,
        JSON.stringify(opts)
      );
    },
    []
  );

  const startScreenBroadcast = useCallback(
    () => NativeMoQPublisher.startScreenBroadcast(),
    []
  );

  const stopScreenBroadcast = useCallback(() => {
    NativeMoQPublisher.stopScreenBroadcast();
  }, []);

  const addListener = useCallback(
    <TEventName extends keyof PublisherEvents>(
      eventName: TEventName,
      listener: PublisherEvents[TEventName]
    ) => emitterRef.current.addListener(eventName, listener),
    []
  );

  return useMemo(
    () => ({
      state,
      trackStates,
      lastError,
      screenBroadcastState,
      emitter: emitterRef.current,
      addListener,
      publish,
      stop,
      configureScreenBroadcast,
      startScreenBroadcast,
      stopScreenBroadcast,
    }),
    [
      state,
      trackStates,
      lastError,
      screenBroadcastState,
      addListener,
      publish,
      stop,
      configureScreenBroadcast,
      startScreenBroadcast,
      stopScreenBroadcast,
    ]
  );
}
