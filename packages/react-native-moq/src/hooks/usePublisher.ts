import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NativeEventEmitter } from 'react-native';
import { EventEmitter, type EventSubscription } from '../EventEmitter';
import NativeMoQPublisher from '../native/NativeMoQPublisher';
import type { CameraTrack } from './useCamera';
import type { MicrophoneTrack } from './useMicrophone';
import type { DataTrack } from './useDataTrack';
import type { AudioSourceTrack } from './useAudioSource';
import type { VideoSourceTrack } from './useVideoSource';
import type { Session } from '../types';

const publisherEmitter = new NativeEventEmitter(NativeMoQPublisher);

export type PublisherState =
  | 'idle'
  | 'connecting'
  | 'publishing'
  | 'stopped'
  | `error:${string}`;

export type PublishedTrackState = 'idle' | 'starting' | 'active' | 'stopped';

export type PublishTrack =
  | CameraTrack
  | MicrophoneTrack
  | DataTrack
  | AudioSourceTrack
  | VideoSourceTrack;

export interface PublishOptions {
  path: string;
  // Snapshotted at this call; call publish() again to change the source set.
  tracks: PublishTrack[];
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
}

interface SerializedTrack {
  type: 'camera' | 'microphone' | 'data' | 'audioSource' | 'videoSource';
  name: string;
  // Camera-only: which native capture source backs the track (see CameraSource).
  source?: string;
  // Data / audioSource / videoSource: id of the native source created by the owning hook.
  id?: string;
  // Absent for data tracks, which carry no encoder.
  encoder?: Record<string, unknown>;
}

function serializeTracks(tracks: PublishTrack[]): SerializedTrack[] {
  return tracks.map((t) => {
    if (t.__type === 'camera') {
      return {
        type: 'camera',
        name: t.__name,
        source: t.__source,
        encoder: { ...t.encoder },
      };
    }
    if (t.__type === 'data') {
      return { type: 'data', name: t.__name, id: t.__id };
    }
    if (t.__type === 'audioSource') {
      return {
        type: 'audioSource',
        name: t.__name,
        id: t.__id,
        encoder: { ...t.encoder, channels: t.channels },
      };
    }
    if (t.__type === 'videoSource') {
      return {
        type: 'videoSource',
        name: t.__name,
        id: t.__id,
        encoder: { ...t.encoder },
      };
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

    return () => {
      stateSub.remove();
      trackSub.remove();
      NativeMoQPublisher.stop(sessionId);
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
      emitter: emitterRef.current,
      addListener,
      publish,
      stop,
    }),
    [state, trackStates, lastError, addListener, publish, stop]
  );
}
