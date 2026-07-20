import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EventEmitter } from '../EventEmitter';
import {
  createSessionWithId,
  mintSessionId,
  type SessionHandle,
} from '../session';
import type { Session, SessionEvents, SessionState } from '../types';
import { useSetupOnce } from './useSetupOnce';

export function useSession(
  url: string,
  setup?: (session: Session) => void
): Session {
  const [state, setState] = useState<SessionState>('idle');

  const idRef = useRef<string | null>(null);
  if (idRef.current === null) idRef.current = mintSessionId();
  const id = idRef.current;

  const urlRef = useRef(url);
  urlRef.current = url;

  const emitterRef = useRef(new EventEmitter<SessionEvents>());
  const handleRef = useRef<SessionHandle | null>(null);

  useEffect(() => {
    const handle = createSessionWithId(id, urlRef.current, emitterRef.current);
    handleRef.current = handle;
    const sub = emitterRef.current.addListener('stateChange', (e) =>
      setState(e.state)
    );
    return () => {
      sub.remove();
      handleRef.current = null;
      handle.destroy();
    };
  }, [id]);

  const connect = useCallback((targetLatencyMs = 200) => {
    const handle = handleRef.current;
    if (!handle) return;
    handle.url = urlRef.current;
    handle.connect(targetLatencyMs);
  }, []);

  // The handle emits the synthetic 'idle' transition; the stateChange
  // listener above mirrors it into React state.
  const disconnect = useCallback(() => {
    handleRef.current?.disconnect();
  }, []);

  const addListener = useCallback(
    <TEventName extends keyof SessionEvents>(
      eventName: TEventName,
      listener: SessionEvents[TEventName]
    ) => emitterRef.current.addListener(eventName, listener),
    []
  );

  const moqSession = useMemo<Session>(
    () => ({
      id,
      url,
      state,
      emitter: emitterRef.current,
      addListener,
      connect,
      disconnect,
    }),
    [id, url, state, addListener, connect, disconnect]
  );

  useSetupOnce(moqSession, setup);

  return moqSession;
}
