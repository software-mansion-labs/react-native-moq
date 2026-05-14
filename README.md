# react-native-moq

React Native bindings for [MoQKit](https://github.com/swift-on-server/moq-kit) — a low-latency live streaming library built on the [Media over QUIC (MoQ)](https://datatracker.ietf.org/wg/moq/about/) protocol.

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

## Quick start

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

For audio-only streaming, use `useAudioPlayer(broadcast)` instead of `useVideoPlayer(broadcast)` — the video track is never subscribed, so no video bandwidth is consumed. See [`useAudioPlayer`](#useaudioplayerbroadcast-setup) below.

## API

### `useSession(url, setup?)`

Manages the connection to a MoQ relay server. `connect()` opens the relay session; broadcast discovery is a separate step driven by [`useBroadcasts`](#usebroadcastssession-prefix). Either step can be deferred until the user opts in.

```tsx
const session = useSession('http://relay.example.com:4443');

// With setup callback — runs once on mount
const session = useSession('http://relay.example.com:4443', (s) => {
  s.connect(); // auto-connect on mount
});

// With a custom target latency
const session = useSession('http://relay.example.com:4443', (s) => {
  s.connect(500); // target latency in ms
});
```

Returns a `Session` object:

| Property / Method | Type | Description |
|---|---|---|
| `state` | `SessionState` | Current connection state |
| `emitter` | `EventEmitter<SessionEvents>` | Stable emitter for session events |
| `addListener(eventName, listener)` | `(eventName, listener) => EventSubscription` | Subscribe to a session event imperatively; call `.remove()` to unsubscribe |
| `connect(targetLatencyMs?)` | `(targetLatencyMs?: number) => void` | Open the relay session. Default: `targetLatencyMs=200` |
| `disconnect()` | `() => void` | Close the session (also tears down all active broadcast subscriptions) and reset state |

**`SessionState`** is one of: `'idle'` · `'connecting'` · `'connected'` · `'closed'` · `` `error:${string}` ``

Call `connect()` manually — either in the setup callback or in response to user interaction. The hook does not auto-connect. To start receiving broadcasts, call [`useBroadcasts(session, prefix?)`](#usebroadcastssession-prefix) — it begins the underlying native subscription on mount and tears it down on unmount.

---

### `useBroadcasts(session, prefix?)`

Subscribes to broadcasts under a given prefix and returns the current `BroadcastInfo[]`. The hook starts the underlying native subscription on mount and tears it down on unmount; multiple components calling `useBroadcasts(session, prefix)` with the same prefix share a single underlying subscription via JS-side ref-counting.

```tsx
// All broadcasts the relay exposes (empty prefix matches everything)
const all = useBroadcasts(session);

// Just the broadcasts under a specific prefix
const streams = useBroadcasts(session, '/streams');
```

The returned array is empty until `session.state === 'connected'` and re-populates automatically on reconnect. Different prefixes produce independent broadcast lists, each backed by its own native `BroadcastSubscription`; overlapping prefixes that match the same broadcast path are not supported.

```tsx
function CamerasGrid({ session }) {
  const cameras = useBroadcasts(session, '/cameras');
  return cameras.map((b) => <BroadcastPlayer key={b.path} broadcast={b} />);
}

function MicrophonesList({ session }) {
  const mics = useBroadcasts(session, '/microphones');
  return mics.map((b) => <AudioOnly key={b.path} broadcast={b} />);
}
```

To discover when broadcasts appear or disappear without rendering them directly, diff the returned array between renders, or — for imperative side effects — wrap the hook in a small component that compares the previous and current path sets in `useEffect`.

---

### `useVideoPlayer(broadcast, setup?)`

Creates a reactive `Player` from a `BroadcastInfo`. The optional `setup` callback runs once on mount and is the right place to start playback and configure the player. The returned player is passed directly to `<VideoView>` (or `<VideoPlayerView>`).

```tsx
const player = useVideoPlayer(broadcast, (p) => {
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

Creates a reactive `AudioPlayer` that streams **audio only** for a broadcast — the video track is never subscribed and no video pipeline is started natively. Useful for background-audio modes, music broadcasts, or low-bandwidth contexts. The hook lazily creates a dedicated native player on mount and tears it down on unmount. The video+audio player from `broadcast.player` is independent and can run alongside if you also call `useVideoPlayer`.

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

Passing an `AudioPlayer` to `<VideoView>` (or `<VideoPlayerView>`) is a type error — the audio-only mode has no video output by design.

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

---

The library ships two components for putting the player on screen, layered on top of each other:

| Component | What it is | Use it when |
|---|---|---|
| [`<VideoView>`](#videoview) | The bare native video surface — renders the player's pixels and nothing else. | You want to build your own video UI (custom controls, custom fullscreen, custom overlays). |
| [`<VideoPlayerView>`](#videoplayerview) | A ready-made layout composed on top of `<VideoView>`. Adds a fullscreen modal, platform-styled controls, an `enterFullscreen()` / `exitFullscreen()` ref API, and an overlay `children` slot. | You want a working video experience without writing one yourself — or a starting point to copy and adapt. |

Both take a `Player` from [`useVideoPlayer`](#usevideoplayerbroadcast-setup); pick the one that matches how much UI you want the library to own.

---

### `<VideoView>`

The bare native video surface. Behaves like a normal RN view: takes `style` (and the rest of `ViewProps`), renders the player's video output at whatever size you give it, and that's it. No fullscreen, no controls, no overlay slot — for those you compose your own UI around it (or use [`<VideoPlayerView>`](#videoplayerview)).

```tsx
<VideoView
  player={player}
  style={{ width: '100%', aspectRatio: 16 / 9 }}
/>
```

| Prop | Type | Required | Description |
|---|---|---|---|
| `player` | `Player` | Yes | Player returned by `useVideoPlayer` |
| `style` | `ViewStyle` | No | Standard React Native style prop |

`<VideoView>` accepts the rest of the standard `ViewProps` and forwards them to the native view. It does **not** accept children — the underlying native view is not a `ViewGroup` on Android, so overlays must be siblings (typically absolutely positioned alongside the video).

---

### `<VideoPlayerView>`

A complete video player composed on top of `<VideoView>`. Inline it renders platform-styled mini chrome on top of the video — a centered play/pause and a bottom-right enter-fullscreen button, wrapped in the same tap-to-toggle auto-hide as the fullscreen chrome. Calling `enterFullscreen()` on its ref (or tapping the inline button) opens the video in an RN `<Modal>` with platform-styled chrome — close button, centered play/pause, tap-to-toggle auto-hide — and your overlay children layered on top. Both inline and fullscreen chrome are fully customizable (see [Fullscreen playback](#fullscreen-playback)); if you outgrow the preset entirely, the [source](src/VideoPlayerView.tsx) is short enough to copy into your app and adapt on top of `<VideoView>`.

```tsx
<VideoPlayerView
  player={player}
  style={{ width: '100%', aspectRatio: 16 / 9 }}
/>
```

| Prop | Type | Required | Description |
|---|---|---|---|
| `player` | `Player` | Yes | Player returned by `useVideoPlayer` |
| `style` | `ViewStyle` | No | Standard React Native style prop |
| `children` | `ReactNode` | No | Overlay content rendered above the video, inline and in fullscreen |
| `videoAspectRatio` | `number` | No | Source video aspect ratio (`width / height`). Used to letterbox the video inside the fullscreen modal so it isn't stretched on Android. Defaults to `16 / 9` |
| `controls` | `boolean \| ReactNode` | No | Chrome shown while in fullscreen. `true` (default) renders the built-in platform-styled controls; `false` disables them; passing your own element replaces them while keeping the same fade + tap-to-toggle behavior |
| `miniControls` | `boolean \| ReactNode` | No | Chrome shown inline (when not fullscreen). `true` (default) renders the built-in `<MiniPlayerControls />` — centered play/pause plus a bottom-right enter-fullscreen button; `false` disables them; passing your own element replaces them while keeping the same fade + tap-to-toggle behavior |
| `onFullscreenEnter` | `() => void` | No | Fired after the fullscreen modal opens |
| `onFullscreenExit` | `() => void` | No | Fired after the fullscreen modal closes (including dismissal via the Android hardware back button) |

Imperative methods on the ref:

| Method | Description |
|---|---|
| `enterFullscreen()` | Show the player in a fullscreen modal |
| `exitFullscreen()` | Dismiss the fullscreen modal |

```tsx
import { useRef } from 'react';
import { VideoPlayerView, type VideoPlayerViewRef } from 'react-native-moq';

const ref = useRef<VideoPlayerViewRef>(null);
// ...
ref.current?.enterFullscreen();
ref.current?.exitFullscreen();
```

See [Fullscreen playback](#fullscreen-playback) for examples covering the default chrome, disabling it, and replacing it with your own.

---

### `useFullscreenControls()`

Reads the fullscreen controls API from inside an element you've passed to `<VideoPlayerView controls={...} />`. Use this when building your own chrome and you want to opt in to the same tap-to-toggle / fade behavior the built-in controls use.

```tsx
const { player, exit, show, visible } = useFullscreenControls();
```

| Field | Type | Description |
|---|---|---|
| `player` | `Player` | The player driving the VideoPlayerView this chrome is mounted in |
| `exit` | `() => void` | Programmatically exit fullscreen (equivalent to `ref.current?.exitFullscreen()`) |
| `show` | `() => void` | Mark controls as visible and reset the auto-hide timer. Call this from any of your custom buttons' `onPress` so a tap doesn't immediately fade the chrome out from under the user's finger |
| `visible` | `boolean` | Whether the surrounding fade is currently animating to visible — only useful if your custom controls want to render differently while hidden |

Throws if called outside a VideoPlayerView fullscreen modal. The built-in [`<FullscreenControls />`](#fullscreencontrols) component (also exported) is the canonical consumer — read its [source](src/FullscreenControls.tsx) for a worked example.

---

### `<FullscreenControls />`

The default fullscreen chrome — a platform-styled close + play/pause overlay. Mounted automatically when `<VideoPlayerView controls />` (or `controls={true}`) is used. Exported so you can compose it into a larger custom chrome, e.g. side-by-side with extra buttons:

```tsx
import { FullscreenControls, useFullscreenControls } from 'react-native-moq';

function ChromeWithQualityPicker() {
  const { player, show } = useFullscreenControls();
  return (
    <>
      <FullscreenControls />
      <QualityPicker player={player} onSelect={show} />
    </>
  );
}

<VideoPlayerView player={player} controls={<ChromeWithQualityPicker />} />
```

Takes no props.

---

### `useMiniPlayerControls()`

Reads the inline (non-fullscreen) controls API from inside an element you've passed to `<VideoPlayerView miniControls={...} />`. Use this when building your own inline chrome and you want to opt in to the same tap-to-toggle / fade behavior the built-in mini controls use.

```tsx
const { player, enterFullscreen, show, visible } = useMiniPlayerControls();
```

| Field | Type | Description |
|---|---|---|
| `player` | `Player` | The player driving the VideoPlayerView this chrome is mounted in |
| `enterFullscreen` | `() => void` | Programmatically enter fullscreen (equivalent to `ref.current?.enterFullscreen()`) |
| `show` | `() => void` | Mark controls as visible and reset the auto-hide timer. Call this from any of your custom buttons' `onPress` so a tap doesn't immediately fade the chrome out from under the user's finger |
| `visible` | `boolean` | Whether the surrounding fade is currently animating to visible — only useful if your custom controls want to render differently while hidden |

Throws if called outside a VideoPlayerView inline view. The built-in [`<MiniPlayerControls />`](#miniplayercontrols-) component (also exported) is the canonical consumer — read its [source](src/MiniPlayerControls.tsx) for a worked example.

---

### `<MiniPlayerControls />`

The default inline chrome — a platform-styled centered play/pause plus a bottom-right enter-fullscreen button. Mounted automatically when `<VideoPlayerView miniControls />` (or `miniControls={true}`) is used. Exported so you can compose it into a larger custom chrome:

```tsx
import { MiniPlayerControls, useMiniPlayerControls } from 'react-native-moq';

function MiniChromeWithBadge() {
  const { player } = useMiniPlayerControls();
  return (
    <>
      <MiniPlayerControls />
      <LiveBadge player={player} />
    </>
  );
}

<VideoPlayerView player={player} miniControls={<MiniChromeWithBadge />} />
```

Takes no props.

---

### `PlayerHandle`

An opaque reference to a native player, available as `broadcast.player` inside `BroadcastInfo`. `useVideoPlayer(broadcast)` consumes this internally to produce a reactive `Player`. You can also call playback methods on the handle directly without the hook.

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
};
```

Broadcast availability is observed reactively via [`useBroadcasts`](#usebroadcastssession-prefix) rather than imperative session events.

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
  player: PlayerHandle; // opaque native handle — call methods directly, or pass the broadcast to useVideoPlayer / useAudioPlayer
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
const player = useVideoPlayer(broadcast, (p) => p.play());

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

Fullscreen support lives on the [`<VideoPlayerView>`](#videoplayerview) preset, which exposes imperative `enterFullscreen()` / `exitFullscreen()` methods on its ref. Internally it renders the video into an RN `<Modal>` so children are still part of RN's tree — overlay buttons remain tappable, and rendering works on both iOS and Android (where the underlying `SurfaceView` cannot host child views directly). If you want fullscreen with a different UX, copy [`src/VideoPlayerView.tsx`](src/VideoPlayerView.tsx) into your app and adapt it on top of the bare `<VideoView>` primitive.

By default the fullscreen modal renders platform-styled chrome — a close button (top-left on iOS, top-right on Android), a centered play/pause, and tap-to-toggle auto-hide. Most apps need nothing more than this:

```tsx
import { useRef } from 'react';
import { Button, View } from 'react-native';
import {
  VideoPlayerView,
  useVideoPlayer,
  type BroadcastInfo,
  type VideoPlayerViewRef,
} from 'react-native-moq';

function VideoSection({ broadcast }: { broadcast: BroadcastInfo }) {
  const player = useVideoPlayer(broadcast, (p) => p.play());
  const ref = useRef<VideoPlayerViewRef>(null);

  // Pass the active track's aspect to letterbox correctly in fullscreen
  // (Android's SurfaceView would otherwise stretch the video).
  const active =
    broadcast.videoTracks.find((t) => t.name === player.currentVideoTrackName) ??
    broadcast.videoTracks[0];
  const videoAspectRatio =
    active?.width && active?.height ? active.width / active.height : undefined;

  return (
    <View>
      <VideoPlayerView
        ref={ref}
        player={player}
        style={{ width: '100%', aspectRatio: 16 / 9 }}
        videoAspectRatio={videoAspectRatio}
      />
      <Button title="Fullscreen" onPress={() => ref.current?.enterFullscreen()} />
    </View>
  );
}
```

#### Disabling or replacing the default chrome

Pass `controls={false}` to hide it entirely — useful if you want a bare presentation, or if you're going to render your own overlay via `children`:

```tsx
<VideoPlayerView ref={ref} player={player} controls={false} />
```

Pass any ReactNode to replace it. Custom controls are wrapped in the same fade + tap-to-toggle gesture as the default, so they auto-hide after a few seconds and reappear on tap. Inside, call `useFullscreenControls()` to read the visibility state and the same `{ exit, show, player }` API the built-in chrome uses:

```tsx
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { VideoPlayerView, useFullscreenControls, useEvent } from 'react-native-moq';

function MyControls() {
  const { player, exit, show, visible } = useFullscreenControls();
  const { isPlaying } = useEvent(player, 'playingChange', {
    isPlaying: player.isPlaying,
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable
        onPress={() => {
          show(); // restart the auto-hide timer
          exit();
        }}
        style={styles.closeBtn}
      >
        <Text style={{ color: 'white' }}>✕</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          show();
          isPlaying ? player.pause() : player.play();
        }}
        style={styles.playBtn}
      >
        <Text style={{ color: 'white' }}>{isPlaying ? '⏸' : '▶'}</Text>
      </Pressable>
    </View>
  );
}

<VideoPlayerView ref={ref} player={player} controls={<MyControls />} />
```

You can mix and match: keep the default chrome on and use `children` for non-auto-hiding overlays like a rendition picker.

#### Notes

- `onFullscreenEnter` / `onFullscreenExit` fire on every transition, including dismissal via the Android hardware back button — your local `isFullscreen` state stays in sync without manual back-button handling.
- Children render alongside the native video (not inside it) on both platforms, so use absolute positioning for overlays.
- The native view briefly remounts on fullscreen toggle. The shared video output (the `AVSampleBufferDisplayLayer` on iOS, the player `Surface` on Android) is keyed by `broadcastPath` and re-attaches automatically; expect at most one frame of black during the transition.
- `videoAspectRatio` is only consulted in fullscreen. Inline layout is driven by the `style` prop as usual.

### Custom target latency

```tsx
// Set at session level via connect() (applies to all players created in this session)
const session = useSession(url, (s) => s.connect(500));
const broadcasts = useBroadcasts(session);

// Override per player in the setup callback
const player = useVideoPlayer(broadcast, (p) => {
  p.updateTargetLatency(100);
  p.play();
});

// Or change at runtime on the returned player
player.updateTargetLatency(300);
```

### Displaying live stats

```tsx
const player = useVideoPlayer(broadcast, (p) => p.play());

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
