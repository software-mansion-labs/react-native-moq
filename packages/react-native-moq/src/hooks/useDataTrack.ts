import { useCallback, useEffect, useMemo, useState } from 'react';
import NativeMoQDataTrack from '../native/NativeMoQDataTrack';

// Unique id per instance so the native emitter registry can address it
// independently of the track name (two tracks may share the default "data").
let nextDataTrackId = 0;

export interface DataTrackOptions {
  // Track name in the broadcast catalog. Defaults to "data".
  name?: string;
}

export interface DataTrack {
  // Internal discriminator: usePublisher routes to addDataTrack.
  readonly __type: 'data';
  readonly __name: string;
  readonly __id: string;
  // Sends one UTF-8 string payload on the track. No-op until the owning
  // publisher has published and started; delivered in call order.
  send(payload: string): void;
}

/**
 * A publishable data track — the data counterpart of useCamera / useMicrophone.
 * Owns a native emitter for its lifetime (created on mount, destroyed on
 * unmount). Pass it into `publisher.publish({ tracks: [dataTrack, …] })`, then
 * call `dataTrack.send(payload)` to push payloads to subscribers. Use it for
 * controller input, chat, telemetry, etc.
 */
export function useDataTrack(options: DataTrackOptions = {}): DataTrack {
  const name = options.name ?? 'data';
  const [id] = useState(() => `data-${nextDataTrackId++}`);

  useEffect(() => {
    NativeMoQDataTrack.create(id);
    return () => NativeMoQDataTrack.destroy(id);
  }, [id]);

  const send = useCallback(
    (payload: string) => {
      NativeMoQDataTrack.send(id, payload);
    },
    [id]
  );

  return useMemo<DataTrack>(
    () => ({ __type: 'data', __name: name, __id: id, send }),
    [name, id, send]
  );
}
