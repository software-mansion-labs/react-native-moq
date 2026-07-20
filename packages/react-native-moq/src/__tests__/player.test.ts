import { describe, expect, it, jest } from '@jest/globals';

jest.mock('../native/NativeMoQ', () => ({
  __esModule: true,
  default: {
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  },
}));

import { DeviceEventEmitter } from 'react-native';
import { EventEmitter } from '../EventEmitter';
import {
  attachPlayerEvents,
  clampVolume,
  createPlayerEventBridge,
  type PlayerEventSink,
} from '../player';
import type { PlayerEvents } from '../types';

describe('createPlayerEventBridge', () => {
  it('mutates state before re-emitting each event', () => {
    const emitter = new EventEmitter<PlayerEvents>();
    const { state, sink } = createPlayerEventBridge(emitter, {
      videoTrackName: 'hd',
      audioTrackName: 'main',
    });

    let playingAtEmit: boolean | null = null;
    emitter.addListener('playingChange', () => {
      playingAtEmit = state.isPlaying;
    });

    sink.playingChange(true);
    expect(playingAtEmit).toBe(true);

    sink.trackSwitched('video', 'sd');
    expect(state.currentVideoTrackName).toBe('sd');
    expect(state.currentAudioTrackName).toBe('main');

    sink.statsUpdate({ videoFps: 30 });
    expect(state.playbackStats).toEqual({ videoFps: 30 });

    sink.trackStopped();
    expect(state.playbackStats).toBeNull();
    expect(state.currentVideoTrackName).toBeUndefined();
    expect(state.currentAudioTrackName).toBeUndefined();
  });
});

describe('attachPlayerEvents', () => {
  function makeSink() {
    return {
      playingChange: jest.fn(),
      trackStopped: jest.fn(),
      trackSwitched: jest.fn(),
      statsUpdate: jest.fn(),
    } satisfies PlayerEventSink;
  }

  function emitPlayerEvent(type: string, extra: object = {}) {
    DeviceEventEmitter.emit('playerEvent', {
      sessionId: 's1',
      broadcastPath: '/a',
      type,
      ...extra,
    });
  }

  it('dedupes playingChange and maps event types', () => {
    const sink = makeSink();
    const detach = attachPlayerEvents('s1', '/a', sink);

    emitPlayerEvent('trackPlaying');
    emitPlayerEvent('trackPlaying');
    expect(sink.playingChange).toHaveBeenCalledTimes(1);
    expect(sink.playingChange).toHaveBeenCalledWith(true);

    emitPlayerEvent('trackPaused');
    expect(sink.playingChange).toHaveBeenLastCalledWith(false);

    emitPlayerEvent('allTracksStopped');
    expect(sink.trackStopped).toHaveBeenCalledTimes(1);

    emitPlayerEvent('trackSwitched', { trackKind: 'audio', trackName: 'alt' });
    expect(sink.trackSwitched).toHaveBeenCalledWith('audio', 'alt');

    detach();
    emitPlayerEvent('trackPlaying');
    expect(sink.playingChange).toHaveBeenCalledTimes(2);
  });

  it('filters events from other players', () => {
    const sink = makeSink();
    const detach = attachPlayerEvents('s1', '/a', sink);

    DeviceEventEmitter.emit('playerEvent', {
      sessionId: 's1',
      broadcastPath: '/other',
      type: 'trackPlaying',
    });
    DeviceEventEmitter.emit('playbackStatsUpdated', {
      sessionId: 's2',
      broadcastPath: '/a',
      videoFps: 30,
    });
    expect(sink.playingChange).not.toHaveBeenCalled();
    expect(sink.statsUpdate).not.toHaveBeenCalled();

    DeviceEventEmitter.emit('playbackStatsUpdated', {
      sessionId: 's1',
      broadcastPath: '/a',
      videoFps: 30,
    });
    expect(sink.statsUpdate).toHaveBeenCalledTimes(1);
    detach();
  });
});

describe('clampVolume', () => {
  it('clamps into [0, 1]', () => {
    expect(clampVolume(-0.5)).toBe(0);
    expect(clampVolume(0.25)).toBe(0.25);
    expect(clampVolume(1.5)).toBe(1);
  });
});
