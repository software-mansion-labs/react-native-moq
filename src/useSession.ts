import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeEventEmitter } from 'react-native';
import NativeMoQ from './NativeMoQ';
import type { MoQBroadcastInfo, MoQSession, MoQSessionState } from './types';
import { MoQPlayerHandle } from './types';

const moqEmitter = new NativeEventEmitter(NativeMoQ);

export interface UseSessionOptions {
  /** Track namespace prefix passed to MoQSession. Defaults to `''`. */
  prefix?: string;
  /** Default target buffering latency in milliseconds for new players. Defaults to `200`. */
  targetLatencyMs?: number;
}

export function useSession(
  url: string,
  options: UseSessionOptions = {}
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

  const connect = useCallback(() => {
    NativeMoQ.connect(urlRef.current, prefixRef.current, latencyRef.current);
  }, []);

  const disconnect = useCallback(() => {
    NativeMoQ.disconnect();
    setSessionState('idle');
    setBroadcasts([]);
  }, []);

  return { sessionState, broadcasts, connect, disconnect };
}
