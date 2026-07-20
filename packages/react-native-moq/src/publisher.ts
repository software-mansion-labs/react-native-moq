import { NativeEventEmitter } from 'react-native';
import { EventEmitter, type EventSubscription } from './EventEmitter';
import NativeMoQPublisher from './native/NativeMoQPublisher';
import type { CameraTrack } from './camera';
import type { MicrophoneTrack } from './microphone';
import type { DataTrack } from './dataTrack';
import type { AudioSourceTrack } from './audioSource';
import type { VideoSourceTrack } from './videoSource';
import type { Session } from './types';

const publisherEmitter = new NativeEventEmitter(NativeMoQPublisher);

export type PublisherState =
  'idle' | 'connecting' | 'publishing' | 'stopped' | `error:${string}`;

export type PublishedTrackState = 'idle' | 'starting' | 'active' | 'stopped';

export type PublishTrack =
  | CameraTrack
  | MicrophoneTrack
  | DataTrack
  | AudioSourceTrack
  | VideoSourceTrack;

export interface PublishOptions {
  path: string;
  // Snapshotted at this call; call publish() again to change the source set.
  tracks: PublishTrack[];
}

export type PublisherEvents = {
  stateChange: (event: { state: PublisherState }) => void;
  trackStateChange: (event: {
    name: string;
    state: PublishedTrackState;
    error?: string;
  }) => void;
};

export interface Publisher {
  readonly state: PublisherState;
  readonly trackStates: Record<string, PublishedTrackState>;
  readonly lastError: string | null;
  readonly emitter: EventEmitter<PublisherEvents>;
  addListener<TEventName extends keyof PublisherEvents>(
    eventName: TEventName,
    listener: PublisherEvents[TEventName]
  ): EventSubscription;
  publish(opts: PublishOptions): void;
  stop(): void;
}

/** Hook-free publisher; `destroy()` stops publishing and detaches listeners. */
export interface PublisherHandle extends Publisher {
  destroy(): void;
}

export interface SerializedTrack {
  type: 'camera' | 'microphone' | 'data' | 'audioSource' | 'videoSource';
  name: string;
  // Camera-only: which native capture source backs the track (see CameraSource).
  source?: string;
  // Data / audioSource / videoSource: id of the native source created by the owning hook.
  id?: string;
  // Absent for data tracks, which carry no encoder.
  encoder?: Record<string, unknown>;
}

// Exhaustive on __type so a new track kind fails to compile instead of being
// silently mis-routed. Exported for tests.
export function serializeTracks(tracks: PublishTrack[]): SerializedTrack[] {
  return tracks.map((t): SerializedTrack => {
    switch (t.__type) {
      case 'camera':
        return {
          type: 'camera',
          name: t.__name,
          source: t.__source,
          encoder: { ...t.encoder },
        };
      case 'data':
        return { type: 'data', name: t.__name, id: t.__id };
      case 'audioSource':
        return {
          type: 'audioSource',
          name: t.__name,
          id: t.__id,
          encoder: { ...t.encoder, channels: t.channels },
        };
      case 'videoSource':
        return {
          type: 'videoSource',
          name: t.__name,
          id: t.__id,
          encoder: { ...t.encoder },
        };
      case 'microphone':
        return { type: 'microphone', name: 'mic', encoder: { ...t.encoder } };
      default: {
        const unknown: never = t;
        throw new Error(`Unknown publish track: ${JSON.stringify(unknown)}`);
      }
    }
  });
}

/**
 * Imperative counterpart of `usePublisher` for non-React code. `state` /
 * `trackStates` / `lastError` are live getters; observe changes via
 * `addListener`.
 */
export function createPublisher(session: Session): PublisherHandle {
  return createPublisherWithEmitter(session.id, new EventEmitter());
}

// Internal: usePublisher supplies its stable emitter.
export function createPublisherWithEmitter(
  sessionId: string,
  emitter: EventEmitter<PublisherEvents>
): PublisherHandle {
  let state: PublisherState = 'idle';
  let trackStates: Record<string, PublishedTrackState> = {};
  let lastError: string | null = null;

  const stateSub = publisherEmitter.addListener(
    'publisherStateChanged',
    (event) => {
      const e = event as { sessionId: string; state: string };
      if (e.sessionId !== sessionId) return;
      const typedState = e.state as PublisherState;
      state = typedState;
      if (typedState.startsWith('error:')) {
        lastError = typedState.slice('error:'.length);
      } else if (typedState === 'idle') {
        trackStates = {};
      }
      emitter.emit('stateChange', { state: typedState });
    }
  );
  const trackSub = publisherEmitter.addListener(
    'publisherTrackStateChanged',
    (event) => {
      const e = event as {
        sessionId: string;
        name: string;
        state: PublishedTrackState;
        error?: string;
      };
      if (e.sessionId !== sessionId) return;
      trackStates = { ...trackStates, [e.name]: e.state };
      emitter.emit('trackStateChange', {
        name: e.name,
        state: e.state,
        error: e.error,
      });
    }
  );

  return {
    get state() {
      return state;
    },
    get trackStates() {
      return trackStates;
    },
    get lastError() {
      return lastError;
    },
    emitter,
    addListener: (eventName, listener) =>
      emitter.addListener(eventName, listener),
    publish(opts: PublishOptions) {
      lastError = null;
      const tracksJson = JSON.stringify(serializeTracks(opts.tracks));
      NativeMoQPublisher.publish(sessionId, opts.path, tracksJson);
    },
    stop() {
      NativeMoQPublisher.stop(sessionId);
    },
    destroy() {
      stateSub.remove();
      trackSub.remove();
      NativeMoQPublisher.stop(sessionId);
    },
  };
}
