import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeEventEmitter } from 'react-native';
import NativeMoQ from './NativeMoQ';
import type { MoQBroadcastInfo, MoQSession, MoQSessionState } from './types';
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

  useEffect(() => {
    const subs = [
      moqEmitter.addListener('sessionStateChanged', (event) => {
        const { state } = event as { state: string };
        setSessionState(state as MoQSessionState);
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
      }),

      moqEmitter.addListener('broadcastUnavailable', (event) => {
        const { path } = event as { path: string };
        setBroadcasts((prev) => prev.filter((b) => b.path !== path));
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
