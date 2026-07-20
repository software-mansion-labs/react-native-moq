import { describe, expect, it, jest } from '@jest/globals';
import { EventEmitter } from '../EventEmitter';

type Events = {
  ping: (event: { n: number }) => void;
  pong: (event: { s: string }) => void;
};

describe('EventEmitter', () => {
  it('delivers events to every listener of that event only', () => {
    const emitter = new EventEmitter<Events>();
    const ping1 = jest.fn();
    const ping2 = jest.fn();
    const pong = jest.fn();
    emitter.addListener('ping', ping1);
    emitter.addListener('ping', ping2);
    emitter.addListener('pong', pong);

    emitter.emit('ping', { n: 1 });

    expect(ping1).toHaveBeenCalledWith({ n: 1 });
    expect(ping2).toHaveBeenCalledWith({ n: 1 });
    expect(pong).not.toHaveBeenCalled();
  });

  it('remove() detaches a single listener', () => {
    const emitter = new EventEmitter<Events>();
    const kept = jest.fn();
    const removed = jest.fn();
    emitter.addListener('ping', kept);
    const sub = emitter.addListener('ping', removed);

    sub.remove();
    sub.remove(); // idempotent
    emitter.emit('ping', { n: 1 });

    expect(kept).toHaveBeenCalledTimes(1);
    expect(removed).not.toHaveBeenCalled();
  });

  it('a listener may remove itself during emit', () => {
    const emitter = new EventEmitter<Events>();
    const after = jest.fn();
    const sub = emitter.addListener('ping', () => sub.remove());
    emitter.addListener('ping', after);

    emitter.emit('ping', { n: 1 });
    emitter.emit('ping', { n: 2 });

    expect(after).toHaveBeenCalledTimes(2);
  });

  it('removeAllListeners clears one event or all', () => {
    const emitter = new EventEmitter<Events>();
    const ping = jest.fn();
    const pong = jest.fn();
    emitter.addListener('ping', ping);
    emitter.addListener('pong', pong);

    emitter.removeAllListeners('ping');
    emitter.emit('ping', { n: 1 });
    emitter.emit('pong', { s: 'a' });
    expect(ping).not.toHaveBeenCalled();
    expect(pong).toHaveBeenCalledTimes(1);

    emitter.removeAllListeners();
    emitter.emit('pong', { s: 'b' });
    expect(pong).toHaveBeenCalledTimes(1);
  });
});
