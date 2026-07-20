import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../native/NativeMoQ', () => ({
  __esModule: true,
  default: {
    addListener: jest.fn(),
    removeListeners: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
  },
}));

import { DeviceEventEmitter } from 'react-native';
import NativeMoQ from '../native/NativeMoQ';
import { subscribeBroadcasts } from '../broadcasts';
import type { BroadcastInfo } from '../types';

let nextId = 0;
function connectedSession() {
  return { id: `bc-test-${nextId++}`, state: 'connected' as const };
}

function announce(sessionId: string, prefix: string, path: string) {
  DeviceEventEmitter.emit('broadcastAvailable', {
    sessionId,
    prefix,
    path,
    videoTracks: [],
    audioTracks: [],
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('subscribeBroadcasts', () => {
  it('ref-counts one native subscription per (session, prefix)', () => {
    const session = connectedSession();
    const a = subscribeBroadcasts(session, 'lobby/', () => {});
    const b = subscribeBroadcasts(session, 'lobby/', () => {});
    expect(NativeMoQ.subscribe).toHaveBeenCalledTimes(1);

    a.stop();
    expect(NativeMoQ.unsubscribe).not.toHaveBeenCalled();
    b.stop();
    expect(NativeMoQ.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('delivers announced broadcasts and removals to every listener', () => {
    const session = connectedSession();
    const seen: string[][] = [];
    const sub = subscribeBroadcasts(session, 'lobby/', (broadcasts) =>
      seen.push(broadcasts.map((b) => b.path))
    );

    announce(session.id, 'lobby/', 'lobby/alice');
    announce(session.id, 'lobby/', 'lobby/bob');
    DeviceEventEmitter.emit('broadcastUnavailable', {
      sessionId: session.id,
      prefix: 'lobby/',
      path: 'lobby/alice',
    });

    expect(seen).toEqual([
      [], // initial push on subscribe
      ['lobby/alice'],
      ['lobby/alice', 'lobby/bob'],
      ['lobby/bob'],
    ]);
    expect(sub.broadcasts.map((b: BroadcastInfo) => b.path)).toEqual([
      'lobby/bob',
    ]);
    sub.stop();
  });

  it('replaces a re-announced path instead of duplicating it', () => {
    const session = connectedSession();
    const sub = subscribeBroadcasts(session, 'lobby/', () => {});

    announce(session.id, 'lobby/', 'lobby/alice');
    announce(session.id, 'lobby/', 'lobby/alice');

    expect(sub.broadcasts.map((b) => b.path)).toEqual(['lobby/alice']);
    sub.stop();
  });

  it('late subscribers see broadcasts announced before they attached', () => {
    const session = connectedSession();
    const first = subscribeBroadcasts(session, 'lobby/', () => {});
    announce(session.id, 'lobby/', 'lobby/alice');

    const seen: string[][] = [];
    const second = subscribeBroadcasts(session, 'lobby/', (broadcasts) =>
      seen.push(broadcasts.map((b) => b.path))
    );

    expect(seen[0]).toEqual(['lobby/alice']);
    first.stop();
    second.stop();
  });

  it('clears broadcasts and re-subscribes across a reconnect', () => {
    const session = connectedSession();
    const seen: string[][] = [];
    const sub = subscribeBroadcasts(session, 'lobby/', (broadcasts) =>
      seen.push(broadcasts.map((b) => b.path))
    );
    announce(session.id, 'lobby/', 'lobby/alice');
    expect(NativeMoQ.subscribe).toHaveBeenCalledTimes(1);

    DeviceEventEmitter.emit('sessionStateChanged', {
      sessionId: session.id,
      state: 'closed',
    });
    expect(seen[seen.length - 1]).toEqual([]);
    expect(NativeMoQ.unsubscribe).toHaveBeenCalledTimes(1);

    DeviceEventEmitter.emit('sessionStateChanged', {
      sessionId: session.id,
      state: 'connected',
    });
    expect(NativeMoQ.subscribe).toHaveBeenCalledTimes(2);
    sub.stop();
  });

  it('does not open a native subscription while the session is disconnected', () => {
    const sub = subscribeBroadcasts(
      { id: `bc-test-${nextId++}`, state: 'idle' },
      'lobby/',
      () => {}
    );
    expect(NativeMoQ.subscribe).not.toHaveBeenCalled();
    sub.stop();
  });
});
