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
import { VideoView, useSession, usePlayer } from 'react-native-moq';
import type { MoQPlayerHandle, MoQPlayer } from 'react-native-moq';

function App() {
  const session = useSession('http://relay.example.com:4443');

  return (
    <>
      <Button title="Connect" onPress={() => session.connect()} />
      {session.broadcasts.map((broadcast) => (
        <BroadcastPlayer key={broadcast.path} handle={broadcast.player} />
      ))}
    </>
  );
}

function BroadcastPlayer({ handle }: { handle: MoQPlayerHandle }) {
  const player = usePlayer(handle, (p) => {
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

## API

### `useSession(url, setup?)`

Manages the connection to a MoQ relay server and tracks available broadcasts.

```tsx
const session = useSession('http://relay.example.com:4443');

// With setup callback — runs once on mount
const session = useSession('http://relay.example.com:4443', (s) => {
  s.connect();                  // auto-connect on mount
});

// With custom options
const session = useSession('http://relay.example.com:4443', (s) => {
  s.connect('my/prefix', 500); // prefix and target latency
});
```

Returns a `MoQSession` object:

| Property / Method | Type | Description |
|---|---|---|
| `sessionState` | `MoQSessionState` | Current connection state |
| `broadcasts` | `MoQBroadcastInfo[]` | Currently available broadcasts |
| `emitter` | `EventEmitter<MoQSessionEvents>` | Stable emitter for session events (see [`useEvent`](#useeventemitter-eventname-initialvalue)) |
| `connect(prefix?, targetLatencyMs?)` | `(prefix?: string, targetLatencyMs?: number) => void` | Connect to the relay. Defaults: `prefix=''`, `targetLatencyMs=200` |
| `disconnect()` | `() => void` | Disconnect and reset state |

**`MoQSessionState`** is one of: `'idle'` · `'connecting'` · `'connected'` · `'closed'` · `` `error:${string}` ``

Call `connect()` manually — either in the setup callback or in response to user interaction. The hook does not auto-connect.

---

### `usePlayer(handle, setup?)`

Creates a reactive `MoQPlayer` from a `MoQPlayerHandle`. The optional `setup` callback runs once on mount and is the right place to start playback and configure the player. The returned player is passed directly to `<VideoView>`.

```tsx
const player = usePlayer(broadcast.player, (p) => {
  p.updateTargetLatency(300);
  p.play();
});
```

Returns a `MoQPlayer` object:

| Property / Method | Type | Description |
|---|---|---|
| `broadcastPath` | `string` | The broadcast path this player belongs to |
| `isPlaying` | `boolean` | True while tracks are actively playing |
| `playbackStats` | `MoQPlaybackStats \| null` | Live metrics, updated every 500 ms |
| `currentVideoTrackName` | `string \| undefined` | Name of the active video track |
| `currentAudioTrackName` | `string \| undefined` | Name of the active audio track |
| `emitter` | `EventEmitter<MoQPlayerEvents>` | Stable emitter for player events (see [`useEvent`](#useeventemitter-eventname-initialvalue)) |
| `play()` | `() => void` | Start or resume playback |
| `pause()` | `() => void` | Pause playback |
| `stop()` | `() => void` | Stop playback and reset state |
| `updateTargetLatency(ms)` | `(ms: number) => void` | Change buffering latency at runtime |
| `switchVideoTrack(name)` | `(name: string) => void` | Switch to a different video rendition |
| `switchAudioTrack(name)` | `(name: string) => void` | Switch to a different audio track |

---

### `useEvent(emitter, eventName, initialValue?)`

Returns reactive state that re-renders the component whenever the named event fires.

```tsx
const { isPlaying } = useEvent(
  player.emitter,
  'playingChange',
  { isPlaying: false }
);
```

Without an initial value the return type includes `undefined`.

---

### `useEventListener(emitter, eventName, listener)`

Registers a listener without creating React state. Use this for side effects (logging, analytics, etc.) rather than driving UI.

```tsx
useEventListener(player.emitter, 'trackSwitched', ({ trackKind, trackName }) => {
  console.log(`Switched ${trackKind} track to ${trackName}`);
});
```

No `useCallback` is needed — the listener is kept in a ref internally.

**`player.emitter` events**

| Event | Payload | Description |
|---|---|---|
| `playingChange` | `{ isPlaying }` | Playback started, paused, or resumed |
| `trackStopped` | — | All tracks stopped (broadcast ended or `stop()` called) |
| `trackSwitched` | `{ trackKind, trackName }` | Active video or audio track changed |
| `statsUpdate` | `MoQPlaybackStats` | Playback metrics updated (~every 500 ms) |

**`session.emitter` events**

| Event | Payload | Description |
|---|---|---|
| `stateChange` | `{ state }` | Session state transitioned |
| `broadcastAvailable` | `MoQBroadcastInfo` | A new broadcast is available |
| `broadcastUnavailable` | `{ path }` | A broadcast is no longer available |

---

### `<VideoView>`

Native component that renders the video for a given player.

```tsx
<VideoView
  player={player}
  style={{ width: '100%', aspectRatio: 16 / 9 }}
/>
```

| Prop | Type | Required | Description |
|---|---|---|---|
| `player` | `MoQPlayer` | Yes | Player returned by `usePlayer` |
| `style` | `ViewStyle` | No | Standard React Native style prop |

---

### `MoQPlayerHandle`

An opaque reference to a native player, available as `broadcast.player` inside `MoQBroadcastInfo`. Pass it to `usePlayer` to get a reactive `MoQPlayer`. You can also call playback methods on it directly without the hook.

```tsx
// Direct usage — no hook needed
broadcast.player.play();
broadcast.player.switchVideoTrack('1080p');
broadcast.player.updateTargetLatency(100);
```

On iOS the handle is backed by a JSI host object — method calls go directly to the native player without bridge serialisation. On Android they delegate to the TurboModule bridge.

---

### Types

#### `MoQPlayerEvents`

Event map for `player.emitter`. Each key is an event name; the value is the event payload type.

```ts
type MoQPlayerEvents = {
  // Fires when playback starts, pauses, or resumes.
  // Deduplicated — only one emission per state transition even when multiple
  // tracks (video + audio) change simultaneously.
  playingChange: (event: { isPlaying: boolean }) => void;

  // Fires when all tracks stop (end of broadcast or explicit stop).
  trackStopped: (event: Record<never, never>) => void;

  // Fires when the active video or audio track changes.
  trackSwitched: (event: { trackKind: 'video' | 'audio'; trackName: string }) => void;

  // Fires every ~500 ms with updated playback metrics.
  statsUpdate: (event: MoQPlaybackStats) => void;
};
```

#### `MoQSessionEvents`

Event map for `session.emitter`.

```ts
type MoQSessionEvents = {
  // Fires on every session state transition.
  stateChange: (event: { state: MoQSessionState }) => void;

  // Fires when a new broadcast becomes available.
  broadcastAvailable: (event: MoQBroadcastInfo) => void;

  // Fires when a broadcast is no longer available.
  broadcastUnavailable: (event: { path: string }) => void;
};
```

#### `MoQBroadcastInfo`

```ts
interface MoQBroadcastInfo {
  path: string;
  videoTracks: MoQVideoTrackInfo[];
  audioTracks: MoQAudioTrackInfo[];
  player: MoQPlayerHandle; // pass to usePlayer to get a MoQPlayer
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
const player = usePlayer(broadcast.player, (p) => p.play());

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
// Set at session level via connect() (applies to all players created in this session)
const session = useSession(url, (s) => {
  s.connect('', 500);
});

// Override per player in the setup callback
const player = usePlayer(broadcast.player, (p) => {
  p.updateTargetLatency(100);
  p.play();
});

// Or change at runtime on the returned player
player.updateTargetLatency(300);
```

### Displaying live stats

```tsx
const player = usePlayer(broadcast.player, (p) => p.play());

if (player.playbackStats) {
  console.log(`Latency: ${player.playbackStats.videoLatencyMs} ms`);
  console.log(`Bitrate: ${player.playbackStats.videoBitrateKbps} kbps`);
  console.log(`FPS: ${player.playbackStats.videoFps}`);
}
```

Alternatively, subscribe to `statsUpdate` directly:

```tsx
const stats = useEvent(player.emitter, 'statsUpdate');
```

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
