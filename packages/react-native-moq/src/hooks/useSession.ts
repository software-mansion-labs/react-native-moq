import { useCallback, useEffect, useRef, useState } from 'react';
import { EventEmitter } from '../EventEmitter';
import {
  createSessionWithId,
  mintSessionId,
  type SessionHandle,
} from '../session';
import type { Session, SessionEvents, SessionState } from '../types';

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

  const disconnect = useCallback(() => {
    handleRef.current?.disconnect();
    setState('idle');
  }, []);

  const addListener = useCallback(
    <TEventName extends keyof SessionEvents>(
      eventName: TEventName,
      listener: SessionEvents[TEventName]
    ) => emitterRef.current.addListener(eventName, listener),
    []
  );

  const moqSession: Session = {
    id,
    url,
    state,
    emitter: emitterRef.current,
    addListener,
    connect,
    disconnect,
  };

  const moqSessionRef = useRef(moqSession);
  moqSessionRef.current = moqSession;

  const setupRef = useRef(setup);

  useEffect(() => {
    setupRef.current?.(moqSessionRef.current);
  }, []);

  return moqSession;
}
