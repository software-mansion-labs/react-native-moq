import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeEventEmitter } from 'react-native';
import { EventEmitter } from './EventEmitter';
import NativeMoQ from './NativeMoQ';
import type {
  MoQBroadcastInfo,
  MoQSession,
  MoQSessionEvents,
  MoQSessionState,
} from './types';
import { MoQPlayerHandle } from './types';

const moqEmitter = new NativeEventEmitter(NativeMoQ);

export function useSession(
  url: string,
  setup?: (session: MoQSession) => void
): MoQSession {
  const [sessionState, setSessionState] = useState<MoQSessionState>('idle');
  const [broadcasts, setBroadcasts] = useState<MoQBroadcastInfo[]>([]);

  const urlRef = useRef(url);
  urlRef.current = url;

  const emitterRef = useRef(new EventEmitter<MoQSessionEvents>());

  useEffect(() => {
    const emitter = emitterRef.current;
    const subs = [
      moqEmitter.addListener('sessionStateChanged', (event) => {
        const { state } = event as { state: string };
        const typedState = state as MoQSessionState;
        setSessionState(typedState);
        emitter.emit('stateChange', { state: typedState });
      }),

      moqEmitter.addListener('broadcastAvailable', (event) => {
        const raw = event as Omit<MoQBroadcastInfo, 'player'> & {
          initialVideoTrackName?: string;
          initialAudioTrackName?: string;
        };
        // getPlayer is provided by the C++ TurboModule override on iOS and
        // returns a JSI HostObject.  On Android it is undefined so the handle
        // falls back to bridge calls keyed by broadcastPath.
        const native = (NativeMoQ as any).getPlayer?.(raw.path);
        const player = new MoQPlayerHandle(
          raw.path,
          native,
          raw.initialVideoTrackName,
          raw.initialAudioTrackName
        );
        const info: MoQBroadcastInfo = { ...raw, player };
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

  const moqSession: MoQSession = {
    sessionState,
    broadcasts,
    emitter: emitterRef.current,
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
