import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeEventEmitter } from 'react-native';
import { EventEmitter } from './EventEmitter';
import NativeMoQ from './NativeMoQ';
import type {
  BroadcastInfo,
  Session,
  SessionEvents,
  SessionState,
} from './types';
import { PlayerHandle } from './types';

const moqEmitter = new NativeEventEmitter(NativeMoQ);

export function useSession(
  url: string,
  setup?: (session: Session) => void
): Session {
  const [sessionState, setSessionState] = useState<SessionState>('idle');
  const [broadcasts, setBroadcasts] = useState<BroadcastInfo[]>([]);

  const urlRef = useRef(url);
  urlRef.current = url;

  const emitterRef = useRef(new EventEmitter<SessionEvents>());

  useEffect(() => {
    const emitter = emitterRef.current;
    const subs = [
      moqEmitter.addListener('sessionStateChanged', (event) => {
        const { state } = event as { state: string };
        const typedState = state as SessionState;
        setSessionState(typedState);
        emitter.emit('stateChange', { state: typedState });
      }),

      moqEmitter.addListener('broadcastAvailable', (event) => {
        const raw = event as Omit<BroadcastInfo, 'player'> & {
          initialVideoTrackName?: string;
          initialAudioTrackName?: string;
        };
        // getPlayer is provided by the C++ TurboModule override on iOS and
        // returns a JSI HostObject.  On Android it is undefined so the handle
        // falls back to bridge calls keyed by broadcastPath.
        const native = (NativeMoQ as any).getPlayer?.(raw.path);
        const player = new PlayerHandle(
          raw.path,
          native,
          raw.initialVideoTrackName,
          raw.initialAudioTrackName
        );
        const info: BroadcastInfo = { ...raw, player };
        setBroadcasts((prev) => [
          ...prev.filter((b) => b.path !== info.path),
          info,
        ]);
        emitter.emit('broadcastAvailable', info);
      }),

      moqEmitter.addListener('broadcastUnavailable', (event) => {
        const { path } = event as { path: string };
        setBroadcasts((prev) => prev.filter((b) => b.path !== path));
        emitter.emit('broadcastUnavailable', { path });
      }),
    ];

    return () => {
      subs.forEach((s) => s.remove());
      NativeMoQ.disconnect();
    };
  }, []);

  const connect = useCallback((prefix = '', targetLatencyMs = 200) => {
    NativeMoQ.connect(urlRef.current, prefix, targetLatencyMs);
  }, []);

  const disconnect = useCallback(() => {
    NativeMoQ.disconnect();
    setSessionState('idle');
    setBroadcasts([]);
  }, []);

  const addListener = useCallback(
    <TEventName extends keyof SessionEvents>(
      eventName: TEventName,
      listener: SessionEvents[TEventName]
    ) => emitterRef.current.addListener(eventName, listener),
    []
  );

  const moqSession: Session = {
    sessionState,
    broadcasts,
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
