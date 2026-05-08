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
import type { BroadcastInfo } from 'react-native-moq';

function App() {
  const session = useSession('http://relay.example.com:4443');

  return (
    <>
      <Button title="Connect" onPress={() => session.connect()} />
      <Button title="Subscribe" onPress={() => session.subscribe()} />
      {session.broadcasts.map((broadcast) => (
        <BroadcastPlayer key={broadcast.path} broadcast={broadcast} />
      ))}
    </>
  );
}

function BroadcastPlayer({ broadcast }: { broadcast: BroadcastInfo }) {
  const player = usePlayer(broadcast.player, (p) => {
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

For audio-only streaming, use `useAudioPlayer(broadcast)` instead of `usePlayer(broadcast.player)` — the video track is never subscribed, so no video bandwidth is consumed. See [`useAudioPlayer`](#useaudioplayerbroadcast-setup) below.

## API

### `useSession(url, setup?)`

Manages the connection to a MoQ relay server and tracks available broadcasts. Connecting and subscribing are two independent steps: `connect()` opens the relay session, and `subscribe(prefix?)` starts emitting `broadcastAvailable` events for paths under the given prefix. Either step can be deferred until the user opts in.

```tsx
const session = useSession('http://relay.example.com:4443');

// With setup callback — runs once on mount
const session = useSession('http://relay.example.com:4443', (s) => {
  s.connect();      // auto-connect on mount
  s.subscribe();    // discover all broadcasts (empty prefix matches everything)
});

// With custom options
const session = useSession('http://relay.example.com:4443', (s) => {
  s.connect(500);            // target latency in ms
  s.subscribe('my/prefix');  // only discover broadcasts under this prefix
});
```

Returns a `Session` object:

| Property / Method | Type | Description |
|---|---|---|
| `sessionState` | `SessionState` | Current connection state |
| `broadcasts` | `BroadcastInfo[]` | Currently available broadcasts (populated only while subscribed) |
| `emitter` | `EventEmitter<SessionEvents>` | Stable emitter for session events |
| `addListener(eventName, listener)` | `(eventName, listener) => EventSubscription` | Subscribe to a session event imperatively; call `.remove()` to unsubscribe |
| `connect(targetLatencyMs?)` | `(targetLatencyMs?: number) => void` | Open the relay session. Default: `targetLatencyMs=200` |
| `disconnect()` | `() => void` | Close the session (also tears down any active broadcast subscription) and reset state |
| `subscribe(prefix?)` | `(prefix?: string) => void` | Begin discovering broadcasts under `prefix`. Default: `prefix=''` (match all). Call again to switch prefixes — the previous subscription is replaced |
| `unsubscribe()` | `() => void` | Stop discovering broadcasts and clear `broadcasts`. The relay session stays open |

**`SessionState`** is one of: `'idle'` · `'connecting'` · `'connected'` · `'closed'` · `` `error:${string}` ``

Call `connect()` and `subscribe()` manually — either in the setup callback or in response to user interaction. The hook does not auto-connect or auto-subscribe. `subscribe()` requires an open session; call it after `connect()` (or from a `stateChange` listener once `state === 'connected'`). `disconnect()` will clean up any active subscription, so callers don't need to call `unsubscribe()` first.

---

### `usePlayer(handle, setup?)`

Creates a reactive `Player` from a `PlayerHandle`. The optional `setup` callback runs once on mount and is the right place to start playback and configure the player. The returned player is passed directly to `<VideoView>`.

```tsx
const player = usePlayer(broadcast.player, (p) => {
  p.updateTargetLatency(300);
  p.play();
});
```

Returns a `Player` object:

| Property / Method | Type | Description |
|---|---|---|
| `broadcastPath` | `string` | The broadcast path this player belongs to |
| `isPlaying` | `boolean` | True while tracks are actively playing |
| `playbackStats` | `PlaybackStats \| null` | Live metrics, updated every 500 ms |
| `currentVideoTrackName` | `string \| undefined` | Name of the active video track |
| `currentAudioTrackName` | `string \| undefined` | Name of the active audio track |
| `emitter` | `EventEmitter<PlayerEvents>` | Stable emitter for player events |
| `addListener(eventName, listener)` | `(eventName, listener) => EventSubscription` | Subscribe to a player event imperatively; call `.remove()` to unsubscribe |
| `play()` | `() => void` | Start or resume playback |
| `pause()` | `() => void` | Pause playback |
| `stop()` | `() => void` | Stop playback and reset state |
| `updateTargetLatency(ms)` | `(ms: number) => void` | Change buffering latency at runtime |
| `switchVideoTrack(name)` | `(name: string) => void` | Switch to a different video rendition |
| `switchAudioTrack(name)` | `(name: string) => void` | Switch to a different audio track |

---

### `useAudioPlayer(broadcast, setup?)`

Creates a reactive `AudioPlayer` that streams **audio only** for a broadcast — the video track is never subscribed and no video pipeline is started natively. Useful for background-audio modes, music broadcasts, or low-bandwidth contexts. The hook lazily creates a dedicated native player on mount and tears it down on unmount. The video+audio player from `broadcast.player` is independent and can run alongside if you also call `usePlayer`.

```tsx
import { useAudioPlayer } from 'react-native-moq';

const audio = useAudioPlayer(broadcast, (p) => {
  p.play();
});

return (
  <Button
    title={audio.isPlaying ? 'Pause' : 'Resume'}
    onPress={audio.isPlaying ? audio.pause : audio.play}
  />
);
```

Returns an `AudioPlayer` object — same shape as `Player` minus the video-only members:

| Property / Method | Type | Description |
|---|---|---|
| `broadcastPath` | `string` | Internal key for this audio-only player (broadcast path with an `_audio` suffix) |
| `isPlaying` | `boolean` | True while audio is actively playing |
| `playbackStats` | `PlaybackStats \| null` | Live metrics, updated every 500 ms (only audio fields are populated) |
| `currentAudioTrackName` | `string \| undefined` | Name of the active audio track |
| `emitter` | `EventEmitter<PlayerEvents>` | Stable emitter for player events |
| `addListener(eventName, listener)` | `(eventName, listener) => EventSubscription` | Subscribe to a player event imperatively |
| `play()` | `() => void` | Start or resume playback |
| `pause()` | `() => void` | Pause playback |
| `stop()` | `() => void` | Stop playback and reset state |
| `updateTargetLatency(ms)` | `(ms: number) => void` | Change buffering latency at runtime |
| `switchAudioTrack(name)` | `(name: string) => void` | Switch to a different audio track |

The same `PlayerEvents` apply (`playingChange`, `trackStopped`, `trackSwitched`, `statsUpdate`); `trackSwitched` only fires with `trackKind: 'audio'`. The audio-only stream uses a separate native player from the video+audio one, so both can run alongside each other for the same broadcast.

Passing an `AudioPlayer` to `<VideoView>` is a type error — the audio-only mode has no video output by design.

---

### `useEvent(source, eventName, initialValue?)`

Returns reactive state that re-renders the component whenever the named event fires. `source` can be a `Player`, `Session`, or any `EventEmitter`.

```tsx
const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: false });
```

Without an initial value the return type includes `undefined`.

---

### `useEventListener(source, eventName, listener)`

Registers a listener without creating React state. Use this for side effects (logging, analytics, etc.) rather than driving UI. `source` can be a `Player`, `Session`, or any `EventEmitter`.

```tsx
useEventListener(player, 'trackSwitched', ({ trackKind, trackName }) => {
  console.log(`Switched ${trackKind} track to ${trackName}`);
});

useEventListener(session, 'stateChange', ({ state }) => {
  console.log('Session state:', state);
});
```

No `useCallback` is needed — the listener is kept in a ref internally.

---

### `player.addListener(eventName, listener)` / `session.addListener(eventName, listener)`

Subscribes to an event outside of the React lifecycle. Returns an `EventSubscription` whose `.remove()` method cancels the subscription.

```ts
// Subscribe
const sub = player.addListener('playingChange', ({ isPlaying }) => {
  console.log('Playing:', isPlaying);
});

// Later — unsubscribe manually
sub.remove();
```

Use this when you need to subscribe from non-component code (stores, services, callbacks) or when you want full control over the subscription lifetime. Inside components, prefer `useEvent` or `useEventListener` instead — they clean up automatically.

---

**`player` events**

| Event | Payload | Description |
|---|---|---|
| `playingChange` | `{ isPlaying }` | Playback started, paused, or resumed |
| `trackStopped` | — | All tracks stopped (broadcast ended or `stop()` called) |
| `trackSwitched` | `{ trackKind, trackName }` | Active video or audio track changed |
| `statsUpdate` | `PlaybackStats` | Playback metrics updated (~every 500 ms) |

**`session` events**

| Event | Payload | Description |
|---|---|---|
| `stateChange` | `{ state }` | Session state transitioned |
| `broadcastAvailable` | `BroadcastInfo` | A new broadcast is available |
| `broadcastUnavailable` | `{ path }` | A broadcast is no longer available |

---

### `<VideoView>`

Native component that renders the video for a given player. Accepts children — render overlay UI (controls, exit-fullscreen buttons, etc.) as children and they will be laid out on top of the video both inline and inside the fullscreen modal.

```tsx
<VideoView
  player={player}
  style={{ width: '100%', aspectRatio: 16 / 9 }}
/>
```

| Prop | Type | Required | Description |
|---|---|---|---|
| `player` | `Player` | Yes | Player returned by `usePlayer` |
| `style` | `ViewStyle` | No | Standard React Native style prop |
| `children` | `ReactNode` | No | Overlay content rendered above the video, inline and in fullscreen |
| `videoAspectRatio` | `number` | No | Source video aspect ratio (`width / height`). Used to letterbox the video inside the fullscreen modal so it isn't stretched on Android. Defaults to `16 / 9` |
| `onFullscreenEnter` | `() => void` | No | Fired after the fullscreen modal opens |
| `onFullscreenExit` | `() => void` | No | Fired after the fullscreen modal closes (including dismissal via the Android hardware back button) |

Imperative methods on the ref:

| Method | Description |
|---|---|
| `enterFullscreen()` | Show the player in a fullscreen modal |
| `exitFullscreen()` | Dismiss the fullscreen modal |

```tsx
import { useRef } from 'react';
import { VideoView, type VideoViewRef } from 'react-native-moq';

const ref = useRef<VideoViewRef>(null);
// ...
ref.current?.enterFullscreen();
ref.current?.exitFullscreen();
```

See [Fullscreen playback](#fullscreen-playback) for a complete example with an in-modal exit button.

---

### `PlayerHandle`

An opaque reference to a native player, available as `broadcast.player` inside `BroadcastInfo`. Pass it to `usePlayer` to get a reactive `Player`. You can also call playback methods on it directly without the hook.

```tsx
// Direct usage — no hook needed
broadcast.player.play();
broadcast.player.switchVideoTrack('1080p');
broadcast.player.updateTargetLatency(100);
```

On iOS the handle is backed by a JSI host object — method calls go directly to the native player without bridge serialisation. On Android they delegate to the TurboModule bridge.

---

### Types

#### `PlayerEvents`

Event map for `player.emitter`. Each key is an event name; the value is the event payload type.

```ts
type PlayerEvents = {
  // Fires when playback starts, pauses, or resumes.
  // Deduplicated — only one emission per state transition even when multiple
  // tracks (video + audio) change simultaneously.
  playingChange: (event: { isPlaying: boolean }) => void;

  // Fires when all tracks stop (end of broadcast or explicit stop).
  trackStopped: (event: Record<never, never>) => void;

  // Fires when the active video or audio track changes.
  trackSwitched: (event: { trackKind: 'video' | 'audio'; trackName: string }) => void;

  // Fires every ~500 ms with updated playback metrics.
  statsUpdate: (event: PlaybackStats) => void;
};
```

#### `SessionEvents`

Event map for `session.emitter`.

```ts
type SessionEvents = {
  // Fires on every session state transition.
  stateChange: (event: { state: SessionState }) => void;

  // Fires when a new broadcast becomes available.
  broadcastAvailable: (event: BroadcastInfo) => void;

  // Fires when a broadcast is no longer available.
  broadcastUnavailable: (event: { path: string }) => void;
};
```

#### `AudioPlayer`

Returned by `useAudioPlayer`. A `Player` shape narrowed to audio-only — no `currentVideoTrackName`, no `switchVideoTrack`.

```ts
interface AudioPlayer {
  readonly broadcastPath: string;
  readonly isPlaying: boolean;
  readonly playbackStats: PlaybackStats | null;
  readonly currentAudioTrackName?: string;
  readonly emitter: EventEmitter<PlayerEvents>;
  addListener<T extends keyof PlayerEvents>(eventName: T, listener: PlayerEvents[T]): EventSubscription;
  play(): void;
  pause(): void;
  stop(): void;
  updateTargetLatency(ms: number): void;
  switchAudioTrack(trackName: string): void;
}
```

#### `BroadcastInfo`

```ts
interface BroadcastInfo {
  path: string;
  videoTracks: VideoTrackInfo[];
  audioTracks: AudioTrackInfo[];
  player: PlayerHandle; // pass to usePlayer to get a Player; pass the broadcast itself to useAudioPlayer for audio-only
}
```

#### `VideoTrackInfo`

```ts
interface VideoTrackInfo {
  name: string;
  codec: string;
  width?: number;
  height?: number;
  bitrate?: number;
  framerate?: number;
}
```

#### `AudioTrackInfo`

```ts
interface AudioTrackInfo {
  name: string;
  codec: string;
  sampleRate: number;
  channelCount?: number;
  bitrate?: number;
}
```

#### `PlaybackStats`

```ts
interface PlaybackStats {
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

### Fullscreen playback

`VideoView` exposes imperative `enterFullscreen()` / `exitFullscreen()` methods on its ref. Internally it renders the video into an RN `<Modal>` so children are still part of RN's tree — overlay buttons remain tappable, and rendering works on both iOS and Android (where the underlying `SurfaceView` cannot host child views directly).

```tsx
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  VideoView,
  usePlayer,
  type BroadcastInfo,
  type VideoViewRef,
} from 'react-native-moq';

function VideoSection({ broadcast }: { broadcast: BroadcastInfo }) {
  const player = usePlayer(broadcast.player, (p) => p.play());
  const ref = useRef<VideoViewRef>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const insets = useSafeAreaInsets();

  // Pass the active track's aspect to letterbox correctly in fullscreen
  // (Android's SurfaceView would otherwise stretch the video).
  const active =
    broadcast.videoTracks.find((t) => t.name === player.currentVideoTrackName) ??
    broadcast.videoTracks[0];
  const videoAspectRatio =
    active?.width && active?.height ? active.width / active.height : undefined;

  return (
    <>
      <VideoView
        ref={ref}
        player={player}
        style={{ width: '100%', aspectRatio: 16 / 9 }}
        videoAspectRatio={videoAspectRatio}
        onFullscreenEnter={() => setIsFullscreen(true)}
        onFullscreenExit={() => setIsFullscreen(false)}
      >
        {/* Overlay only mounts in fullscreen; padding clears the safe area. */}
        {isFullscreen && (
          <View
            pointerEvents="box-none"
            style={[
              StyleSheet.absoluteFill,
              {
                paddingTop: insets.top + 16,
                paddingRight: insets.right + 16,
                alignItems: 'flex-end',
              },
            ]}
          >
            <Pressable
              onPress={() => ref.current?.exitFullscreen()}
              style={styles.exitButton}
            >
              <Text style={styles.exitButtonText}>Exit fullscreen</Text>
            </Pressable>
          </View>
        )}
      </VideoView>

      <Pressable onPress={() => ref.current?.enterFullscreen()}>
        <Text>Fullscreen</Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  exitButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  exitButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
});
```

A few things worth knowing:

- `onFullscreenEnter` / `onFullscreenExit` fire on every transition, including dismissal via the Android hardware back button — your local `isFullscreen` state stays in sync without manual back-button handling.
- Children render alongside the native video (not inside it) on both platforms, so use absolute positioning for overlays.
- The native view briefly remounts on fullscreen toggle. The shared video output (the `AVSampleBufferDisplayLayer` on iOS, the player `Surface` on Android) is keyed by `broadcastPath` and re-attaches automatically; expect at most one frame of black during the transition.
- `videoAspectRatio` is only consulted in fullscreen. Inline layout is driven by the `style` prop as usual.

### Custom target latency

```tsx
// Set at session level via connect() (applies to all players created in this session)
const session = useSession(url, (s) => {
  s.connect(500);
  s.subscribe();
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
const stats = useEvent(player, 'statsUpdate');
```

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
