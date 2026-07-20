import { describe, expect, it, jest } from '@jest/globals';

// The package index pulls in every native spec; mock them all so the public
// surface can be imported without a host platform. jest.doMock + require keeps
// the mocks ahead of the import without an inline factory per module.
for (const name of [
  'NativeMoQ',
  'NativeMoQPublisher',
  'NativeMoQCamera',
  'NativeMoQMicrophone',
  'NativeMoQMultiCamera',
  'NativeMoQScreenBroadcast',
  'NativeMoQDataTrack',
  'NativeMoQAudioSource',
  'NativeMoQVideoSource',
]) {
  jest.doMock(`../native/${name}`, () => ({
    __esModule: true,
    default: new Proxy({}, { get: () => jest.fn() }),
  }));
}

const moq = require('../index') as Record<string, unknown>;

describe('public API surface', () => {
  it('exports the hook / imperative pairs and views', () => {
    const expected = [
      // hooks
      'useSession',
      'useBroadcasts',
      'usePublisher',
      'useCamera',
      'useMultiCamera',
      'useMicrophone',
      'useDataTrack',
      'useDataMessages',
      'useAudioSource',
      'useVideoSource',
      'useScreenBroadcast',
      'useVideoPlayer',
      'useAudioPlayer',
      'useAudioChunks',
      'useEvent',
      'useEventListener',
      // imperative counterparts
      'createSession',
      'subscribeBroadcasts',
      'createPublisher',
      'createCamera',
      'createMultiCamera',
      'createMicrophone',
      'createDataTrack',
      'subscribeDataMessages',
      'createAudioSource',
      'createVideoSource',
      'createScreenBroadcast',
      'createVideoPlayer',
      'createAudioPlayer',
      'subscribeAudioChunks',
      // capability queries
      'getSupportedVideoCodecs',
      'getSupportedAudioCodecs',
      'isMultiCameraSupported',
      // views and values
      'VideoView',
      'PublisherView',
      'BroadcastPickerView',
      'EventEmitter',
      'PlayerHandle',
    ];
    for (const name of expected) {
      expect(moq).toHaveProperty(name);
    }
  });
});
