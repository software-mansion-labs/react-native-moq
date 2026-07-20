import { describe, expect, it, jest } from '@jest/globals';

jest.mock('../native/NativeMoQ', () => ({
  __esModule: true,
  default: {
    addListener: jest.fn(),
    removeListeners: jest.fn(),
    subscribeTrackObjects: jest.fn(),
    unsubscribeTrackObjects: jest.fn(),
  },
}));

import { buildSubscription } from '../trackObjects';

function makeCounters() {
  const counters = { opens: 0, closes: 0 };
  const open = () => {
    counters.opens++;
    return () => {
      counters.closes++;
    };
  };
  return { counters, open };
}

describe('buildSubscription', () => {
  it('opens immediately with autoStart and exposes identity fields', () => {
    const { counters, open } = makeCounters();
    const sub = buildSubscription('s1', '/live/a', 'audio', open, true);

    expect(sub.sessionId).toBe('s1');
    expect(sub.broadcastPath).toBe('/live/a');
    expect(sub.trackName).toBe('audio');
    expect(sub.isActive).toBe(true);
    expect(counters).toEqual({ opens: 1, closes: 0 });
  });

  it('defers opening when autoStart is false', () => {
    const { counters, open } = makeCounters();
    const sub = buildSubscription('s1', '/live/a', 'audio', open, false);

    expect(sub.isActive).toBe(false);
    expect(counters.opens).toBe(0);

    sub.start();
    expect(sub.isActive).toBe(true);
    expect(counters.opens).toBe(1);
  });

  it('start/stop are idempotent and re-startable', () => {
    const { counters, open } = makeCounters();
    const sub = buildSubscription('s1', '/live/a', 'audio', open, true);

    sub.start();
    expect(counters.opens).toBe(1);

    sub.stop();
    sub.stop();
    expect(counters.closes).toBe(1);
    expect(sub.isActive).toBe(false);

    sub.start();
    expect(counters.opens).toBe(2);
    sub.stop();
    expect(counters.closes).toBe(2);
  });
});
