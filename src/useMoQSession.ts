import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeEventEmitter } from 'react-native';
import NativeMoq from './NativeMoq';
import type { MoQBroadcastInfo, MoQSession, MoQSessionState } from './types';

const moqEmitter = new NativeEventEmitter(NativeMoq);

export interface UseMoQSessionOptions {
  /** Track namespace prefix passed to MoQSession. Defaults to `''`. */
  prefix?: string;
  /** Default target buffering latency in milliseconds for new players. Defaults to `200`. */
  targetLatencyMs?: number;
}

export function useMoQSession(
  url: string,
  options: UseMoQSessionOptions = {}
): MoQSession {
  const { prefix = '', targetLatencyMs = 200 } = options;

  const [sessionState, setSessionState] = useState<MoQSessionState>('idle');
  const [broadcasts, setBroadcasts] = useState<MoQBroadcastInfo[]>([]);

  const urlRef = useRef(url);
  const prefixRef = useRef(prefix);
  const latencyRef = useRef(targetLatencyMs);
  urlRef.current = url;
  prefixRef.current = prefix;
  latencyRef.current = targetLatencyMs;

  useEffect(() => {
    const subs = [
      moqEmitter.addListener('sessionStateChanged', (event) => {
        const { state } = event as { state: string };
        setSessionState(state as MoQSessionState);
      }),

      moqEmitter.addListener('broadcastAvailable', (event) => {
        const info = event as MoQBroadcastInfo;
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
      NativeMoq.disconnect();
    };
  }, []);

  const connect = useCallback(() => {
    NativeMoq.connect(urlRef.current, prefixRef.current, latencyRef.current);
  }, []);

  const disconnect = useCallback(() => {
    NativeMoq.disconnect();
    setSessionState('idle');
    setBroadcasts([]);
  }, []);

  return { sessionState, broadcasts, connect, disconnect };
}
