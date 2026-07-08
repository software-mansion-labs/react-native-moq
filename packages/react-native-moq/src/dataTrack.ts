import NativeMoQDataTrack from './native/NativeMoQDataTrack';

// Unique id per instance so the native emitter registry can address it
// independently of the track name (two tracks may share the default "data").
let nextDataTrackId = 0;

// Internal: useDataTrack mints its id up front so it survives StrictMode
// remounts.
export function mintDataTrackId(): string {
  return `data-${nextDataTrackId++}`;
}

export interface DataTrackOptions {
  // Track name in the broadcast catalog. Defaults to "data".
  name?: string;
}

export interface DataTrack {
  // Internal discriminator: the publisher routes to addDataTrack.
  readonly __type: 'data';
  readonly __name: string;
  readonly __id: string;
  // Sends one UTF-8 string payload on the track. No-op until the owning
  // publisher has published and started; delivered in call order.
  send(payload: string): void;
}

/** Hook-free data track; `destroy()` releases the native emitter. */
export interface DataTrackHandle extends DataTrack {
  destroy(): void;
}

/**
 * Imperative counterpart of `useDataTrack` for non-React code. Owns a native
 * emitter until `destroy()`. Pass it into
 * `publisher.publish({ tracks: [dataTrack, …] })`, then call `send(payload)`.
 */
export function createDataTrack(
  options: DataTrackOptions = {}
): DataTrackHandle {
  return createDataTrackWithId(mintDataTrackId(), options);
}

// Internal: useDataTrack supplies its pre-minted id.
export function createDataTrackWithId(
  id: string,
  options: DataTrackOptions = {}
): DataTrackHandle {
  const name = options.name ?? 'data';
  NativeMoQDataTrack.create(id);
  return {
    __type: 'data',
    __name: name,
    __id: id,
    send: (payload) => NativeMoQDataTrack.send(id, payload),
    destroy: () => NativeMoQDataTrack.destroy(id),
  };
}
