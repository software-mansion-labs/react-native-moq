# react-native-moq — API reference

Full API documentation for [`react-native-moq`](../README.md). For installation and a quick start, see the [main README](../README.md).

## Contents

- [Conventions](#conventions)
- [Playback API](#playback-api)
  - [`useSession(url, setup?)`](#usesessionurl-setup)
  - [`useBroadcasts(session, prefix?)`](#usebroadcastssession-prefix)
  - [`useVideoPlayer(broadcast, setup?)`](#usevideoplayerbroadcast-setup)
  - [Choosing an audio API](#choosing-an-audio-api)
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
  - [`useMultiCamera(options?)`](#usemulticameraoptions)
  - [`useMicrophone(options?)`](#usemicrophoneoptions)
  - [`usePublisher(session)`](#usepublishersession)
  - [`<PublisherView />`](#publisherview-)
  - [`getSupportedVideoCodecs()` / `getSupportedAudioCodecs()`](#getsupportedvideocodecs--getsupportedaudiocodecs)
  - [`useDataTrack(options?)`](#usedatatrackoptions)
  - [`useAudioSource(options?)`](#useaudiosourceoptions)
  - [`useVideoSource(options)`](#usevideosourceoptions)
  - [Screen broadcasting](#screen-broadcasting)
  - [Publisher events](#publisher-events)
  - [Types](#types-1)
- [Advanced usage](#advanced-usage)
  - [Quality / rendition switching](#quality--rendition-switching)
  - [Custom target latency](#custom-target-latency)
  - [Displaying live stats](#displaying-live-stats)
- [Troubleshooting](#troubleshooting)
- [Default UI components (`react-native-moq-ui`)](#default-ui-components-react-native-moq-ui)
  - [`<VideoPlayerView>`](#videoplayerview)
  - [`useFullscreenControls()`](#usefullscreencontrols)
  - [`<FullscreenControls />`](#fullscreencontrols-)
  - [`useMiniPlayerControls()`](#useminiplayercontrols)
  - [`<MiniPlayerControls />`](#miniplayercontrols-)
  - [`<VolumeSlider />` and `<SpeakerGlyph />`](#volumeslider--and-speakerglyph-)
  - [Fullscreen playback](#fullscreen-playback)

## Conventions

A few rules hold across the whole API. They're stated once here instead of repeated on every hook:

- **Mount lifecycle.** Hooks that own a native resource (`useCamera`, `useMicrophone`, `useMultiCamera`, `useDataTrack`, `useBroadcasts`, `useAudioChunks`, `useVideoPlayer`, `useAudioPlayer`) start their work on mount and tear it down on unmount.
- **`setup` callbacks** run once, on mount. They're where you kick things off (`connect()`, `play()`, latency config).
- **Refcounted singletons.** Capture hooks share one native instance across all consumers — two `useCamera` calls drive the same physical camera, and `flip()` on one is visible to all. Subscriptions to the same track are ref-counted too, so subscribing more than once is safe.
- **`state` strings.** Every `state` field is a string union that includes an `` `error:${string}` `` variant carrying the message inline. Objects that also expose `lastError` surface that same message separately.
- **Events.** Anything with an `emitter` can be observed three ways: [`useEvent`](#useeventsource-eventname-initialvalue) (reactive state), [`useEventListener`](#useeventlistenersource-eventname-listener) (side effects), and [`addListener`](#playeraddlistenereventname-listener--sessionaddlistenereventname-listener) (imperative; returns a subscription with `.remove()`). Prefer the hooks inside components — they clean up for you.

## Playback API

Playback is a short pipeline — each step is one hook:

1. **Session** — [`useSession(url)`](#usesessionurl-setup) opens the connection to a relay. Call `connect()`.
2. **Broadcasts** — [`useBroadcasts(session, prefix?)`](#usebroadcastssession-prefix) lists what's available on that relay as `BroadcastInfo[]`.
3. **Player** — [`useVideoPlayer(broadcast)`](#usevideoplayerbroadcast-setup) (or [`useAudioPlayer`](#useaudioplayerbroadcast-setup)) turns one broadcast into a playable `Player`. Call `play()`.
4. **Render** — pass the player to [`<VideoView>`](#videoview) (or [`<VideoPlayerView>`](#videoplayerview) from `react-native-moq-ui`).

```
useSession ──▶ useBroadcasts ──▶ useVideoPlayer ──▶ <VideoView>
  (connect)      (discover)          (play)           (render)
```

One session feeds any number of broadcasts, and one broadcast any number of players.

### `useSession(url, setup?)`

Manages the connection to a MoQ relay. `connect()` opens the session; broadcast discovery is a separate step handled by [`useBroadcasts`](#usebroadcastssession-prefix). The hook does **not** auto-connect — call `connect()` yourself, in the `setup` callback or in response to user interaction.

```tsx
const session = useSession('http://relay.example.com:4443');

// Auto-connect on mount
const session = useSession('http://relay.example.com:4443', (s) => s.connect());

// Auto-connect with a custom target latency (ms)
const session = useSession('http://relay.example.com:4443', (s) => s.connect(500));
```

Returns a `Session`:

| Property / Method | Type | Description |
|---|---|---|
| `id` | `string` | Opaque per-hook identifier. Routes native calls/events when multiple sessions are active |
| `url` | `string` | Relay URL passed to the hook |
| `state` | `SessionState` | Current connection state |
| `emitter` | `EventEmitter<SessionEvents>` | Emitter for session events |
| `addListener(eventName, listener)` | `(eventName, listener) => EventSubscription` | Subscribe imperatively |
| `connect(targetLatencyMs?)` | `(targetLatencyMs?: number) => void` | Open the session. Default `targetLatencyMs=200` |
| `disconnect()` | `() => void` | Close the session (also tears down all active broadcast subscriptions) and reset state |

**`SessionState`** — `'idle'` · `'connecting'` · `'connected'` · `'closed'` · `` `error:${string}` ``

**Multiple sessions.** Each `useSession` call is independent — subscribe to one relay while publishing to another, or open two logical sessions against the same URL. Pass the right `Session` into `useBroadcasts` / `usePublisher`; the library keys all native state by `session.id`.

---

### `useBroadcasts(session, prefix?)`

Subscribes to broadcasts under a prefix and returns the current `BroadcastInfo[]`. An empty prefix matches everything. Components calling this with the same prefix share one underlying subscription (ref-counted).

```tsx
const all = useBroadcasts(session);              // everything the relay exposes
const streams = useBroadcasts(session, '/streams'); // just this prefix
```

The array is empty until `session.state === 'connected'`, and re-populates automatically on reconnect. Different prefixes produce independent lists; overlapping prefixes that match the same broadcast path are not supported.

```tsx
function CamerasGrid({ session }) {
  const cameras = useBroadcasts(session, '/cameras');
  return cameras.map((b) => <BroadcastPlayer key={b.path} broadcast={b} />);
}
```

To react to broadcasts appearing/disappearing, diff the returned array between renders (e.g. compare path sets in a `useEffect`).

---

### `useVideoPlayer(broadcast, setup?)`

Creates a reactive `Player` from a `BroadcastInfo`. Use the `setup` callback to start and configure playback. Pass the returned player to [`<VideoView>`](#videoview) (or [`<VideoPlayerView>`](#videoplayerview)).

```tsx
const player = useVideoPlayer(broadcast, (p) => {
  p.updateTargetLatency(300);
  p.play();
});
```

Returns a `Player`:

| Property / Method | Type | Description |
|---|---|---|
| `sessionId` | `string` | Session this player belongs to (matches `broadcast.sessionId`) |
| `broadcastPath` | `string` | Broadcast path this player belongs to |
| `isPlaying` | `boolean` | True while tracks are actively playing |
| `playbackStats` | `PlaybackStats \| null` | Live metrics, updated every 500 ms |
| `currentVideoTrackName` | `string \| undefined` | Active video track |
| `currentAudioTrackName` | `string \| undefined` | Active audio track |
| `volume` | `number` | Per-player output volume `0..1` (default `1`). Doesn't affect other device audio |
| `emitter` | `EventEmitter<PlayerEvents>` | Emitter for player events |
| `addListener(eventName, listener)` | `(eventName, listener) => EventSubscription` | Subscribe imperatively |
| `play()` | `() => void` | Start or resume playback |
| `pause()` | `() => void` | Pause playback |
| `stop()` | `() => void` | Stop playback and reset state |
| `updateTargetLatency(ms)` | `(ms: number) => void` | Change buffering latency at runtime |
| `switchVideoTrack(name)` | `(name: string) => void` | Switch video rendition |
| `switchAudioTrack(name)` | `(name: string) => void` | Switch audio track |
| `setVolume(volume)` | `(volume: number) => void` | Set output volume; clamped to `0..1` |

---

### Choosing an audio API

Three ways to consume a broadcast's audio — pick by what you need:

| API | Use when | You get |
|---|---|---|
| [`useAudioPlayer`](#useaudioplayerbroadcast-setup) | You just want to **hear** the audio | A `Player` that plays through the device speaker — nothing else to wire up |
| [`useAudioChunks`](#useaudiochunksbroadcast-onchunk-options) | You want the **raw audio** to feed another pipeline (playback engine, ML model, recording) | Per-chunk callbacks — encoded Opus/AAC, or decoded PCM |
| [`subscribeAudioChunks`](#subscribeaudiochunksbroadcast-trackname-onchunk-options) | Same as above, but **outside React** or over a **dynamic** set of tracks/broadcasts | The same chunk stream as a plain function, no hook rules |

`useAudioChunks` is `subscribeAudioChunks` wrapped for React. All three run independently of `useVideoPlayer`, so you can play video while routing its audio elsewhere.

---

### `useAudioPlayer(broadcast, setup?)`

Like `useVideoPlayer`, but streams **audio only** — the video track is never subscribed and no video pipeline starts. Useful for background audio, music broadcasts, or low-bandwidth contexts. It uses a **separate** native player from the video+audio one, so both can run for the same broadcast at once.

```tsx
import { useAudioPlayer } from 'react-native-moq';

const audio = useAudioPlayer(broadcast, (p) => p.play());

return (
  <Button
    title={audio.isPlaying ? 'Pause' : 'Resume'}
    onPress={audio.isPlaying ? audio.pause : audio.play}
  />
);
```

Returns an [`AudioPlayer`](#audioplayer) — the `Player` shape minus the video-only members (`currentVideoTrackName`, `switchVideoTrack`). Its `broadcastPath` carries an `_audio` suffix, and `playbackStats` populates only audio fields. The same `PlayerEvents` apply; `trackSwitched` only fires with `trackKind: 'audio'`.

Passing an `AudioPlayer` to `<VideoView>` / `<VideoPlayerView>` is a type error — audio-only mode has no video output by design.

---

### `useAudioChunks(broadcast, onChunk, options?)`

Receives a broadcast's audio as a stream of chunks — one `AudioChunk` per callback. Use it to route audio into another pipeline such as [react-native-audio-api](https://docs.swmansion.com/react-native-audio-api/) or [react-native-executorch](https://docs.swmansion.com/react-native-executorch/), instead of (or alongside) [`useAudioPlayer`](#useaudioplayerbroadcast-setup). The example app's **Audio** tab is a worked integration of both.

Two delivery modes, set by `format`:

- **`'encoded'`** (default) — raw Opus/AAC bytes, exactly as published. Decode them downstream before use.
- **`'pcm-f32'` / `'pcm-i16'`** — moq-kit decodes for you; `data` is interleaved PCM with `frameCount`, `timestampUs`, and the decoded `sampleRate` / `channelCount`. Both work on iOS and Android.

```tsx
import { useAudioChunks } from 'react-native-moq';

// Encoded (default) — decode chunk.data before use.
const audio = useAudioChunks(broadcast, (chunk) => {
  decoder.push(chunk.data); // chunk.codec — 'opus' | 'aac'
});

// Decoded PCM — chunk.data is ready-to-use Float32 PCM.
const pcm = useAudioChunks(
  broadcast,
  (chunk) => mlModel.feed(chunk.data), // chunk.frameCount @ chunk.sampleRate
  { format: 'pcm-f32' }
);

return <Button title="Stop" onPress={audio.stop} />;
```

`onChunk` is kept in a ref, so changing it between renders does not re-create the subscription. Changing `format` does.

**Options:**

| Option | Type | Description |
|---|---|---|
| `trackName` | `string` | Audio track to listen to. Defaults to the broadcast's first audio track |
| `autoStart` | `boolean` | Start on mount. Default `true`; pass `false` to defer until `.start()` |
| `format` | `'encoded' \| 'pcm-f32' \| 'pcm-i16'` | Delivery mode. Default `'encoded'` |

Returns a [`ChunkSubscription`](#chunksubscription):

| Property / Method | Type | Description |
|---|---|---|
| `sessionId` | `string` | Session this subscription belongs to |
| `broadcastPath` | `string` | Broadcast path being consumed |
| `trackName` | `string` | Audio track being consumed |
| `isActive` | `boolean` | Whether chunks are currently being received |
| `start()` | `() => void` | (Re)start receiving. Idempotent |
| `stop()` | `() => void` | Stop receiving and release the native track subscription. Idempotent |

`stop()` closes the underlying track, which **stops pulling it over the network** — call it whenever you aren't consuming. For a *dynamic* set of tracks or broadcasts, use [`subscribeAudioChunks`](#subscribeaudiochunksbroadcast-trackname-onchunk-options) inside your own effect rather than calling this hook in a loop.

---

### `subscribeAudioChunks(broadcast, trackName, onChunk, options?)`

The framework-agnostic core that `useAudioChunks` wraps — works with or without React. Each call subscribes to one `(broadcast, trackName)` and returns an independent [`ChunkSubscription`](#chunksubscription). For multiple tracks, call it once per track; each handle starts/stops on its own. Subscriptions to the same `(session, path, track)` share one native subscription (ref-counted).

```ts
import { subscribeAudioChunks } from 'react-native-moq';

// Single track
const sub = subscribeAudioChunks(broadcast, 'audio', onChunk);
sub.stop();

// One track from each of several broadcasts
const subs = broadcasts.map((b) =>
  subscribeAudioChunks(b, b.audioTracks[0].name, (c) => route(b.path, c))
);
// teardown: subs.forEach((s) => s.stop());

// Decoded PCM
const pcm = subscribeAudioChunks(broadcast, 'audio', onChunk, { format: 'pcm-i16' });
```

**Options** (same meaning as in [`useAudioChunks`](#useaudiochunksbroadcast-onchunk-options)):

| Option | Type | Description |
|---|---|---|
| `autoStart` | `boolean` | Start immediately. Default `true` |
| `format` | `'encoded' \| 'pcm-f32' \| 'pcm-i16'` | Delivery mode. Default `'encoded'`; the `pcm-*` formats deliver decoded interleaved PCM (iOS and Android) |

In React, use it inside an effect for dynamic track sets — this sidesteps the rules-of-hooks constraint of calling `useAudioChunks` in a loop:

```tsx
useEffect(() => {
  const subs = trackNames.map((t) => subscribeAudioChunks(broadcast, t, onChunk));
  return () => subs.forEach((s) => s.stop());
}, [broadcast, trackNames]);
```

---

### `useEvent(source, eventName, initialValue?)`

Reactive state that re-renders when the named event fires. `source` can be a `Player`, `Session`, or any `EventEmitter`. Without an initial value, the return type includes `undefined`.

```tsx
const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: false });
```

---

### `useEventListener(source, eventName, listener)`

Registers a listener without creating React state — for side effects (logging, analytics) rather than driving UI. No `useCallback` needed; the listener is kept in a ref.

```tsx
useEventListener(player, 'trackSwitched', ({ trackKind, trackName }) => {
  console.log(`Switched ${trackKind} track to ${trackName}`);
});
```

---

### `player.addListener(eventName, listener)` / `session.addListener(eventName, listener)`

Subscribe from outside the React lifecycle (stores, services, callbacks). Returns an `EventSubscription`; call `.remove()` to unsubscribe. Inside components, prefer [`useEvent`](#useeventsource-eventname-initialvalue) / [`useEventListener`](#useeventlistenersource-eventname-listener) — they clean up automatically.

```ts
const sub = player.addListener('playingChange', ({ isPlaying }) => {
  console.log('Playing:', isPlaying);
});
sub.remove();
```

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

### `<VideoView>`

The bare native video surface. It behaves like a normal RN view — takes `style` (and the rest of `ViewProps`) and renders the player's video at whatever size you give it. No fullscreen, controls, or overlay slot; compose your own UI around it, or use [`<VideoPlayerView>`](#videoplayerview) from `react-native-moq-ui`.

```tsx
<VideoView player={player} style={{ width: '100%', aspectRatio: 16 / 9 }} />
```

| Prop | Type | Required | Description |
|---|---|---|---|
| `player` | `Player` | Yes | Player returned by `useVideoPlayer` |
| `style` | `ViewStyle` | No | Standard React Native style prop |

It does **not** accept children — the underlying native view is not a `ViewGroup` on Android, so overlays must be siblings (typically absolutely positioned alongside the video).

---

### `PlayerHandle`

An opaque reference to a native player, available as `broadcast.player`. `useVideoPlayer(broadcast)` consumes it internally to produce a reactive `Player`, but you can call playback methods on the handle directly without the hook:

```tsx
broadcast.player.play();
broadcast.player.switchVideoTrack('1080p');
broadcast.player.updateTargetLatency(100);
```

On iOS the handle is a JSI host object (calls go straight to native, no bridge serialisation); on Android calls go through the TurboModule bridge.

---

### Types

#### `PlayerEvents`

Event map for `player.emitter` — each key is an event name, the value its payload type.

```ts
type PlayerEvents = {
  // Playback started, paused, or resumed. Deduplicated — one emission per
  // state transition even when video + audio tracks change simultaneously.
  playingChange: (event: { isPlaying: boolean }) => void;

  // All tracks stopped (end of broadcast or explicit stop).
  trackStopped: (event: Record<never, never>) => void;

  // Active video or audio track changed.
  trackSwitched: (event: { trackKind: 'video' | 'audio'; trackName: string }) => void;

  // Updated playback metrics, ~every 500 ms.
  statsUpdate: (event: PlaybackStats) => void;
};
```

#### `SessionEvents`

```ts
type SessionEvents = {
  stateChange: (event: { state: SessionState }) => void;
};
```

Broadcast availability is observed via [`useBroadcasts`](#usebroadcastssession-prefix), not session events.

#### `AudioPlayer`

Returned by `useAudioPlayer` — the `Player` shape narrowed to audio-only (no `currentVideoTrackName`, no `switchVideoTrack`).

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
  player: PlayerHandle;    // opaque native handle — call directly, or pass to useVideoPlayer / useAudioPlayer
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

One chunk from [`useAudioChunks`](#useaudiochunksbroadcast-onchunk-options) / [`subscribeAudioChunks`](#subscribeaudiochunksbroadcast-trackname-onchunk-options). Which optional fields are set depends on `format`: `groupSequence` / `objectIndex` for `'encoded'`; `frameCount` / `timestampUs` for the `pcm-*` formats.

```ts
type AudioChunkFormat = 'encoded' | 'pcm-f32' | 'pcm-i16';

interface AudioChunk {
  data: ArrayBuffer; // 'encoded': one Opus/AAC object; 'pcm-*': interleaved PCM
  format: AudioChunkFormat;
  trackName: string;
  codec: string; // 'opus' | 'aac', from the catalog
  sampleRate: number; // 'encoded': catalog source rate (0 if unknown); 'pcm-*': decoded rate
  channelCount?: number;
  frameCount?: number; // PCM frames in `data` — pcm-* only
  timestampUs?: number; // presentation timestamp (µs) — pcm-* only
  groupSequence?: number; // MoQ group sequence (detect gaps/ordering) — encoded only
  objectIndex?: number; // object index within the group — encoded only
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

The publisher captures audio + video from the device camera + microphone and pushes them to a relay. It reuses a [`Session`](#usesessionurl-setup) you've already opened, so **one connection can publish and subscribe at once**.

The pieces:

- **Sources** — `useCamera` / `useMicrophone` own refcounted device captures (see [Conventions](#conventions)); `useDataTrack` / `useAudioSource` are per-instance sources you feed yourself (string payloads, or your own PCM audio).
- **`usePublisher`** — consumes those sources: `publish({ path, tracks })` starts a broadcast; a single broadcast can mix video, audio, and data tracks.
- **Screen sharing** runs out-of-process with its own MoQ connection, so it has a separate hook, [`useScreenBroadcast`](#screen-broadcasting).

```tsx
import { useEffect } from 'react';
import { Button, PermissionsAndroid, Platform } from 'react-native';
import { PublisherView, useCamera, useMicrophone, usePublisher, useSession } from 'react-native-moq';

function PublishScreen() {
  const session = useSession('http://relay.example.com:4443');
  const camera = useCamera();
  const microphone = useMicrophone();
  const publisher = usePublisher(session);

  // Open the session up front so publish() has a connection to reuse.
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

**Permissions are the host app's job.** Request `CAMERA` / `RECORD_AUDIO` at runtime on Android, and add `NSCameraUsageDescription` / `NSMicrophoneUsageDescription` to `Info.plist` on iOS. The library does not request these for you.

---

### `useCamera(options?)`

Owns the device camera (refcounted singleton). Position is global to the physical camera — `flip()` / `setPosition()` on any consumer is visible to all. `publish()` snapshots the encoder config (`videoCodec`, `width`, `height`, `framerate`) at call time; to change it on a live broadcast, update the options and call `publish()` again.

```tsx
const camera = useCamera({
  position: 'front',   // initial — change at runtime via setPosition / flip
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
| `lastError` | `string \| null` | Last capture error, or `null` |
| `position` | `'front' \| 'back'` | Active camera |
| `encoder` | `VideoEncoderOptions` | `{ codec, width, height, framerate }` — snapshotted by `publish()` |
| `flip()` | `() => void` | Toggle front/back |
| `setPosition(pos)` | `('front' \| 'back') => void` | Switch to a specific camera |

Pass it into `publisher.publish({ tracks: [camera, …] })` to broadcast it, and into `<PublisherView camera={camera} />` for the on-screen preview.

---

### `useMultiCamera(options?)`

Captures the front and back cameras **simultaneously** as two independent publishable tracks (iOS `AVCaptureMultiCamSession`, Android CameraX concurrent camera). It's a fixed front+back pair — the streams can't be flipped. Refcounted singleton, like `useCamera`.

Concurrent capture isn't available on every device — gate your UI on the returned `isSupported`, or call [`isMultiCameraSupported()`](#ismulticamerasupported) before mounting the hook.

```tsx
const { isSupported, state, front, back } = useMultiCamera({
  videoCodec: 'h264', // see the dual-encoder note below
  width: 720,
  height: 1280,
  framerate: 30,
});
```

Returns a `MultiCameraTrack`:

| Property | Type | Description |
|---|---|---|
| `isSupported` | `boolean \| null` | Whether the device can run both cameras at once. `null` while the async check is in flight |
| `state` | `MultiCameraState` | Shared capture state: `'idle' \| 'starting' \| 'active' \| `error:${string}`` |
| `lastError` | `string \| null` | Last capture error, or `null` |
| `front` | `CameraTrack` | Front camera, published as the `front-camera` track |
| `back` | `CameraTrack` | Back camera, published as the `back-camera` track |

`front` and `back` are ordinary `CameraTrack`s — preview each with `<PublisherView camera={front} />`, publish both with `publisher.publish({ tracks: [front, back, …] })`, and a subscriber can switch between them. (`flip()` / `setPosition()` are no-ops here — positions are fixed.)

> **Dual encoder support.** Publishing two cameras runs two hardware encoders at once. Two H.264 encoders run on a wide range of devices; two **H.265** encoders are far more limited — on many devices the second HEVC encoder silently produces no frames, so only one track reaches the broadcast. Prefer `videoCodec: 'h264'` for dual-camera publishing unless you've verified H.265 on your target hardware.

#### `isMultiCameraSupported()`

```ts
function isMultiCameraSupported(): Promise<boolean>;
```

Resolves whether the device supports concurrent front+back capture, without starting any hardware. Use it to decide whether to offer a dual-camera mode before mounting `useMultiCamera`.

---

### `useMicrophone(options?)`

Owns the device microphone (refcounted singleton). The audio session category follows the mic lifecycle: `playAndRecord` while capturing, `playback` otherwise. `publish()` snapshots the encoder config at call time; `audioSampleRate` is also the Android capture format, so changing it after mount is a no-op until the hook is remounted (e.g. with a `key` prop).

```tsx
const microphone = useMicrophone({ audioCodec: 'opus', audioSampleRate: 48000 });
```

Returns a `MicrophoneTrack`:

| Property | Type | Description |
|---|---|---|
| `state` | `MicrophoneCaptureState` | `'idle' \| 'starting' \| 'active' \| `error:${string}`` |
| `lastError` | `string \| null` | Last capture error, or `null` |
| `encoder` | `AudioEncoderOptions` | `{ codec, sampleRate }` — snapshotted by `publish()` |

---

### `usePublisher(session)`

Attaches a publisher to a [`Session`](#usesessionurl-setup). Mounting the hook starts nothing — `publish()` creates a native `Publisher` on the existing session, adds the tracks, and starts it; `stop()` tears the publisher down (the session stays open).

The session must be `connected` when `publish()` is called, or the publisher goes to `error:session is not connected` immediately — gate the UI on `session.state === 'connected'`. Each track must come from a currently-mounted source hook; if a capture is still starting, `publish()` awaits it. Changing the published track set means calling `publish()` again — moq-kit finalizes the track set at start, so swapping sources restarts the broadcast.

```tsx
const session = useSession('http://relay.example.com:4443');
const camera = useCamera({ videoCodec: 'h264', width: 1280, height: 720, framerate: 30 });
const microphone = useMicrophone({ audioCodec: 'opus', audioSampleRate: 48000 });
const publisher = usePublisher(session);

publisher.publish({
  path: 'live/cam-1',
  tracks: [camera, microphone], // any subset — audio-only, video-only, both
});
```

Returns a `Publisher`:

| Property / Method | Type | Description |
|---|---|---|
| `state` | `PublisherState` | Current publishing state |
| `trackStates` | `Record<string, PublishedTrackState>` | Per-track lifecycle, keyed by track name |
| `lastError` | `string \| null` | Last error message, or `null` |
| `emitter` | `EventEmitter<PublisherEvents>` | Emitter for publisher events |
| `addListener(eventName, listener)` | `(eventName, listener) => EventSubscription` | Subscribe imperatively |
| `publish(opts)` | `(opts: PublishOptions) => void` | Start publishing the tracks. Requires `session.state === 'connected'` |
| `stop()` | `() => void` | Stop all tracks and clear `trackStates`. Leaves the session and capture hooks running |

**`PublisherState`** — `'idle'` · `'connecting'` · `'publishing'` · `'stopped'` · `` `error:${string}` ``

**`PublishedTrackState`** — `'idle'` · `'starting'` · `'active'` · `'stopped'`

---

### `<PublisherView />`

Renders whatever the shared camera capture is producing. The capture lifecycle belongs to `useCamera`, not the view — mounting/unmounting `<PublisherView>` does **not** start or stop the camera. Pass the camera hook in via the `camera` prop so the capture is guaranteed alive while the preview is on screen.

```tsx
const camera = useCamera({ position: 'front' });

<PublisherView camera={camera} style={{ aspectRatio: 9 / 16 }} />
```

| Prop | Type | Required | Description |
|---|---|---|---|
| `camera` | `CameraTrack` | Yes | A `useCamera` track, or a `front` / `back` track from [`useMultiCamera`](#usemulticameraoptions) |
| `style` | `ViewStyle` | No | Standard React Native style prop |

The rest of the standard `ViewProps` are forwarded to the native view.

---

### `getSupportedVideoCodecs()` / `getSupportedAudioCodecs()`

Synchronous queries for the codecs whose encoder will actually initialize on this device. Use them to gate codec pickers — selecting a codec the device can't encode silently terminates the broadcast on Android (moq-kit reports it as a clean stop, not an error). Results depend only on hardware/OS, so cache them at module load.

```tsx
import { getSupportedVideoCodecs, getSupportedAudioCodecs } from 'react-native-moq';

const VIDEO = getSupportedVideoCodecs(); // → ['h264', 'h265']
const AUDIO = getSupportedAudioCodecs(); // → ['opus', 'aac']

const initialVideoCodec = VIDEO.includes('h265') ? 'h265' : 'h264';
```

---

### `useDataTrack(options?)`

A publishable **data track** — the data counterpart of [`useCamera`](#usecameraoptions) / [`useMicrophone`](#usemicrophoneoptions). Instead of media it carries app-defined string payloads (controller input, chat, telemetry). Owns a native `DataTrackEmitter` for the hook's lifetime and is consumed by [`usePublisher`](#usepublishersession): pass it in `tracks` and it becomes a data track in the broadcast, alongside any camera/mic tracks.

```tsx
import { useDataTrack } from 'react-native-moq';

const command = useDataTrack({ name: 'command' }); // track name subscribers read
```

Returns a `DataTrack`:

| Property / Method | Type | Description |
|---|---|---|
| `__type` | `'data'` | Discriminator `usePublisher` uses to route to a data track |
| `__name` | `string` | Track name in the broadcast catalog (the `name` option) |
| `send(payload)` | `(payload: string) => void` | Send one UTF-8 string (e.g. JSON). No-op until the publisher is `publishing`; payloads deliver in call order |

Include it in a publish to start sending. `send()` before the publisher reaches `publishing` is a no-op:

```tsx
const session = useSession('http://relay.example.com:4443', (s) => s.connect());
const camera = useCamera();
const command = useDataTrack({ name: 'command' });
const publisher = usePublisher(session);

// One broadcast carrying both video and a data track.
publisher.publish({ path: 'live/game-1', tracks: [camera, command] });

// Push payloads once publisher.state === 'publishing'.
command.send(JSON.stringify({ type: 'buttons', buttons: ['a', 'up'] }));
```

Subscribers read these objects from a track of the same `name`. For a data-only broadcast, pass a single data track: `publisher.publish({ path, tracks: [command] })`. Pair it with [`useBroadcasts`](#usebroadcastssession-prefix) to discover peers and exchange data over one connection — the pattern behind chat- and cloud-gaming demos. The example app's **MoQBoy** tab ([`example/src/screens/MoQBoyScreen.tsx`](../example/src/screens/MoQBoyScreen.tsx)) is a worked cloud-gaming controller built on this hook.

**`DataTrackOptions`**

```ts
interface DataTrackOptions {
  name?: string; // Track name subscribers read from. Default: 'data'
}
```

> Payloads are UTF-8 strings; for binary data, encode it (e.g. base64) before `send()`.

---

### `useAudioSource(options?)`

A publishable **audio source** you feed with your own PCM — the custom-audio counterpart of [`useMicrophone`](#usemicrophoneoptions). Use it to broadcast synthesized speech (TTS), music, sound effects, or any audio your app produces instead of the device mic. It owns a native push source for the hook's lifetime and is consumed by [`usePublisher`](#usepublishersession): pass it in `tracks` and it becomes an audio track in the broadcast, alongside any camera/mic/data tracks.

```tsx
import { useAudioSource } from 'react-native-moq';

const speech = useAudioSource({ name: 'tts', audioCodec: 'opus', sampleRate: 48000 });
```

Returns an `AudioSourceTrack`:

| Property / Method | Type | Description |
|---|---|---|
| `__type` | `'audioSource'` | Discriminator `usePublisher` uses to route to an audio track |
| `__name` | `string` | Track name in the broadcast catalog (the `name` option) |
| `encoder` | `AudioEncoderOptions` | `{ codec, sampleRate }` — snapshotted by `publish()` |
| `channels` | `number` | Channel count of the PCM you push |
| `send(pcm)` | `(pcm: PcmData) => void` | Push audio. No-op until the publisher is `publishing` |

Include it in a publish, then push audio once `publisher.state === 'publishing'`:

```tsx
const session = useSession('http://relay.example.com:4443', (s) => s.connect());
const speech = useAudioSource({ name: 'tts', sampleRate: 48000 });
const publisher = usePublisher(session);

publisher.publish({ path: 'live/narration', tracks: [speech] }); // audio-only broadcast

// `pcm` is a Float32Array in [-1, 1], or interleaved 16-bit (Int16Array / ArrayBuffer).
speech.send(pcm);
```

`send()` takes a `Float32Array` (converted to 16-bit for you) or interleaved 16-bit PCM (`Int16Array` / `ArrayBuffer`) at the source's `sampleRate` / `channels`. The native side paces your pushes out in real time, so you can hand it a whole utterance at once — gaps between pushes play as silence. Subscribers get an ordinary audio track (same `name`), playable via [`useAudioPlayer`](#useaudioplayerbroadcast-setup) or [`useAudioChunks`](#useaudiochunksbroadcast-onchunk-options).

**`AudioSourceOptions`**

```ts
interface AudioSourceOptions {
  name?: string;           // Track name subscribers read from. Default: 'audio'
  audioCodec?: AudioCodec; // 'opus' | 'aac'. Default: 'opus'
  sampleRate?: number;     // Hz of the PCM you push. Default: 48000
  channels?: number;       // 1 = mono, 2 = interleaved stereo. Default: 1
}
```

> `sampleRate` / `channels` are fixed for the source's lifetime — change them by remounting the hook (e.g. with a `key` prop). Push PCM at that same rate; resample first if your generator (e.g. a 24 kHz TTS model) produces another rate.

The example app's **Publish** tab wires this to on-device text-to-speech: [`example/src/components/TtsAudioSection.tsx`](../example/src/components/TtsAudioSection.tsx) runs Kokoro via [react-native-executorch](https://github.com/software-mansion/react-native-executorch), resamples its 24 kHz output to 48 kHz, and streams it into the broadcast.

---

### `useVideoSource(options)`

A publishable **video source** you feed with your own rendered frames — the custom-video counterpart of [`useCamera`](#usecameraoptions). Use it to broadcast anything your app draws (a game / emulator screen, a WebGPU or Skia scene, processed camera frames) instead of the device camera.

On iOS it's **zero-copy**: on mount the native side allocates a fixed pool of IOSurface-backed buffers and hands you their handles. You render into a slot with your own GPU engine, then push just the *slot index* (and an optional GPU fence) — pixels never cross the bridge. On Android the slots are native bitmaps drawn onto the encoder surface with a hardware canvas; there's no JS-importable handle yet (`surfaceHandle` is `'0'`), so only natively-filled frames — like `fillTestPattern` — can be pushed.

```tsx
import { useVideoSource } from 'react-native-moq';

const video = useVideoSource({ width: 720, height: 1280, poolSize: 3 });
```

Returns a `VideoSourceTrack`:

| Property / Method | Type | Description |
|---|---|---|
| `__type` | `'videoSource'` | Discriminator `usePublisher` uses to route to a video track |
| `__name` | `string` | Track name in the broadcast catalog (the `name` option) |
| `encoder` | `VideoEncoderOptions` | `{ codec, width, height, framerate }` — snapshotted by `publish()` |
| `buffers` | `CustomVideoBuffer[]` | Pool slots to render into; empty until the native pool is allocated |
| `pushFrame(frame)` | `(frame: PushVideoFrameArgs) => void` | Submit a rendered slot. No-op until `publishing` |
| `fillTestPattern(bufferIndex, frameIndex)` | `(number, number) => void` | Demo helper — CPU-fills a slot with an animated pattern (no GPU renderer needed) |

Each `CustomVideoBuffer` is `{ index, surfaceHandle, width, height }`. On iOS `surfaceHandle` is the `(uintptr_t)IOSurfaceRef` as a **decimal string** (64-bit handles exceed JS's safe integer range) — import it in your native GPU renderer to draw into the surface.

Include it in a publish, then render + push once `publisher.state === 'publishing'`:

```tsx
const video = useVideoSource({ width: 720, height: 1280, poolSize: 3 });
const publisher = usePublisher(session);

publisher.publish({ path: 'live/canvas', tracks: [video] });

// Per frame: render into a pool slot with your GPU engine, then submit it.
video.pushFrame({
  bufferIndex,                      // the slot you rendered into
  fence: { handle, signaledValue }, // MTLSharedEvent the GPU signals when done (optional)
});
```

Round-robin over the `poolSize` slots so you never redraw one that's still being encoded. `pushFrame` waits for the fence (so the buffer is never sampled mid-render), wraps the pooled buffer, and hands it to the encoder — all off the JS thread. Omit `fence` for CPU-filled frames or when you've already finished GPU work (Android ignores fences). Subscribers get an ordinary video track (same `name`), rendered like any camera track.

By default frames are timestamped with the device clock at push time, which keeps them aligned with any camera/mic tracks. Pass an explicit `timestampNs` (iOS only — Android always stamps at push time) only when you have real capture times — it must be monotonic and advance in real time, or subscribers see a frozen image (frames are scheduled against a live playhead).

**`VideoSourceOptions`**

```ts
interface VideoSourceOptions {
  name?: string;           // Track name subscribers read from. Default: 'video'
  width: number;           // Frame width; baked into the pool + encoder
  height: number;          // Frame height
  poolSize?: number;       // In-flight slots to round-robin over. Default: 3
  videoCodec?: VideoCodec; // 'h264' | 'h265'. Default: 'h264'
  framerate?: number;      // Default: 30
}
```

> `width` / `height` / `poolSize` are fixed for the source's lifetime — change them by remounting the hook (e.g. with a `key` prop).

No GPU renderer handy? `fillTestPattern(bufferIndex, frameIndex)` CPU-fills a slot with an animated pattern so you can exercise the pipeline. The example app's **Publish** tab uses it: [`example/src/components/CustomVideoSection.tsx`](../example/src/components/CustomVideoSection.tsx) calls `fillTestPattern` then `pushFrame` each tick, driving the whole pool → encode → publish path.

---

### Screen broadcasting

Screen capture runs out-of-process — a `Broadcast Upload Extension` on iOS, a foreground `Service` on Android. Because it's a separate process it can't share the host's `usePublisher` session: it opens its own MoQ connection from the session URL you pass in, and publishes to its own path. It's also a device singleton (one ReplayKit / MediaProjection session at a time), so multiple instances of the hook observe the same state.

#### `useScreenBroadcast(session, options)`

Manages the out-of-process screen broadcast bound to a `Session`. Mounting the hook writes the current relay URL + options to the native side (on iOS the App Group descriptor the extension reads at launch; on Android the config for the next `start()`). The options are watched — change any field and the native config is rewritten.

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

Returns a `ScreenBroadcast`:

| Property / Method | Type | Description |
|---|---|---|
| `state` | `ScreenBroadcastState` | Current state |
| `lastError` | `string \| null` | Last error message, or `null` |
| `start()` | `() => Promise<void>` | **Android only** — starts the foreground MediaProjection service. Rejects on iOS |
| `stop()` | `() => void` | Stop the active screen broadcast |

**`ScreenBroadcastState`** — `'idle'` · `'connecting'` · `'broadcasting'` · `'stopped'` · `` `error:${string}` ``

#### iOS

iOS can't start a system broadcast programmatically — the user must tap `<BroadcastPickerView>` to open the system sheet, so `screen.start()` always rejects. The extension reports its real state back through `screen.state`.

```tsx
import { BroadcastPickerView } from 'react-native-moq';

<BroadcastPickerView
  preferredExtension="com.example.app.MyBroadcastUpload"
  tintColor="#2563eb"
  style={{ width: 44, height: 44 }}
/>
```

Setup requires:
- A `Broadcast Upload Extension` target in Xcode. The library ships `MoQReplayKitBroadcastSampleHandler` — subclass it and override `makeReplayKitBroadcastConfiguration` for custom encoder settings.
- An `App Group` entitlement on **both** the host app and the extension. Pass its identifier as `appGroupIdentifier`.
- The extension's bundle identifier via `preferredExtension` so the picker pre-selects it.

#### Android

Android drives the foreground service directly. `screen.start()` triggers the system `MediaProjection` consent dialog and resolves only once the user grants it.

```tsx
const onToggleScreen = (next: boolean) => {
  if (next) screen.start().catch(() => {/* user denied consent */});
  else screen.stop();
};
```

Setup requires the `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PROJECTION` permissions and the `ScreenBroadcastService` declaration in `AndroidManifest.xml` (handled by the library's manifest merger — no manual step in typical apps).

`<BroadcastPickerView>` renders nothing on Android, so the same JSX branches safely on `Platform.OS`.

---

### Publisher events

| Event | Payload | Description |
|---|---|---|
| `stateChange` | `{ state: PublisherState }` | Publisher state transitioned |
| `trackStateChange` | `{ name, state, error? }` | A published track changed state (or errored) |

Subscribe via `useEventListener`, `useEvent`, or `publisher.addListener` — same patterns as the player/session events above.

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

Sort a broadcast's video tracks and call `switchVideoTrack` to change rendition:

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

Set it at three levels:

```tsx
// Session level — applies to all players in this session
const session = useSession(url, (s) => s.connect(500));

// Per player, in the setup callback
const player = useVideoPlayer(broadcast, (p) => {
  p.updateTargetLatency(100);
  p.play();
});

// At runtime on the returned player
player.updateTargetLatency(300);
```

### Displaying live stats

Read `player.playbackStats` (updated every ~500 ms), or subscribe to `statsUpdate`:

```tsx
const player = useVideoPlayer(broadcast, (p) => p.play());

if (player.playbackStats) {
  console.log(`Latency: ${player.playbackStats.videoLatencyMs} ms`);
}

// Or reactively:
const stats = useEvent(player, 'statsUpdate');
```

## Troubleshooting

### `useBroadcasts` returns an empty array

The list stays empty until `session.state === 'connected'` — make sure you've called `connect()` and the session reached `connected` (watch `stateChange`, or gate your UI on the state). Also check the `prefix`: it must match how broadcasts are published (an empty prefix matches everything).

### A broadcast appears in the list but won't play

Relays namespace broadcasts by **URL path**, so the publisher and subscriber must agree on it. Connecting to `http://host:4443` (root) can surface a broadcast's existence while playing it fails, if it was actually published under a sub-path like `http://host:4443/anon`. Point `useSession` at the same path the broadcast was published to. (A relay reset with `code=13` / `NotFound` is the usual symptom of a path mismatch.)

### `publisher.state` goes straight to `error:session is not connected`

`publish()` was called before the session finished connecting. Wait for `session.state === 'connected'` first — gate the publish button on it, or connect in the session's `setup` callback and only publish once connected.

### On Android, publishing starts then immediately stops with no error

Almost always an encoder that can't initialize for the chosen codec — moq-kit reports this as a clean stop, not an error. Gate your codec choice with [`getSupportedVideoCodecs()`](#getsupportedvideocodecs--getsupportedaudiocodecs) / `getSupportedAudioCodecs()`, and prefer `videoCodec: 'h264'`. For [`useMultiCamera`](#usemulticameraoptions), also avoid two H.265 encoders at once — see the dual-encoder note there.

### The camera/mic preview is black, or nothing is published

Runtime permissions aren't granted. The library does **not** request them — the host app must ask for `CAMERA` / `RECORD_AUDIO` on Android and declare `NSCameraUsageDescription` / `NSMicrophoneUsageDescription` in `Info.plist` on iOS. See [Publishing](#publishing).

### Video is stretched in the fullscreen modal on Android

Pass the source aspect ratio via `videoAspectRatio` on [`<VideoPlayerView>`](#videoplayerview) so it letterboxes instead of stretching — Android's `SurfaceView` doesn't preserve aspect on its own. See [Fullscreen playback](#fullscreen-playback).

## Default UI components (`react-native-moq-ui`)

A companion package layering ready-made player chrome on top of the core [`<VideoView>`](#videoview): a [`<VideoPlayerView>`](#videoplayerview) with platform-styled inline + fullscreen controls, a [`<VolumeSlider>`](#volumeslider--and-speakerglyph-), and context hooks for building your own chrome on the same fade / tap-to-toggle behavior.

It's a separate install so apps that build their own UI don't pay for it — see [Optional: default UI components](../README.md#optional-default-ui-components) for setup. Everything below is exported from `react-native-moq-ui` and consumes [`Player`](#usevideoplayerbroadcast-setup) / [`AudioPlayer`](#useaudioplayerbroadcast-setup) values from the core hooks.

### `<VideoPlayerView>`

A complete video player built on `<VideoView>`. Inline it shows mini chrome (centered play/pause + a bottom-right fullscreen button) with tap-to-toggle auto-hide. `enterFullscreen()` (via ref or the inline button) opens the video in an RN `<Modal>` with fullscreen chrome — close button, play/pause, auto-hide — and your overlay children on top. Both inline and fullscreen chrome are customizable (see [Fullscreen playback](#fullscreen-playback)); to go further, copy the short [source](../packages/react-native-moq-ui/src/VideoPlayerView.tsx) and adapt it on top of `<VideoView>`.

```tsx
<VideoPlayerView player={player} style={{ width: '100%', aspectRatio: 16 / 9 }} />
```

| Prop | Type | Required | Description |
|---|---|---|---|
| `player` | `Player` | Yes | Player from [`useVideoPlayer`](#usevideoplayerbroadcast-setup) |
| `style` | `ViewStyle` | No | Standard React Native style prop |
| `children` | `ReactNode` | No | Overlay content above the video, inline and in fullscreen |
| `videoAspectRatio` | `number` | No | Source aspect (`width / height`). Letterboxes the video in the fullscreen modal so it isn't stretched on Android. Default `16 / 9` |
| `controls` | `boolean \| ReactNode` | No | Fullscreen chrome. `true` (default) built-in; `false` disabled; a ReactNode replaces it while keeping the fade + tap-to-toggle behavior |
| `miniControls` | `boolean \| ReactNode` | No | Inline chrome. `true` (default) renders [`<MiniPlayerControls />`](#miniplayercontrols-); `false` disabled; a ReactNode replaces it |
| `onFullscreenEnter` | `() => void` | No | Fired after the fullscreen modal opens |
| `onFullscreenExit` | `() => void` | No | Fired after it closes (including Android hardware back) |

Imperative ref methods:

| Method | Description |
|---|---|
| `enterFullscreen()` | Show the player in a fullscreen modal |
| `exitFullscreen()` | Dismiss the fullscreen modal |

```tsx
import { useRef } from 'react';
import { VideoPlayerView, type VideoPlayerViewRef } from 'react-native-moq-ui';

const ref = useRef<VideoPlayerViewRef>(null);
ref.current?.enterFullscreen();
```

See [Fullscreen playback](#fullscreen-playback) for the default chrome, disabling it, and replacing it.

---

### `useFullscreenControls()`

Reads the fullscreen controls API from inside an element passed to `<VideoPlayerView controls={...} />`. Use it when building your own chrome that opts into the same tap-to-toggle / fade behavior. Throws if called outside a VideoPlayerView fullscreen modal.

```tsx
const { player, exit, show, visible } = useFullscreenControls();
```

| Field | Type | Description |
|---|---|---|
| `player` | `Player` | The player driving this VideoPlayerView |
| `exit` | `() => void` | Exit fullscreen (same as `ref.current?.exitFullscreen()`) |
| `show` | `() => void` | Mark controls visible and reset the auto-hide timer. Call from your buttons' `onPress` so a tap doesn't immediately fade the chrome out |
| `visible` | `boolean` | Whether the fade is currently animating to visible — for rendering differently while hidden |

The built-in [`<FullscreenControls />`](#fullscreencontrols-) is the canonical consumer — see its [source](../packages/react-native-moq-ui/src/components/FullscreenControls.tsx).

---

### `<FullscreenControls />`

The default fullscreen chrome — a platform-styled close + play/pause overlay. Mounted automatically by `<VideoPlayerView controls />`. Exported so you can compose it into larger custom chrome:

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

The inline counterpart of `useFullscreenControls` — reads the inline controls API from inside an element passed to `<VideoPlayerView miniControls={...} />`. Throws if called outside a VideoPlayerView inline view.

```tsx
const { player, enterFullscreen, show, visible } = useMiniPlayerControls();
```

| Field | Type | Description |
|---|---|---|
| `player` | `Player` | The player driving this VideoPlayerView |
| `enterFullscreen` | `() => void` | Enter fullscreen (same as `ref.current?.enterFullscreen()`) |
| `show` | `() => void` | Mark controls visible and reset the auto-hide timer |
| `visible` | `boolean` | Whether the fade is currently animating to visible |

The built-in [`<MiniPlayerControls />`](#miniplayercontrols-) is the canonical consumer — see its [source](../packages/react-native-moq-ui/src/components/MiniPlayerControls.tsx).

---

### `<MiniPlayerControls />`

The default inline chrome — centered play/pause, a bottom-left volume slider, and a bottom-right fullscreen button. Mounted automatically by `<VideoPlayerView miniControls />`. (The same volume slider also runs along the bottom of the fullscreen chrome.) Exported for composing into larger custom chrome:

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

The building blocks behind the volume control in the default chrome. Useful for your own chrome or non-video surfaces (e.g. an audio-only card). Drawn from plain `<View>`s — no SVG or icon-font dependency.

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
| `player` | `Player \| AudioPlayer` | Yes | Player to drive — calls `setVolume()`, reads `volume` |
| `width` | `number` | No | Pixel width. Default `140` |
| `theme` | `'dark' \| 'light'` | No | `'dark'` (default) white on a translucent scrim, for video overlays; `'light'` blue-ish on gray, for light cards |

`<SpeakerGlyph>` props:

| Prop | Type | Required | Description |
|---|---|---|---|
| `size` | `number` | No | Icon size in pixels. Default `16` |
| `volume` | `number` | No | `0..1`; selects how many of the three wave arcs are filled (`0` shows the mute slash). Default `1` |
| `color` | `string` | No | Foreground color (inactive arcs use a 35%-alpha variant). Default `#fff` |

---

### Fullscreen playback

Fullscreen lives on [`<VideoPlayerView>`](#videoplayerview) via its `enterFullscreen()` / `exitFullscreen()` ref methods. It renders the video into an RN `<Modal>`, so overlay children stay tappable and it works on both platforms (Android's `SurfaceView` can't host child views directly). For a different UX, copy [`VideoPlayerView.tsx`](../packages/react-native-moq-ui/src/VideoPlayerView.tsx) and adapt it on top of `<VideoView>`.

By default the modal renders platform-styled chrome — a close button (top-left iOS, top-right Android), centered play/pause, and tap-to-toggle auto-hide. Most apps need nothing more:

```tsx
import { useRef } from 'react';
import { Button, View } from 'react-native';
import { useVideoPlayer, type BroadcastInfo } from 'react-native-moq';
import { VideoPlayerView, type VideoPlayerViewRef } from 'react-native-moq-ui';

function VideoSection({ broadcast }: { broadcast: BroadcastInfo }) {
  const player = useVideoPlayer(broadcast, (p) => p.play());
  const ref = useRef<VideoPlayerViewRef>(null);

  // Pass the active track's aspect so fullscreen letterboxes correctly
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

Pass `controls={false}` to hide it (e.g. for a bare presentation, or when you render your own overlay via `children`):

```tsx
<VideoPlayerView ref={ref} player={player} controls={false} />
```

Pass a ReactNode to replace it — it's wrapped in the same fade + tap-to-toggle gesture. Inside, call [`useFullscreenControls()`](#usefullscreencontrols) for the `{ exit, show, player, visible }` API:

```tsx
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { useEvent } from 'react-native-moq';
import { VideoPlayerView, useFullscreenControls } from 'react-native-moq-ui';

function MyControls() {
  const { player, exit, show } = useFullscreenControls();
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.isPlaying });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable onPress={() => { show(); exit(); }} style={styles.closeBtn}>
        <Text style={{ color: 'white' }}>✕</Text>
      </Pressable>
      <Pressable
        onPress={() => { show(); isPlaying ? player.pause() : player.play(); }}
        style={styles.playBtn}
      >
        <Text style={{ color: 'white' }}>{isPlaying ? '⏸' : '▶'}</Text>
      </Pressable>
    </View>
  );
}

<VideoPlayerView ref={ref} player={player} controls={<MyControls />} />
```

You can mix and match — keep the default chrome on and use `children` for non-auto-hiding overlays like a rendition picker.

#### Notes

- `onFullscreenEnter` / `onFullscreenExit` fire on every transition, including Android hardware-back dismissal — your local `isFullscreen` state stays in sync without manual back-button handling.
- Children render alongside the native video (not inside it) on both platforms — use absolute positioning for overlays.
- The native view briefly remounts on toggle. The shared video output (iOS `AVSampleBufferDisplayLayer`, Android player `Surface`) is keyed by `broadcastPath` and re-attaches automatically; expect at most one frame of black.
- `videoAspectRatio` only applies in fullscreen. Inline layout is driven by `style` as usual.
