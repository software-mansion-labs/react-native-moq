import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NativeEventEmitter } from 'react-native';
import { EventEmitter, type EventSubscription } from './EventEmitter';
import NativeMoQPublisher from './NativeMoQPublisher';

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

export type VideoCodec = 'h264' | 'h265';
export type AudioCodec = 'opus' | 'aac';

export interface SupportedCodecs {
  video: VideoCodec[];
  audio: AudioCodec[];
}

// Synchronous query for codecs whose encoder can actually be initialized on
// this device. Use this to gate codec picker options in publishing UI —
// otherwise selecting an unsupported codec silently terminates the broadcast
// on Android (moq-kit reports the failure as a clean stop).
export function getSupportedCodecs(): SupportedCodecs {
  const result = NativeMoQPublisher.getSupportedCodecs();
  return {
    video: (result.video as VideoCodec[]) ?? [],
    audio: (result.audio as AudioCodec[]) ?? [],
  };
}

export interface PublishOptions {
  path: string;
  cameraEnabled?: boolean;
  micEnabled?: boolean;
  videoCodec?: VideoCodec;
  width?: number;
  height?: number;
  framerate?: number;
  audioCodec?: AudioCodec;
  audioSampleRate?: number;
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
  flipCamera(): void;
  // Persist the screen-broadcast config. On iOS this writes to the App Group
  // descriptor store so the Broadcast Upload Extension can read it on launch.
  // On Android this caches it for the next startScreenBroadcast() call.
  configureScreenBroadcast(opts: ScreenBroadcastOptions): void;
  // Android-only: starts the foreground MediaProjection service. On iOS this
  // rejects — the user must tap the <BroadcastPickerView/> to start.
  startScreenBroadcast(): Promise<void>;
  stopScreenBroadcast(): void;
}

export function usePublisher(url: string): Publisher {
  const [state, setState] = useState<PublisherState>('idle');
  const [trackStates, setTrackStates] = useState<
    Record<string, PublishedTrackState>
  >({});
  const [lastError, setLastError] = useState<string | null>(null);
  const [screenBroadcastState, setScreenBroadcastState] =
    useState<ScreenBroadcastState>('idle');

  const urlRef = useRef(url);
  urlRef.current = url;

  const emitterRef = useRef(new EventEmitter<PublisherEvents>());

  useEffect(() => {
    const emitter = emitterRef.current;
    const stateSub = publisherEmitter.addListener(
      'publisherStateChanged',
      (event) => {
        const { state: rawState } = event as { state: string };
        const typedState = rawState as PublisherState;
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
        const {
          name,
          state: trackState,
          error,
        } = event as {
          name: string;
          state: PublishedTrackState;
          error?: string;
        };
        setTrackStates((prev) => ({ ...prev, [name]: trackState }));
        emitter.emit('trackStateChange', { name, state: trackState, error });
      }
    );
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
      NativeMoQPublisher.stop();
      NativeMoQPublisher.stopScreenBroadcast();
    };
  }, []);

  const publish = useCallback((opts: PublishOptions) => {
    setLastError(null);
    const { path, ...rest } = opts;
    NativeMoQPublisher.publish(urlRef.current, path, JSON.stringify(rest));
  }, []);

  const stop = useCallback(() => {
    NativeMoQPublisher.stop();
  }, []);

  const flipCamera = useCallback(() => {
    NativeMoQPublisher.flipCamera();
  }, []);

  const configureScreenBroadcast = useCallback(
    (opts: ScreenBroadcastOptions) => {
      NativeMoQPublisher.configureScreenBroadcast(
        urlRef.current,
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
      flipCamera,
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
      flipCamera,
      configureScreenBroadcast,
      startScreenBroadcast,
      stopScreenBroadcast,
    ]
  );
}
