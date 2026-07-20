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
