import { useCallback, useEffect, useMemo, useState } from 'react';
import NativeMoQDataTrack from '../native/NativeMoQDataTrack';
import { createDataTrackWithId, mintDataTrackId } from '../dataTrack';
import type { DataTrack, DataTrackOptions } from '../dataTrack';

export type { DataTrack, DataTrackOptions } from '../dataTrack';

/**
 * A publishable data track — the data counterpart of useCamera / useMicrophone.
 * Owns a native emitter for its lifetime (created on mount, destroyed on
 * unmount). Pass it into `publisher.publish({ tracks: [dataTrack, …] })`, then
 * call `dataTrack.send(payload)` to push payloads to subscribers. Use it for
 * controller input, chat, telemetry, etc.
 */
export function useDataTrack(options: DataTrackOptions = {}): DataTrack {
  const name = options.name ?? 'data';
  const [id] = useState(() => mintDataTrackId());

  useEffect(() => {
    const track = createDataTrackWithId(id);
    return () => track.destroy();
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
