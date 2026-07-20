import { describe, expect, it, jest } from '@jest/globals';

jest.mock('../native/NativeMoQPublisher', () => ({
  __esModule: true,
  default: {
    addListener: jest.fn(),
    removeListeners: jest.fn(),
    publish: jest.fn(),
    stop: jest.fn(),
  },
}));

import { serializeTracks } from '../publisher';
import type { CameraTrack } from '../camera';
import type { MicrophoneTrack } from '../microphone';
import type { DataTrack } from '../dataTrack';
import type { AudioSourceTrack } from '../audioSource';
import type { VideoSourceTrack } from '../videoSource';

const noop = () => {};

const camera: CameraTrack = {
  __type: 'camera',
  __name: 'camera',
  __source: 'single',
  state: 'active',
  lastError: null,
  position: 'front',
  encoder: { codec: 'h264', width: 1280, height: 720, framerate: 30 },
  flip: noop,
  setPosition: noop,
};

const microphone: MicrophoneTrack = {
  __type: 'microphone',
  state: 'active',
  lastError: null,
  encoder: { codec: 'opus', sampleRate: 48000 },
};

const data: DataTrack = {
  __type: 'data',
  __name: 'data',
  __id: 'data-0',
  send: noop,
};

const audioSource: AudioSourceTrack = {
  __type: 'audioSource',
  __name: 'tts',
  __id: 'audioSource-0',
  encoder: { codec: 'opus', sampleRate: 24000 },
  channels: 2,
  send: noop,
};

const videoSource: VideoSourceTrack = {
  __type: 'videoSource',
  __name: 'game',
  __id: 'videoSource-0',
  encoder: { codec: 'h264', width: 640, height: 576, framerate: 60 },
  buffers: [],
  pushFrame: noop,
  fillTestPattern: noop,
};

describe('serializeTracks', () => {
  it('serializes every track kind with its routing fields', () => {
    expect(
      serializeTracks([camera, microphone, data, audioSource, videoSource])
    ).toEqual([
      {
        type: 'camera',
        name: 'camera',
        source: 'single',
        encoder: { codec: 'h264', width: 1280, height: 720, framerate: 30 },
      },
      {
        type: 'microphone',
        name: 'mic',
        encoder: { codec: 'opus', sampleRate: 48000 },
      },
      { type: 'data', name: 'data', id: 'data-0' },
      {
        type: 'audioSource',
        name: 'tts',
        id: 'audioSource-0',
        encoder: { codec: 'opus', sampleRate: 24000, channels: 2 },
      },
      {
        type: 'videoSource',
        name: 'game',
        id: 'videoSource-0',
        encoder: { codec: 'h264', width: 640, height: 576, framerate: 60 },
      },
    ]);
  });

  it('copies encoders instead of aliasing the track objects', () => {
    const [serialized] = serializeTracks([camera]);
    expect(serialized!.encoder).not.toBe(camera.encoder);
  });

  it('throws on an unknown track kind', () => {
    const bogus = { __type: 'hologram' } as unknown as CameraTrack;
    expect(() => serializeTracks([bogus])).toThrow(/Unknown publish track/);
  });
});
