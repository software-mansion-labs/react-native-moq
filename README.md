<!-- TODO: add a full-width cover banner here once available, e.g.
<img src="./assets/react-native-moq-gh-cover.png" alt="react-native-moq by Software Mansion" width="100%" />
-->

# react-native-moq

### Low-latency live streaming for React Native, built on Media over QUIC.

[![npm version](https://img.shields.io/npm/v/react-native-moq.svg)](https://www.npmjs.com/package/react-native-moq)
[![npm downloads](https://img.shields.io/npm/dm/react-native-moq.svg)](https://www.npmjs.com/package/react-native-moq)
[![license](https://img.shields.io/npm/l/react-native-moq.svg)](./LICENSE)

`react-native-moq` provides React Native bindings for [MoQKit](https://github.com/software-mansion-labs/moq-kit/) — a low-latency live streaming library built on the [Media over QUIC (MoQ)](https://datatracker.ietf.org/wg/moq/about/) protocol. Subscribe to and publish audio/video broadcasts (including screen sharing) with a small, reactive hooks-based API.

## Table of contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Publishing](#publishing)
- [Documentation](#documentation)
- [Example app](#example-app)
- [Contributing](#contributing)
- [License](#license)

## Requirements

- React Native **New Architecture** (Fabric / TurboModules)
- iOS 16+
- Android API 30+

## Installation

```sh
npm install react-native-moq
```

Then install iOS pods:

```sh
cd ios && pod install
```

### Optional: default UI components

The ready-made player chrome — `<VideoPlayerView>`, `<FullscreenControls>`, `<MiniPlayerControls>`, `<VolumeSlider>`, `<SpeakerGlyph>` and the matching context hooks — lives in a separate package so apps that build their own UI don't pay for it:

```sh
npm install react-native-moq-ui @react-native-vector-icons/material-icons
```

`react-native-moq-ui` peer-depends on `react-native-moq`, `react-native-safe-area-context`, and `@react-native-vector-icons/material-icons` (used for the play / pause / close / fullscreen / speaker glyphs). On iOS, register the icon font once in your app's `Info.plist`:

```xml
<key>UIAppFonts</key>
<array>
  <string>MaterialIcons.ttf</string>
</array>
```

Then re-run `pod install`. Android picks the font up via autolinking — no extra step.

Skip the package entirely if you're composing your own player UI directly on top of [`<VideoView>`](docs/API.md#videoview).

## Quick start

Connect to a relay, list the broadcasts it exposes, and play one:

```tsx
import { VideoView, useSession, useBroadcasts, useVideoPlayer } from 'react-native-moq';
import type { BroadcastInfo } from 'react-native-moq';

function App() {
  const session = useSession('http://relay.example.com:4443');
  const broadcasts = useBroadcasts(session); // empty prefix → match all

  return (
    <>
      <Button title="Connect" onPress={() => session.connect()} />
      {broadcasts.map((broadcast) => (
        <BroadcastPlayer key={broadcast.path} broadcast={broadcast} />
      ))}
    </>
  );
}

function BroadcastPlayer({ broadcast }: { broadcast: BroadcastInfo }) {
  const player = useVideoPlayer(broadcast, (p) => {
    p.play();
  });

  return (
    <>
      <VideoView player={player} style={{ width: '100%', aspectRatio: 16 / 9 }} />
      <Button title={player.isPlaying ? 'Pause' : 'Resume'} onPress={player.isPlaying ? player.pause : player.play} />
    </>
  );
}
```

For audio-only streaming, use `useAudioPlayer(broadcast)` instead of `useVideoPlayer(broadcast)` — the video track is never subscribed, so no video bandwidth is consumed. See [`useAudioPlayer`](docs/API.md#useaudioplayerbroadcast-setup) in the API reference.

## Publishing

Capture the device camera + microphone and push them to a relay. Publishing reuses a `Session` you've already opened, so the same connection can subscribe and publish at once:

```tsx
import {
  PublisherView,
  useCamera,
  useMicrophone,
  usePublisher,
  useSession,
} from 'react-native-moq';

function PublishScreen() {
  const session = useSession('http://relay.example.com:4443', (s) => s.connect());
  const camera = useCamera();
  const microphone = useMicrophone();
  const publisher = usePublisher(session);

  return (
    <>
      <PublisherView camera={camera} style={{ aspectRatio: 9 / 16 }} />
      <Button title="Flip" onPress={camera.flip} />
      <Button
        title={publisher.state === 'publishing' ? 'Stop' : 'Publish'}
        disabled={session.state !== 'connected' && publisher.state !== 'publishing'}
        onPress={() => {
          if (publisher.state === 'publishing') publisher.stop();
          else publisher.publish({ path: 'live/test', tracks: [camera, microphone] });
        }}
      />
    </>
  );
}
```

The host app is responsible for camera/microphone runtime permissions. Screen sharing has its own hook, `useScreenBroadcast`. See [Publishing](docs/API.md#publishing) and [Screen broadcasting](docs/API.md#screen-broadcasting) in the API reference for the full setup.

## Documentation

The full API reference — every hook, component, type, and the `react-native-moq-ui` package — lives in [**docs/API.md**](docs/API.md):

- [Playback API](docs/API.md#playback-api) — `useSession`, `useBroadcasts`, `useVideoPlayer`, `useAudioPlayer`, events, `<VideoView>`, types
- [Publishing](docs/API.md#publishing) — `useCamera`, `useMultiCamera`, `useMicrophone`, `usePublisher`, `<PublisherView>`, screen broadcasting
- [Advanced usage](docs/API.md#advanced-usage) — rendition switching, custom target latency, live stats
- [Default UI components](docs/API.md#default-ui-components-react-native-moq-ui) — `<VideoPlayerView>`, fullscreen, controls, `<VolumeSlider>`

## Example app

The [`example/`](example/) directory contains a full demo app that exercises both playback and publishing. To run it:

```sh
yarn
yarn example start

# in another terminal
yarn example ios      # or: yarn example android
```

See [CONTRIBUTING.md](CONTRIBUTING.md#development-workflow) for the full development workflow.

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

react-native-moq library is licensed under [The MIT License](LICENSE).

## react-native-moq is created by Software Mansion

Since 2012 [Software Mansion](https://swmansion.com) is a software agency with experience in building web and mobile apps. We are Core React Native Contributors and experts in dealing with all kinds of React Native issues. We can help you build your next dream product – [Hire us](https://swmansion.com/contact/projects?utm_source=react-native-moq&utm_medium=readme).
