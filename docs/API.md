# react-native-moq — API reference

Full API documentation for [`react-native-moq`](../README.md). For installation and a quick start, see the [main README](../README.md).

## Contents

- [Playback API](#playback-api)
  - [`useSession(url, setup?)`](#usesessionurl-setup)
  - [`useBroadcasts(session, prefix?)`](#usebroadcastssession-prefix)
  - [`useVideoPlayer(broadcast, setup?)`](#usevideoplayerbroadcast-setup)
  - [`useAudioPlayer(broadcast, setup?)`](#useaudioplayerbroadcast-setup)
  - [`useAudioChunks(broadcast, onChunk, options?)`](#useaudiochunksbroadcast-onchunk-options)
  - [`subscribeAudioChunks(broadcast, trackName, onChunk, options?)`](#subscribeaudiochunksbroadcast-trackname-onchunk-options)
  - [`useEvent(source, eventName, initialValue?)`](#useeventsource-eventname-initialvalue)
  - [`useEventListener(source, eventName, listener)`](#useeventlistenersource-eventname-listener)
  - [`player.addListener` / `session.addListener`](#playeraddlistenereventname-listener--sessionaddlistenereventname-listener)
  - [`<VideoView>`](#videoview)
  - [`PlayerHandle`](#playerhandle)
  - [Types](#types)
- [Publishing](#publishing)
  - [`useCamera(options?)`](#usecameraoptions)
  - [`useMicrophone(options?)`](#usemicrophoneoptions)
  - [`usePublisher(session)`](#usepublishersession)
  - [`<PublisherView />`](#publisherview-)
  - [`getSupportedVideoCodecs()` / `getSupportedAudioCodecs()`](#getsupportedvideocodecs--getsupportedaudiocodecs)
  - [`useDataTrack(options?)`](#usedatatrackoptions)
  - [Screen broadcasting](#screen-broadcasting)
  - [Publisher events](#publisher-events)
  - [Types](#types-1)
- [Advanced usage](#advanced-usage)
  - [Quality / rendition switching](#quality--rendition-switching)
  - [Custom target latency](#custom-target-latency)
  - [Displaying live stats](#displaying-live-stats)
- [Default UI components (`react-native-moq-ui`)](#default-ui-components-react-native-moq-ui)
  - [`<VideoPlayerView>`](#videoplayerview)
  - [`useFullscreenControls()`](#usefullscreencontrols)
  - [`<FullscreenControls />`](#fullscreencontrols-)
  - [`useMiniPlayerControls()`](#useminiplayercontrols)
  - [`<MiniPlayerControls />`](#miniplayercontrols-)
  - [`<VolumeSlider />` and `<SpeakerGlyph />`](#volumeslider--and-speakerglyph-)
  - [Fullscreen playback](#fullscreen-playback)

## Playback API

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
| `id` | `string` | Opaque per-hook identifier. Used internally to route native calls and events when multiple sessions are active |
| `url` | `string` | Relay URL passed to the hook |
| `state` | `SessionState` | Current connection state |
| `emitter` | `EventEmitter<SessionEvents>` | Stable emitter for session events |
| `addListener(eventName, listener)` | `(eventName, listener) => EventSubscription` | Subscribe to a session event imperatively; call `.remove()` to unsubscribe |
| `connect(targetLatencyMs?)` | `(targetLatencyMs?: number) => void` | Open the relay session. Default: `targetLatencyMs=200` |
| `disconnect()` | `() => void` | Close the session (also tears down all active broadcast subscriptions) and reset state |

**`SessionState`** is one of: `'idle'` · `'connecting'` · `'connected'` · `'closed'` · `` `error:${string}` ``

Call `connect()` manually — either in the setup callback or in response to user interaction. The hook does not auto-connect. To start receiving broadcasts, call [`useBroadcasts(session, prefix?)`](#usebroadcastssession-prefix) — it begins the underlying native subscription on mount and tears it down on unmount.

**Multiple sessions.** Each `useSession` call is independent: subscribe to one relay while publishing to another, or open two logical sessions against the same URL. Pass the right `Session` into `useBroadcasts` / `usePublisher` to scope work to it; the library keys all native state by `session.id`.

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
| `sessionId` | `string` | The session this player belongs to (matches `broadcast.sessionId`) |
| `broadcastPath` | `string` | The broadcast path this player belongs to |
| `isPlaying` | `boolean` | True while tracks are actively playing |
| `playbackStats` | `PlaybackStats \| null` | Live metrics, updated every 500 ms |
| `currentVideoTrackName` | `string \| undefined` | Name of the active video track |
| `currentAudioTrackName` | `string \| undefined` | Name of the active audio track |
| `volume` | `number` | Current per-player audio output volume in `0..1`. Defaults to `1`; does not affect other audio playing on the device |
| `emitter` | `EventEmitter<PlayerEvents>` | Stable emitter for player events |
| `addListener(eventName, listener)` | `(eventName, listener) => EventSubscription` | Subscribe to a player event imperatively; call `.remove()` to unsubscribe |
| `play()` | `() => void` | Start or resume playback |
| `pause()` | `() => void` | Pause playback |
| `stop()` | `() => void` | Stop playback and reset state |
| `updateTargetLatency(ms)` | `(ms: number) => void` | Change buffering latency at runtime |
| `switchVideoTrack(name)` | `(name: string) => void` | Switch to a different video rendition |
| `switchAudioTrack(name)` | `(name: string) => void` | Switch to a different audio track |
| `setVolume(volume)` | `(volume: number) => void` | Set per-player audio output volume. Values are clamped to `0..1` |

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
| `sessionId` | `string` | The session this player belongs to |
| `broadcastPath` | `string` | Internal key for this audio-only player (broadcast path with an `_audio` suffix) |
| `isPlaying` | `boolean` | True while audio is actively playing |
| `playbackStats` | `PlaybackStats \| null` | Live metrics, updated every 500 ms (only audio fields are populated) |
| `currentAudioTrackName` | `string \| undefined` | Name of the active audio track |
| `volume` | `number` | Current per-player audio output volume in `0..1`. Defaults to `1` |
| `emitter` | `EventEmitter<PlayerEvents>` | Stable emitter for player events |
| `addListener(eventName, listener)` | `(eventName, listener) => EventSubscription` | Subscribe to a player event imperatively |
| `play()` | `() => void` | Start or resume playback |
| `pause()` | `() => void` | Pause playback |
| `stop()` | `() => void` | Stop playback and reset state |
| `updateTargetLatency(ms)` | `(ms: number) => void` | Change buffering latency at runtime |
| `switchAudioTrack(name)` | `(name: string) => void` | Switch to a different audio track |
| `setVolume(volume)` | `(volume: number) => void` | Set per-player audio output volume. Values are clamped to `0..1` |

The same `PlayerEvents` apply (`playingChange`, `trackStopped`, `trackSwitched`, `statsUpdate`); `trackSwitched` only fires with `trackKind: 'audio'`. The audio-only stream uses a separate native player from the video+audio one, so both can run alongside each other for the same broadcast.

Passing an `AudioPlayer` to `<VideoView>` (or `<VideoPlayerView>`) is a type error — the audio-only mode has no video output by design.

---

### `useAudioChunks(broadcast, onChunk, options?)`

Receives a broadcast's audio as a stream of **encoded chunks** — each callback gets one MoQ object (one Opus/AAC frame, exactly as published) as an `ArrayBuffer`. Use this to route audio into another pipeline such as [react-native-audio-api](https://docs.swmansion.com/react-native-audio-api/) or [react-native-executorch](https://docs.swmansion.com/react-native-executorch/) instead of (or alongside) the built-in `useAudioPlayer`.

```tsx
import { useAudioChunks } from 'react-native-moq';

const audio = useAudioChunks(broadcast, (chunk) => {
  // chunk.data is encoded (chunk.codec — 'opus' | 'aac'); decode before use.
  decoder.push(chunk.data);
});

return <Button title="Stop" onPress={audio.stop} />;
```

> **These chunks are encoded, not PCM.** `data` holds raw Opus/AAC bytes. Decode them downstream (e.g. with react-native-audio-api) before playback or feeding an ML model — executorch speech-to-text expects mono Float32 PCM at 16 kHz, and `AudioContext.decodeAudioData` handles AAC but not Opus or un-containerized streaming frames. A native decoded-PCM path may be added later.

`onChunk` is kept in a ref, so changing it between renders does not re-create the subscription. The subscription stops automatically on unmount.

**Options:**

| Option | Type | Description |
|---|---|---|
| `trackName` | `string` | Audio track to listen to. Defaults to the broadcast's first audio track |
| `autoStart` | `boolean` | Start receiving on mount. Defaults to `true`; pass `false` to defer until `.start()` |

Returns a [`ChunkSubscription`](#chunksubscription):

| Property / Method | Type | Description |
|---|---|---|
| `sessionId` | `string` | The session this subscription belongs to |
| `broadcastPath` | `string` | The broadcast path being consumed |
| `trackName` | `string` | The audio track being consumed |
| `isActive` | `boolean` | Whether chunks are currently being received |
| `start()` | `() => void` | (Re)start receiving. Idempotent |
| `stop()` | `() => void` | Stop receiving and release the native track subscription. Idempotent |

`stop()` closes the underlying moq-kit track subscription, which **stops pulling that track over the network** — call it whenever you aren't consuming. For a *dynamic* set of tracks or broadcasts, use [`subscribeAudioChunks`](#subscribeaudiochunksbroadcast-trackname-onchunk-options) inside your own effect rather than calling this hook in a loop.

---

### `subscribeAudioChunks(broadcast, trackName, onChunk, options?)`

The framework-agnostic core that `useAudioChunks` wraps — works with or without React. Each call subscribes to one `(broadcast, trackName)` and returns an independent [`ChunkSubscription`](#chunksubscription). For multiple audio tracks (within one broadcast or across several), call it once per track; each handle starts/stops on its own.

```ts
import { subscribeAudioChunks } from 'react-native-moq';

// single track
const sub = subscribeAudioChunks(broadcast, 'audio', onChunk);
sub.stop();

// multiple tracks across multiple broadcasts
const subs = broadcasts.map((b) =>
  subscribeAudioChunks(b, b.audioTracks[0].name, (c) => route(b.path, c))
);
// teardown: subs.forEach((s) => s.stop());
```

Subscriptions to the same `(session, path, track)` share one native track subscription under the hood (ref-counted), so it is safe to subscribe more than once.

**Options:** `{ autoStart?: boolean }` — start immediately (default `true`).

In React, use this inside an effect for dynamic track sets — it sidesteps the rules-of-hooks constraint of calling `useAudioChunks` in a loop:

```tsx
useEffect(() => {
  const subs = trackNames.map((t) => subscribeAudioChunks(broadcast, t, onChunk));
  return () => subs.forEach((s) => s.stop());
}, [broadcast, trackNames]);
```

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

The core library ships a single component for putting the player on screen: [`<VideoView>`](#videoview), the bare native video surface. Build your own controls and overlays around it, or pull in the companion [`react-native-moq-ui`](#default-ui-components-react-native-moq-ui) package for a ready-made player layout with fullscreen + platform-styled chrome.

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
  readonly sessionId: string;
  readonly broadcastPath: string;
  readonly isPlaying: boolean;
  readonly playbackStats: PlaybackStats | null;
  readonly currentAudioTrackName?: string;
  readonly volume: number;
  readonly emitter: EventEmitter<PlayerEvents>;
  addListener<T extends keyof PlayerEvents>(eventName: T, listener: PlayerEvents[T]): EventSubscription;
  play(): void;
  pause(): void;
  stop(): void;
  updateTargetLatency(ms: number): void;
  switchAudioTrack(trackName: string): void;
  setVolume(volume: number): void;
}
```

#### `BroadcastInfo`

```ts
interface BroadcastInfo {
  sessionId: string;       // session the broadcast was discovered on
  path: string;
  videoTracks: VideoTrackInfo[];
  audioTracks: AudioTrackInfo[];
  player: PlayerHandle;    // opaque native handle — call methods directly, or pass the broadcast to useVideoPlayer / useAudioPlayer
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

#### `AudioChunk`

One encoded audio object delivered by [`useAudioChunks`](#useaudiochunksbroadcast-onchunk-options) / [`subscribeAudioChunks`](#subscribeaudiochunksbroadcast-trackname-onchunk-options).

```ts
interface AudioChunk {
  data: ArrayBuffer; // encoded Opus/AAC bytes for one MoQ object (not PCM)
  trackName: string;
  codec: string; // 'opus' | 'aac', from the catalog
  sampleRate: number; // source sample rate, or 0 if unknown
  channelCount?: number;
  groupSequence: number; // MoQ group sequence — detect gaps/ordering
  objectIndex: number; // object index within the group
}
```

#### `ChunkSubscription`

```ts
interface ChunkSubscription {
  readonly sessionId: string;
  readonly broadcastPath: string;
  readonly trackName: string;
  readonly isActive: boolean;
  start(): void;
  stop(): void;
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

## Publishing

The publisher captures audio + video from the device camera + microphone and pushes them to a MoQ relay. It reuses a [`Session`](#usesessionurl-setup) you've already opened with `useSession`, so the same connection can simultaneously publish and subscribe.

Sources live in their own hooks — `useCamera` and `useMicrophone` each own the native capture lifecycle and are refcounted singletons (one physical camera and one physical mic shared across every consumer). The hooks start their capture on mount and stop it on unmount. `usePublisher` consumes the source objects: pass the ones you want to publish into `publish({ path, tracks })`.

Screen sharing is a different beast — it runs out-of-process and opens its own MoQ connection — so it has its own hook, [`useScreenBroadcast`](#screen-broadcasting), independent of `usePublisher`.

To publish arbitrary data alongside (or instead of) camera/microphone media — controller input, chat, telemetry — add a [`useDataTrack`](#usedatatrackoptions) source to `publish()`. A single broadcast can mix video, audio, and data tracks, just like MoQKit's `Publisher`.

```tsx
import { useEffect } from 'react';
import { Button, PermissionsAndroid, Platform } from 'react-native';
import {
  PublisherView,
  useCamera,
  useMicrophone,
  usePublisher,
  useSession,
} from 'react-native-moq';

function PublishScreen() {
  const session = useSession('http://relay.example.com:4443');
  const camera = useCamera();
  const microphone = useMicrophone();
  const publisher = usePublisher(session);

  // Open the shared session up front so publish() has a connection to reuse.
  useEffect(() => {
    if (session.state === 'idle' || session.state === 'closed') session.connect();
  }, [session]);

  useEffect(() => {
    if (Platform.OS === 'android') {
      PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ]);
    }
  }, []);

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

Because publish reuses the host session, you can subscribe and publish on the same connection — pair `usePublisher(session)` with `useBroadcasts(session, prefix)` to do both at once. You can also drive two relays concurrently by opening two `useSession` hooks and handing each one to its own publisher / subscriber.

The host app is responsible for requesting `CAMERA` / `RECORD_AUDIO` runtime permissions on Android, and for adding `NSCameraUsageDescription` / `NSMicrophoneUsageDescription` to `Info.plist` on iOS. The library does not request these for you.

---

### `useCamera(options?)`

Owns the device camera. Starts capture on mount, stops on unmount. The capture is refcounted natively, so multiple `useCamera` hooks (or a hook + a live publish + an on-screen preview) share one `CameraCapture` instance. The position is global to the physical camera — calling `flip()` or `setPosition()` on any hook is visible to every other consumer.

`publish()` snapshots the current encoder config (`videoCodec`, `width`, `height`, `framerate`) from the camera object at call time; to change those on a live broadcast, update the options and call `publish()` again.

```tsx
const camera = useCamera({
  position: 'front',     // initial — change at runtime via camera.setPosition / camera.flip
  videoCodec: 'h264',
  width: 1280,
  height: 720,
  framerate: 30,
});
```

Returns a `CameraTrack`:

| Property / Method | Type | Description |
|---|---|---|
| `state` | `CameraCaptureState` | `'idle' \| 'starting' \| 'active' \| `error:${string}`` |
| `lastError` | `string \| null` | Last capture error, or `null` if healthy |
| `position` | `'front' \| 'back'` | Currently active camera |
| `encoder` | `VideoEncoderOptions` | `{ codec, width, height, framerate }` — snapshotted by `publish()` |
| `flip()` | `() => void` | Toggle between front and back |
| `setPosition(pos)` | `('front' \| 'back') => void` | Switch to a specific camera |

Pass it into `publisher.publish({ tracks: [camera, …] })` to include the camera in a broadcast, and into `<PublisherView camera={camera} />` to render the on-screen preview.

---

### `useMultiCamera(options?)`

Captures the front and back cameras **simultaneously** and exposes them as two independent publishable tracks. This is a distinct capture path from `useCamera` (iOS `AVCaptureMultiCamSession`, Android CameraX concurrent camera), so it's a fixed front+back pair — not arbitrary cameras — and the two streams can't be flipped. Like `useCamera`, the capture is a refcounted native singleton started on mount and stopped on unmount.

Concurrent capture isn't available on every device. Gate your UI on the returned `isSupported`, or call [`isMultiCameraSupported()`](#ismulticamerasupported) before mounting the hook (it doesn't start any hardware).

```tsx
const { isSupported, state, front, back } = useMultiCamera({
  videoCodec: 'h264', // see the note below on dual-encoder support
  width: 720,
  height: 1280,
  framerate: 30,
});
```

Returns a `MultiCameraTrack`:

| Property | Type | Description |
|---|---|---|
| `isSupported` | `boolean \| null` | Whether the device can run both cameras at once. `null` while the async capability check is in flight |
| `state` | `MultiCameraState` | Shared capture state: `'idle' \| 'starting' \| 'active' \| `error:${string}`` |
| `lastError` | `string \| null` | Last capture error, or `null` if healthy |
| `front` | `CameraTrack` | The front camera, published as the `front-camera` track |
| `back` | `CameraTrack` | The back camera, published as the `back-camera` track |

`front` and `back` are ordinary `CameraTrack`s — pass them into `<PublisherView camera={front} />` to preview each, and into `publisher.publish({ tracks: [front, back, …] })` to publish both. Each becomes a separate video track in the broadcast, so a subscriber can play or switch between them. (`flip()` / `setPosition()` on these tracks are no-ops — the positions are fixed.)

> **Dual encoder support.** Publishing two cameras runs two hardware video encoders at once. Two H.264 encoders run concurrently on a wide range of devices; two **H.265** encoders are far more limited — on many devices the second HEVC encoder is created but silently produces no frames, so only one track reaches the broadcast. Prefer `videoCodec: 'h264'` for dual-camera publishing unless you've verified H.265 works on your target hardware.

#### `isMultiCameraSupported()`

```ts
function isMultiCameraSupported(): Promise<boolean>;
```

Resolves whether the device supports concurrent front+back capture, without starting any capture. Use it to decide whether to offer a dual-camera mode before mounting `useMultiCamera`.

---

### `useMicrophone(options?)`

Owns the device microphone. Starts capture on mount, stops on unmount. Refcounted in the same way as the camera. The audio session category is driven from the mic lifecycle: `playAndRecord` while the mic is capturing, `playback` otherwise.

`publish()` snapshots the encoder config at call time; the `audioSampleRate` is also the AudioRecord capture format on Android, so changing it after the hook has mounted is a no-op until the hook is remounted (e.g. with a `key` prop).

```tsx
const microphone = useMicrophone({
  audioCodec: 'opus',
  audioSampleRate: 48000,
});
```

Returns a `MicrophoneTrack`:

| Property | Type | Description |
|---|---|---|
| `state` | `MicrophoneCaptureState` | `'idle' \| 'starting' \| 'active' \| `error:${string}`` |
| `lastError` | `string \| null` | Last capture error, or `null` if healthy |
| `encoder` | `AudioEncoderOptions` | `{ codec, sampleRate }` — snapshotted by `publish()` |

---

### `usePublisher(session)`

Attaches a publisher to a `Session` returned by [`useSession`](#usesessionurl-setup). Mounting the hook does not start anything — calling `publish()` creates a native `Publisher` on top of the existing session, adds the tracks you pass, and starts it; calling `stop()` tears the publisher down (the session stays open). Re-renders are driven by native state events (`publisherStateChanged`, `publisherTrackStateChanged`).

The session must be `connected` when `publish()` is called — otherwise the publisher transitions to `error:session is not connected` immediately. Wait for `session.state === 'connected'` (or gate the UI on it) before publishing. Each `PublishTrack` in `tracks` must come from a currently-mounted source hook (`useCamera` / `useMicrophone` / `useDataTrack`); if a media capture is still starting, `publish()` awaits it.

```tsx
const session = useSession('http://relay.example.com:4443');
const camera = useCamera({ videoCodec: 'h265', width: 1280, height: 720, framerate: 30 });
const microphone = useMicrophone({ audioCodec: 'opus', audioSampleRate: 48000 });
const publisher = usePublisher(session);

publisher.publish({
  path: 'live/cam-1',
  tracks: [camera, microphone], // any subset — audio-only, video-only, both
});
```

Changing the published track set (e.g. dropping the mic) is a `publish()` again — moq-kit finalizes the track set when the broadcaster starts, so swapping sources restarts the broadcast.

Returns a `Publisher` object:

| Property / Method | Type | Description |
|---|---|---|
| `state` | `PublisherState` | Current publishing state |
| `trackStates` | `Record<string, PublishedTrackState>` | Per-track lifecycle, keyed by track name (`"camera"`, `"mic"`, …) |
| `lastError` | `string \| null` | Last error message, or `null` if the publisher is healthy |
| `emitter` | `EventEmitter<PublisherEvents>` | Stable emitter for publisher events |
| `addListener(eventName, listener)` | `(eventName, listener) => EventSubscription` | Subscribe to a publisher event imperatively; call `.remove()` to unsubscribe |
| `publish(opts)` | `(opts: PublishOptions) => void` | Start publishing the listed tracks on the bound session. Requires `session.state === 'connected'` |
| `stop()` | `() => void` | Stop all tracks and clear `trackStates`. Does not disconnect the underlying session, nor stop the capture hooks |

**`PublisherState`** is one of: `'idle'` · `'connecting'` · `'publishing'` · `'stopped'` · `` `error:${string}` ``

**`PublishedTrackState`** is one of: `'idle'` · `'starting'` · `'active'` · `'stopped'`

---

### `<PublisherView />`

Renders whatever the shared camera capture is producing. The capture lifecycle belongs to `useCamera` — mounting or unmounting the view does **not** start or stop the camera. Pass the camera hook in via the `camera` prop so the dependency is explicit and the capture is guaranteed to be alive while the preview is on screen.

```tsx
const camera = useCamera({ position: 'front' });

<PublisherView camera={camera} style={{ aspectRatio: 9 / 16 }} />
```

| Prop | Type | Required | Description |
|---|---|---|---|
| `camera` | `CameraTrack` | Yes | The camera driving this preview — a `useCamera` track, or a `front` / `back` track from [`useMultiCamera`](#usemulticameraoptions) |
| `style` | `ViewStyle` | No | Standard React Native style prop |

The component accepts the rest of the standard `ViewProps` and forwards them to the native view.

---

### `getSupportedVideoCodecs()` / `getSupportedAudioCodecs()`

Synchronous queries for the codecs whose encoder will actually initialize on this device. Use them to gate codec pickers in publishing UI — selecting a codec the device can't encode silently terminates the broadcast on Android (moq-kit reports the failure as a clean stop, not an error state).

```tsx
import {
  getSupportedVideoCodecs,
  getSupportedAudioCodecs,
} from 'react-native-moq';

const VIDEO = getSupportedVideoCodecs(); // → ['h264', 'h265']
const AUDIO = getSupportedAudioCodecs(); // → ['opus', 'aac']

const initialVideoCodec = VIDEO.includes('h265') ? 'h265' : 'h264';
```

Both depend only on hardware/OS capabilities and won't change at runtime, so it's safe to call once at module load and cache the result.

---

### `useDataTrack(options?)`

A publishable **data track** — the data counterpart of [`useCamera`](#usecameraoptions) / [`useMicrophone`](#usemicrophoneoptions). Instead of media, it carries app-defined string payloads (controller input, chat, telemetry). Like the media source hooks, it owns its native resource for the hook's lifetime (here a MoQKit `DataTrackEmitter`, created on mount, destroyed on unmount) and is consumed by [`usePublisher`](#usepublishersession): pass it in `tracks` and it becomes a data track in the broadcast, alongside any camera/microphone tracks.

This mirrors MoQKit directly — a standalone emitter handed to `Publisher.addDataTrack` — so a single broadcast can mix video, audio, and data tracks under one path.

```tsx
import { useDataTrack } from 'react-native-moq';

const command = useDataTrack({ name: 'command' }); // track name subscribers read
```

Returns a `DataTrack`:

| Property / Method | Type | Description |
|---|---|---|
| `__type` | `'data'` | Discriminator used by `usePublisher` to route to a data track |
| `__name` | `string` | Track name in the broadcast catalog (the `name` option) |
| `send(payload)` | `(payload: string) => void` | Send one UTF-8 string payload (e.g. JSON). No-op until the owning publisher has published and started; payloads are delivered in call order |

Include it in a publish to start sending. The track sends nothing until the publisher reaches `publishing`; `send()` before then is a no-op:

```tsx
const session = useSession('http://relay.example.com:4443', (s) => s.connect());
const camera = useCamera();
const command = useDataTrack({ name: 'command' });
const publisher = usePublisher(session);

// One broadcast carrying both video and a data track.
publisher.publish({ path: 'live/game-1', tracks: [camera, command] });

// Push payloads once publisher.state === 'publishing'.
command.send(JSON.stringify({ type: 'buttons', buttons: ['a', 'up'] }));
command.send(JSON.stringify({ type: 'reset' }));
```

Subscribers read these objects from a track of the same `name` on the broadcast. For a data-only broadcast (e.g. a controller publishing to its own path), just pass a single data track: `publisher.publish({ path, tracks: [command] })`. Pair it with [`useBroadcasts(session, prefix)`](#usebroadcastssession-prefix) to discover peers and exchange data over one connection — the pattern behind chat- and cloud-gaming-style demos. The MoQBoy tab in the example app ([`example/src/screens/MoQBoyScreen.tsx`](../example/src/screens/MoQBoyScreen.tsx)) is a worked cloud-gaming controller built on exactly this hook.

**`DataTrackOptions`**

```ts
interface DataTrackOptions {
  name?: string; // Track name subscribers read from. Default: 'data'
}
```

> Payloads are UTF-8 strings; for binary data, encode it (e.g. base64) before `send()`.

---

### Screen broadcasting

Screen capture runs out-of-process on iOS (a `Broadcast Upload Extension`) and in a foreground `Service` on Android. Because it lives in another process, it can't share the host's `usePublisher` session — it opens its own MoQ connection from the session URL you pass in. It also publishes to its own broadcast path (independent of any camera/mic publish), so subscribers can pick it up as a separate stream.

#### `useScreenBroadcast(session, options)`

Manages the out-of-process screen broadcast bound to the given `Session`. Mounting the hook reconfigures the native side with the current relay URL + options (on iOS this writes the App Group descriptor that the Broadcast Upload Extension reads at launch; on Android it caches the config for the next `start()` call). The options are watched — change any field and the native config is rewritten automatically.

Screen broadcast is a device singleton (one ReplayKit / MediaProjection session at a time), so multiple instances of this hook will all observe the same state.

```tsx
import { useScreenBroadcast, useSession } from 'react-native-moq';

const session = useSession('http://relay.example.com:4443');
const screen = useScreenBroadcast(session, {
  path: 'live/cam-1/screenshare',
  appGroupIdentifier: 'group.com.example.screenbroadcast', // iOS only
  appAudio: true, // iOS only — capture audio from the broadcasting app
  mic: true,
  videoCodec: 'h264',
  width: 1280,
  height: 720,
  framerate: 30,
});
```

Returns a `ScreenBroadcast` object:

| Property / Method | Type | Description |
|---|---|---|
| `state` | `ScreenBroadcastState` | Current screen-broadcast state |
| `lastError` | `string \| null` | Last error message, or `null` if healthy |
| `start()` | `() => Promise<void>` | Android only — starts the foreground MediaProjection service. Rejects on iOS |
| `stop()` | `() => void` | Stop the active screen broadcast |

**`ScreenBroadcastState`** is one of: `'idle'` · `'connecting'` · `'broadcasting'` · `'stopped'` · `` `error:${string}` ``

#### iOS

iOS cannot start a system broadcast programmatically — the user must tap `<BroadcastPickerView>` to open the system sheet. `screen.start()` always rejects. The extension reports its real state back through `screen.state`.

```tsx
import { BroadcastPickerView } from 'react-native-moq';

<BroadcastPickerView
  preferredExtension="com.example.app.MyBroadcastUpload"
  tintColor="#2563eb"
  style={{ width: 44, height: 44 }}
/>
```

Setup on iOS requires:
- A `Broadcast Upload Extension` target in your Xcode project. The library ships `MoQReplayKitBroadcastSampleHandler` — subclass it in your extension and override `makeReplayKitBroadcastConfiguration` if you need custom encoder settings.
- An `App Group` entitlement on **both** the host app and the extension. Pass its identifier as `appGroupIdentifier` so the two processes can share the broadcast descriptor.
- The extension's bundle identifier supplied via `preferredExtension` so the picker pre-selects it.

#### Android

Android drives the foreground service directly. `screen.start()` triggers the system `MediaProjection` consent dialog and only resolves once the user grants it.

```tsx
const onToggleScreen = (next: boolean) => {
  if (next) {
    screen.start().catch(() => {/* user denied consent */});
  } else {
    screen.stop();
  }
};
```

Setup on Android requires the `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PROJECTION` permissions and the `ScreenBroadcastService` service declaration in `AndroidManifest.xml` (handled by the library's manifest merger — no manual step needed in typical apps).

`<BroadcastPickerView>` renders nothing on Android, so the same JSX can be conditionally branched on `Platform.OS` without crashing.

---

### Publisher events

| Event | Payload | Description |
|---|---|---|
| `stateChange` | `{ state: PublisherState }` | Publisher state transitioned |
| `trackStateChange` | `{ name, state, error? }` | A published track changed lifecycle state (or errored) |

Subscribe via `useEventListener`, `useEvent`, or `publisher.addListener` — same patterns as the player/session events documented above.

---

### Types

#### `PublishOptions`

```ts
interface PublishOptions {
  path: string;           // Broadcast path published to the relay
  tracks: PublishTrack[]; // Sources from useCamera / useMicrophone / useDataTrack
}

type PublishTrack = CameraTrack | MicrophoneTrack | DataTrack;
```

#### `CameraOptions` / `MicrophoneOptions`

```ts
interface CameraOptions {
  position?: 'front' | 'back'; // Default: 'front'
  videoCodec?: VideoCodec;     // 'h264' | 'h265', default: 'h264'
  width?: number;              // Default: 1280
  height?: number;             // Default: 720
  framerate?: number;          // Default: 30
}

interface MicrophoneOptions {
  audioCodec?: AudioCodec;     // 'opus' | 'aac', default: 'opus'
  audioSampleRate?: number;    // Default: 48000
}
```

#### `ScreenBroadcastOptions`

```ts
interface ScreenBroadcastOptions {
  path: string;
  appGroupIdentifier?: string; // iOS — required there, ignored on Android
  appAudio?: boolean;          // iOS only, defaults true
  mic?: boolean;               // defaults true
  videoCodec?: VideoCodec;
  width?: number;
  height?: number;
  framerate?: number;
  audioCodec?: AudioCodec;
  audioSampleRate?: number;
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

## Default UI components (`react-native-moq-ui`)

A companion package that layers a ready-made player chrome on top of the core [`<VideoView>`](#videoview): a `<VideoPlayerView>` with platform-styled inline + fullscreen controls, a `<VolumeSlider>`, and matching context hooks for composing your own chrome on top of the same fade / tap-to-toggle behavior.

It's a separate install so apps that build their own player UI don't pay for it — see [Optional: default UI components](../README.md#optional-default-ui-components) for setup. Everything below is exported from `react-native-moq-ui` and consumes [`Player`](#usevideoplayerbroadcast-setup) / [`AudioPlayer`](#useaudioplayerbroadcast-setup) values produced by the core hooks.

### `<VideoPlayerView>`

A complete video player composed on top of `<VideoView>`. Inline it renders platform-styled mini chrome on top of the video — a centered play/pause and a bottom-right enter-fullscreen button, wrapped in the same tap-to-toggle auto-hide as the fullscreen chrome. Calling `enterFullscreen()` on its ref (or tapping the inline button) opens the video in an RN `<Modal>` with platform-styled chrome — close button, centered play/pause, tap-to-toggle auto-hide — and your overlay children layered on top. Both inline and fullscreen chrome are fully customizable (see [Fullscreen playback](#fullscreen-playback)); if you outgrow the preset entirely, the [source](../packages/react-native-moq-ui/src/VideoPlayerView.tsx) is short enough to copy into your app and adapt on top of `<VideoView>`.

```tsx
<VideoPlayerView
  player={player}
  style={{ width: '100%', aspectRatio: 16 / 9 }}
/>
```

| Prop | Type | Required | Description |
|---|---|---|---|
| `player` | `Player` | Yes | Player returned by [`useVideoPlayer`](#usevideoplayerbroadcast-setup) |
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
import { VideoPlayerView, type VideoPlayerViewRef } from 'react-native-moq-ui';

const ref = useRef<VideoPlayerViewRef>(null);
// ...
ref.current?.enterFullscreen();
ref.current?.exitFullscreen();
```

See [Fullscreen playback](#fullscreen-playback) below for examples covering the default chrome, disabling it, and replacing it with your own.

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

Throws if called outside a VideoPlayerView fullscreen modal. The built-in [`<FullscreenControls />`](#fullscreencontrols-) component (also exported) is the canonical consumer — read its [source](../packages/react-native-moq-ui/src/components/FullscreenControls.tsx) for a worked example.

---

### `<FullscreenControls />`

The default fullscreen chrome — a platform-styled close + play/pause overlay. Mounted automatically when `<VideoPlayerView controls />` (or `controls={true}`) is used. Exported so you can compose it into a larger custom chrome, e.g. side-by-side with extra buttons:

```tsx
import { FullscreenControls, useFullscreenControls } from 'react-native-moq-ui';

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

Throws if called outside a VideoPlayerView inline view. The built-in [`<MiniPlayerControls />`](#miniplayercontrols-) component (also exported) is the canonical consumer — read its [source](../packages/react-native-moq-ui/src/components/MiniPlayerControls.tsx) for a worked example.

---

### `<MiniPlayerControls />`

The default inline chrome — a platform-styled centered play/pause, a bottom-left volume slider, and a bottom-right enter-fullscreen button. Mounted automatically when `<VideoPlayerView miniControls />` (or `miniControls={true}`) is used. The same volume slider is also rendered along the bottom of the default fullscreen chrome. Exported so you can compose it into a larger custom chrome:

```tsx
import { MiniPlayerControls, useMiniPlayerControls } from 'react-native-moq-ui';

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

### `<VolumeSlider />` and `<SpeakerGlyph />`

Building blocks behind the volume control in the default mini and fullscreen chrome. Useful for adding volume to your own custom chrome, or to non-video surfaces like the audio-only example in [`example/src/components/BroadcastPlayer.tsx`](../example/src/components/BroadcastPlayer.tsx).

```tsx
import { useAudioPlayer } from 'react-native-moq';
import { SpeakerGlyph, VolumeSlider } from 'react-native-moq-ui';

function AudioCard({ broadcast }) {
  const player = useAudioPlayer(broadcast, (p) => p.play());
  return (
    <View style={styles.row}>
      <SpeakerGlyph size={16} color="#374151" volume={player.volume} />
      <VolumeSlider player={player} width={200} theme="light" />
    </View>
  );
}
```

`<VolumeSlider>` props:

| Prop | Type | Required | Description |
|---|---|---|---|
| `player` | `Player \| AudioPlayer` | Yes | Player to drive — calls `setVolume()` and reads `volume` |
| `width` | `number` | No | Pixel width of the slider. Default `140` |
| `theme` | `'dark' \| 'light'` | No | `'dark'` (default) renders white on a translucent dark scrim — meant for video overlays. `'light'` renders blue-ish on neutral gray — meant for light card backgrounds |

`<SpeakerGlyph>` props:

| Prop | Type | Required | Description |
|---|---|---|---|
| `size` | `number` | No | Icon size in pixels. Default `16` |
| `volume` | `number` | No | `0..1`; selects how many of the three wave arcs are filled. `0` shows the mute slash. Default `1` |
| `color` | `string` | No | Foreground color. Inactive arcs use a 35%-alpha variant of the same color. Default `#fff` |

Drawn from plain `<View>`s — no SVG or icon-font dependency.

---

### Fullscreen playback

Fullscreen support lives on the [`<VideoPlayerView>`](#videoplayerview) preset, which exposes imperative `enterFullscreen()` / `exitFullscreen()` methods on its ref. Internally it renders the video into an RN `<Modal>` so children are still part of RN's tree — overlay buttons remain tappable, and rendering works on both iOS and Android (where the underlying `SurfaceView` cannot host child views directly). If you want fullscreen with a different UX, copy [`packages/react-native-moq-ui/src/VideoPlayerView.tsx`](../packages/react-native-moq-ui/src/VideoPlayerView.tsx) into your app and adapt it on top of the bare [`<VideoView>`](#videoview) primitive.

By default the fullscreen modal renders platform-styled chrome — a close button (top-left on iOS, top-right on Android), a centered play/pause, and tap-to-toggle auto-hide. Most apps need nothing more than this:

```tsx
import { useRef } from 'react';
import { Button, View } from 'react-native';
import { useVideoPlayer, type BroadcastInfo } from 'react-native-moq';
import {
  VideoPlayerView,
  type VideoPlayerViewRef,
} from 'react-native-moq-ui';

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
import { useEvent } from 'react-native-moq';
import { VideoPlayerView, useFullscreenControls } from 'react-native-moq-ui';

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
