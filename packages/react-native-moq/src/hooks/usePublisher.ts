import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EventEmitter } from '../EventEmitter';
import {
  createPublisherWithEmitter,
  type Publisher,
  type PublisherEvents,
  type PublisherHandle,
  type PublisherState,
  type PublishOptions,
  type PublishedTrackState,
} from '../publisher';
import type { Session } from '../types';

export type {
  Publisher,
  PublisherEvents,
  PublisherState,
  PublishOptions,
  PublishTrack,
  PublishedTrackState,
} from '../publisher';

export function usePublisher(session: Session): Publisher {
  const [state, setState] = useState<PublisherState>('idle');
  const [trackStates, setTrackStates] = useState<
    Record<string, PublishedTrackState>
  >({});
  const [lastError, setLastError] = useState<string | null>(null);

  const sessionId = session.id;

  const emitterRef = useRef(new EventEmitter<PublisherEvents>());
  const handleRef = useRef<PublisherHandle | null>(null);

  useEffect(() => {
    const emitter = emitterRef.current;
    const handle = createPublisherWithEmitter(sessionId, emitter);
    handleRef.current = handle;
    // The handle updates its fields before emitting, so mirroring on either
    // event reads a consistent snapshot.
    const mirror = () => {
      setState(handle.state);
      setTrackStates(handle.trackStates);
      setLastError(handle.lastError);
    };
    const subs = [
      emitter.addListener('stateChange', mirror),
      emitter.addListener('trackStateChange', mirror),
    ];

    return () => {
      subs.forEach((s) => s.remove());
      handleRef.current = null;
      handle.destroy();
    };
  }, [sessionId]);

  const publish = useCallback((opts: PublishOptions) => {
    setLastError(null);
    handleRef.current?.publish(opts);
  }, []);

  const stop = useCallback(() => {
    handleRef.current?.stop();
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
      emitter: emitterRef.current,
      addListener,
      publish,
      stop,
    }),
    [state, trackStates, lastError, addListener, publish, stop]
  );
}
