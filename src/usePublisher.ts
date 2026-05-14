import { useCallback, useEffect, useRef, useState } from 'react';
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

export type PublishedTrackState = 'idle' | 'starting' | 'active' | 'stopped';

export type VideoCodec = 'h264' | 'h265';
export type AudioCodec = 'opus' | 'aac';

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

export type PublisherEvents = {
  stateChange: (event: { state: PublisherState }) => void;
  trackStateChange: (event: {
    name: string;
    state: PublishedTrackState;
    error?: string;
  }) => void;
};

export interface Publisher {
  readonly state: PublisherState;
  readonly trackStates: Record<string, PublishedTrackState>;
  readonly lastError: string | null;
  readonly emitter: EventEmitter<PublisherEvents>;
  addListener<TEventName extends keyof PublisherEvents>(
    eventName: TEventName,
    listener: PublisherEvents[TEventName]
  ): EventSubscription;
  publish(opts: PublishOptions): void;
  stop(): void;
  flipCamera(): void;
}

export function usePublisher(url: string): Publisher {
  const [state, setState] = useState<PublisherState>('idle');
  const [trackStates, setTrackStates] = useState<
    Record<string, PublishedTrackState>
  >({});
  const [lastError, setLastError] = useState<string | null>(null);

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
          setLastError(null);
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

    return () => {
      stateSub.remove();
      trackSub.remove();
      NativeMoQPublisher.stop();
    };
  }, []);

  const publish = useCallback((opts: PublishOptions) => {
    const { path, ...rest } = opts;
    NativeMoQPublisher.publish(urlRef.current, path, JSON.stringify(rest));
  }, []);

  const stop = useCallback(() => {
    NativeMoQPublisher.stop();
  }, []);

  const flipCamera = useCallback(() => {
    NativeMoQPublisher.flipCamera();
  }, []);

  const addListener = useCallback(
    <TEventName extends keyof PublisherEvents>(
      eventName: TEventName,
      listener: PublisherEvents[TEventName]
    ) => emitterRef.current.addListener(eventName, listener),
    []
  );

  return {
    state,
    trackStates,
    lastError,
    emitter: emitterRef.current,
    addListener,
    publish,
    stop,
    flipCamera,
  };
}
