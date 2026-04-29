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
import type { MoQPlayerHandle } from 'react-native-moq';

function App() {
  const session = useMoQSession('http://relay.example.com:4443');

  return (
    <>
      <Button title="Connect" onPress={session.connect} />
      {session.broadcasts.map((broadcast) => (
        <BroadcastPlayer key={broadcast.path} player={broadcast.player} />
      ))}
    </>
  );
}

function BroadcastPlayer({ player }: { player: MoQPlayerHandle }) {
  const state = useMoQPlayer(player);

  useEffect(() => {
    player.play();
    return () => player.pause();
  }, [player]);

  return (
    <>
      <MoQVideoView player={player} style={{ width: '100%', aspectRatio: 16 / 9 }} />
      <Button title={state.isPaused ? 'Resume' : 'Pause'} onPress={state.isPaused ? player.play : player.pause} />
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
| `broadcasts` | `MoQBroadcastInfo[]` | Currently available broadcasts, each with a `player` handle |
| `connect()` | `() => void` | Connect to the relay |
| `disconnect()` | `() => void` | Disconnect and reset state |

**`MoQSessionState`** is one of: `'idle'` · `'connecting'` · `'connected'` · `'closed'` · `` `error:${string}` ``

Call `connect()` manually after mounting — the hook does not auto-connect.

---

### `MoQPlayerHandle`

An opaque reference to a native player, returned as `broadcast.player` inside `MoQBroadcastInfo`. You can call playback methods on it directly or pass it to `useMoQPlayer` to track reactive state.

```tsx
// Direct usage — no hook needed
broadcast.player.play();
broadcast.player.switchVideoTrack('1080p');
broadcast.player.updateTargetLatency(100);
```

| Property / Method | Type | Description |
|---|---|---|
| `broadcastPath` | `string` | The broadcast path this player belongs to |
| `play()` | `() => void` | Start or resume playback |
| `pause()` | `() => void` | Pause playback |
| `stop()` | `() => void` | Stop playback |
| `updateTargetLatency(ms)` | `(ms: number) => void` | Change buffering latency at runtime |
| `switchVideoTrack(name)` | `(name: string) => void` | Switch to a different video rendition |
| `switchAudioTrack(name)` | `(name: string) => void` | Switch to a different audio track |

On iOS the handle is backed by a JSI host object — method calls go directly to the native player without bridge serialisation. On Android they delegate to the TurboModule bridge.

---

### `useMoQPlayer(player, options?)`

Tracks reactive playback state for a given `MoQPlayerHandle`. Use this when you need `isPlaying`, `isPaused`, `playbackStats`, or current track names in your UI.

```tsx
const state = useMoQPlayer(broadcast.player, {
  targetLatencyMs: 300,                  // override buffering latency for this player
  videoTracks: broadcast.videoTracks     // pre-populate currentVideoTrackName
});
```

Returns a `MoQPlayerState` object:

| Property / Method | Type | Description |
|---|---|---|
| `isPlaying` | `boolean` | True while tracks are actively playing |
| `isPaused` | `boolean` | True while paused |
| `playbackStats` | `MoQPlaybackStats \| null` | Live metrics, updated every 500 ms |
| `currentVideoTrackName` | `string \| undefined` | Name of the active video track |
| `currentAudioTrackName` | `string \| undefined` | Name of the active audio track |
| `play()` | `() => void` | Start or resume playback |
| `pause()` | `() => void` | Pause playback |
| `stop()` | `() => void` | Stop playback and reset state |
| `updateTargetLatency(ms)` | `(ms: number) => void` | Change buffering latency at runtime |
| `switchVideoTrack(name)` | `(name: string) => void` | Switch to a different video rendition |
| `switchAudioTrack(name)` | `(name: string) => void` | Switch to a different audio track |

---

### `<MoQVideoView>`

Native component that renders the video for a given player handle.

```tsx
<MoQVideoView
  player={broadcast.player}
  style={{ width: '100%', aspectRatio: 16 / 9 }}
/>
```

| Prop | Type | Required | Description |
|---|---|---|---|
| `player` | `MoQPlayerHandle` | Yes | Player handle for the broadcast to render |
| `style` | `ViewStyle` | No | Standard React Native style prop |

---

### Types

#### `MoQBroadcastInfo`

```ts
interface MoQBroadcastInfo {
  path: string;
  videoTracks: MoQVideoTrackInfo[];
  audioTracks: MoQAudioTrackInfo[];
  player: MoQPlayerHandle; // native player reference, created automatically
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
    onPress={() => broadcast.player.switchVideoTrack(track.name)}
  />
));
```

### Custom target latency

```tsx
// Set at session level (applies to all new players)
const session = useMoQSession(url, { targetLatencyMs: 500 });

// Override per player via the hook
const state = useMoQPlayer(broadcast.player, { targetLatencyMs: 100 });

// Or change at runtime directly on the handle
broadcast.player.updateTargetLatency(300);
```

### Displaying live stats

```tsx
const { playbackStats: stats } = useMoQPlayer(broadcast.player);

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
