import { describe, expect, it, jest } from '@jest/globals';

jest.mock('../native/NativeMoQ', () => ({
  __esModule: true,
  default: {
    addListener: jest.fn(),
    removeListeners: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
  },
}));

import { DeviceEventEmitter } from 'react-native';
import NativeMoQ from '../native/NativeMoQ';
import { createSession } from '../session';

function setNativeState(sessionId: string, state: string) {
  DeviceEventEmitter.emit('sessionStateChanged', { sessionId, state });
}

function setNativeStats(sessionId: string, roundTripTimeMs: number) {
  DeviceEventEmitter.emit('connectionStatsUpdated', {
    sessionId,
    roundTripTimeMs,
    estimatedReceiveRateBps: 1_500_000,
  });
}

describe('createSession', () => {
  it('connects with the current url and default latency', () => {
    const session = createSession('https://relay.example');
    session.connect();
    expect(NativeMoQ.connect).toHaveBeenCalledWith(
      session.id,
      'https://relay.example',
      200
    );
  });

  it('mirrors native state changes and emits stateChange', () => {
    const session = createSession('u');
    const seen: string[] = [];
    session.addListener('stateChange', (e) => seen.push(e.state));

    setNativeState(session.id, 'connecting');
    setNativeState(session.id, 'connected');
    setNativeState('someone-else', 'closed');

    expect(session.state).toBe('connected');
    expect(seen).toEqual(['connecting', 'connected']);
  });

  it('disconnect emits the synthetic idle transition exactly once', () => {
    const session = createSession('u');
    setNativeState(session.id, 'connected');

    const seen: string[] = [];
    session.addListener('stateChange', (e) => seen.push(e.state));

    session.disconnect();
    session.disconnect(); // already idle: no second emit

    expect(NativeMoQ.disconnect).toHaveBeenCalledWith(session.id);
    expect(session.state).toBe('idle');
    expect(seen).toEqual(['idle']);
  });

  it('mirrors connection stats for its session and clears them on disconnect', () => {
    const session = createSession('u');
    const seen: number[] = [];
    session.addListener('statsUpdate', (stats) =>
      seen.push(stats.roundTripTimeMs ?? -1)
    );

    setNativeStats(session.id, 5);
    setNativeStats('someone-else', 10);
    setNativeState(session.id, 'connected');
    setNativeStats(session.id, 25);

    expect(session.connectionStats).toEqual({
      roundTripTimeMs: 25,
      estimatedReceiveRateBps: 1_500_000,
    });
    expect(seen).toEqual([25]);

    setNativeState(session.id, 'closed');
    expect(session.connectionStats).toBeNull();

    session.destroy();
    setNativeState(session.id, 'connected');
    setNativeStats(session.id, 50);
    expect(session.connectionStats).toBeNull();
    expect(seen).toEqual([25]);
  });

  it('destroy detaches the native listener', () => {
    const session = createSession('u');
    const seen: string[] = [];
    session.addListener('stateChange', (e) => seen.push(e.state));

    session.destroy();
    setNativeState(session.id, 'connected');

    expect(seen).toEqual([]);
    expect(session.state).toBe('idle');
  });
});
