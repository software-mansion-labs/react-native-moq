import { useCallback, useEffect, useMemo, useState } from 'react';
import NativeMoQDataTrack from '../native/NativeMoQDataTrack';

// Process-wide counter giving each useDataTrack instance a stable, unique id so
// the native emitter registry can address it independently of the track name
// (two tracks may share the default name "data").
let nextDataTrackId = 0;

export interface DataTrackOptions {
  // Track name in the broadcast catalog — what subscribers read from.
  // Defaults to "data".
  name?: string;
}

export interface DataTrack {
  // Discriminator used by usePublisher to route to addDataTrack natively.
  readonly __type: 'data';
  readonly __name: string;
  readonly __id: string;
  // Sends one UTF-8 string payload (e.g. a JSON message) on the track. No-op
  // until the owning publisher has published and started; payloads are
  // delivered in call order.
  send(payload: string): void;
}

/**
 * A publishable **data track** — the data counterpart of useCamera /
 * useMicrophone. It owns a native emitter for its whole lifetime (created on
 * mount, destroyed on unmount); pass it into
 * `publisher.publish({ tracks: [dataTrack, …] })` to include it in a broadcast
 * alongside camera/microphone tracks, then call `dataTrack.send(payload)` to
 * push payloads to subscribers.
 *
 * Mirrors MoQKit's model: a standalone `DataTrackEmitter` handed to
 * `Publisher.addDataTrack`. Use it for controller input, chat, telemetry, etc.
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
