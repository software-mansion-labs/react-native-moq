import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeEventEmitter } from 'react-native';
import { EventEmitter } from '../EventEmitter';
import NativeMoQ from '../native/NativeMoQ';
import type { Session, SessionEvents, SessionState } from '../types';

const moqEmitter = new NativeEventEmitter(NativeMoQ);

let nextSessionId = 1;
function mintSessionId(): string {
  // Native maps are keyed by this string.
  return `s${nextSessionId++}`;
}

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

  useEffect(() => {
    const emitter = emitterRef.current;
    const sub = moqEmitter.addListener('sessionStateChanged', (event) => {
      const e = event as { sessionId: string; state: string };
      if (e.sessionId !== id) return;
      const typedState = e.state as SessionState;
      setState(typedState);
      emitter.emit('stateChange', { state: typedState });
    });

    return () => {
      sub.remove();
      NativeMoQ.disconnect(id);
    };
  }, [id]);

  const connect = useCallback(
    (targetLatencyMs = 200) => {
      NativeMoQ.connect(id, urlRef.current, targetLatencyMs);
    },
    [id]
  );

  const disconnect = useCallback(() => {
    NativeMoQ.disconnect(id);
    setState('idle');
  }, [id]);

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
