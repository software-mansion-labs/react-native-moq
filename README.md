# react-native-moq

React Native bindings for [MoQKit](https://github.com/swift-on-server/moq-kit) — a low-latency live streaming library built on the [Media over QUIC (MoQ)](https://datatracker.ietf.org/wg/moq/about/) protocol.

## Requirements

- React Native **New Architecture** (Fabric / TurboModules)
- iOS 16+

## Installation

```sh
npm install react-native-moq
```

Then install iOS pods:

```sh
cd ios && pod install
```

## Quick start

```tsx
import { MoQVideoView, useMoQSession, useMoQPlayer } from 'react-native-moq';

function App() {
  const session = useMoQSession('http://relay.example.com:4443');

  return (
    <>
      <Button title="Connect" onPress={session.connect} />
      {session.broadcasts.map((broadcast) => (
        <BroadcastPlayer key={broadcast.path} broadcast={broadcast} />
      ))}
    </>
  );
}

function BroadcastPlayer({ broadcast }: { broadcast: MoQBroadcastInfo }) {
  const { playerHandle, isPaused, play, pause } = useMoQPlayer(broadcast.path);

  useEffect(() => {
    play();
  }, []);

  return (
    <>
      <MoQVideoView player={playerHandle} style={{ width: '100%', aspectRatio: 16 / 9 }} />
      <Button title={isPaused ? 'Resume' : 'Pause'} onPress={isPaused ? play : pause} />
    </>
  );
}
```

## API

### `useMoQSession(url, options?)`

Manages the connection to a MoQ relay server and tracks available broadcasts.

```tsx
const session = useMoQSession('http://relay.example.com:4443', {
  prefix: '',          // track namespace prefix, default ''
  targetLatencyMs: 200 // default buffering latency for players, default 200
});
```

Returns a `MoQSession` object:

| Property / Method | Type | Description |
|---|---|---|
| `sessionState` | `MoQSessionState` | Current connection state |
| `broadcasts` | `MoQBroadcastInfo[]` | Currently available broadcasts |
| `connect()` | `() => void` | Connect to the relay |
| `disconnect()` | `() => void` | Disconnect and reset state |

**`MoQSessionState`** is one of: `'idle'` · `'connecting'` · `'connected'` · `'closed'` · `` `error:${string}` ``

Call `connect()` manually after mounting — the hook does not auto-connect.

---

### `useMoQPlayer(broadcastPath, options?)`

Creates and controls a native player for a single broadcast. The player is created when the broadcast becomes available and released when the hook unmounts. If the broadcast catalog refreshes (e.g. the sender restarts), the player is automatically recreated and, if it was playing, resumes automatically.

```tsx
const player = useMoQPlayer(broadcast.path, {
  targetLatencyMs: 300,           // override buffering latency for this player
  videoTracks: broadcast.videoTracks // pre-populate currentVideoTrackName
});
```

Returns a `MoQPlayerState` object:

| Property / Method | Type | Description |
|---|---|---|
| `playerHandle` | `MoQPlayerHandle \| null` | Opaque handle to the native player — pass this to `<MoQVideoView>` |
| `isPlaying` | `boolean` | True while tracks are actively playing |
| `isPaused` | `boolean` | True while paused |
| `playbackStats` | `MoQPlaybackStats \| null` | Live metrics, updated every 500 ms |
| `currentVideoTrackName` | `string \| undefined` | Name of the active video track |
| `currentAudioTrackName` | `string \| undefined` | Name of the active audio track |
| `play()` | `() => void` | Start or resume playback |
| `pause()` | `() => void` | Pause playback |
| `stop()` | `() => void` | Release the player and reset state |
| `updateTargetLatency(ms)` | `(ms: number) => void` | Change buffering latency at runtime |
| `switchVideoTrack(name)` | `(name: string) => void` | Switch to a different video rendition |
| `switchAudioTrack(name)` | `(name: string) => void` | Switch to a different audio track |

---

### `<MoQVideoView>`

Native component that renders the video for a given player handle.

```tsx
<MoQVideoView
  player={playerHandle}
  style={{ width: '100%', aspectRatio: 16 / 9 }}
/>
```

| Prop | Type | Required | Description |
|---|---|---|---|
| `player` | `MoQPlayerHandle \| null` | Yes | Handle returned by `useMoQPlayer` |
| `style` | `ViewStyle` | No | Standard React Native style prop |

Passing `null` clears the view (shows black). Because the view binds directly to the handle rather than looking up a broadcast by path, multiple views can independently render different players without any global coordination.

---

### Types

#### `MoQPlayerHandle`

```ts
type MoQPlayerHandle = number;
```

An opaque numeric reference to a native player instance. Obtain one from `useMoQPlayer` and pass it to `<MoQVideoView>`. Do not construct or interpret this value directly.

#### `MoQBroadcastInfo`

```ts
interface MoQBroadcastInfo {
  path: string;
  videoTracks: MoQVideoTrackInfo[];
  audioTracks: MoQAudioTrackInfo[];
}
```

#### `MoQVideoTrackInfo`

```ts
interface MoQVideoTrackInfo {
  name: string;
  codec: string;
  width?: number;
  height?: number;
  bitrate?: number;
  framerate?: number;
}
```

#### `MoQAudioTrackInfo`

```ts
interface MoQAudioTrackInfo {
  name: string;
  codec: string;
  sampleRate: number;
  channelCount?: number;
  bitrate?: number;
}
```

#### `MoQPlaybackStats`

```ts
interface MoQPlaybackStats {
  videoLatencyMs?: number;
  audioLatencyMs?: number;
  videoBitrateKbps?: number;
  audioBitrateKbps?: number;
  videoFps?: number;
  videoJitterBufferMs?: number;
  audioRingBufferMs?: number;
  timeToFirstVideoFrameMs?: number;
  timeToFirstAudioFrameMs?: number;
  videoFramesDropped?: number;
  audioFramesDropped?: number;
  videoStalls?: StallStats;
  audioStalls?: StallStats;
}

interface StallStats {
  count: number;
  totalDurationMs: number;
  rebufferingRatio: number;
}
```

## Advanced usage

### Quality / rendition switching

```tsx
const sortedTracks = [...broadcast.videoTracks].sort(
  (a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0)
);

sortedTracks.map((track) => (
  <Button
    key={track.name}
    title={track.height ? `${track.height}p` : track.name}
    onPress={() => player.switchVideoTrack(track.name)}
  />
));
```

### Custom target latency

```tsx
// Set at session level (applies to all new players)
const session = useMoQSession(url, { targetLatencyMs: 500 });

// Override per player
const player = useMoQPlayer(path, { targetLatencyMs: 100 });

// Change at runtime
player.updateTargetLatency(300);
```

### Displaying live stats

```tsx
const { playbackStats: stats } = useMoQPlayer(path);

if (stats) {
  console.log(`Latency: ${stats.videoLatencyMs} ms`);
  console.log(`Bitrate: ${stats.videoBitrateKbps} kbps`);
  console.log(`FPS: ${stats.videoFps}`);
}
```

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
