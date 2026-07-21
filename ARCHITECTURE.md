# Architecture

This document describes the high-level architecture of react-native-moq. If you want to familiarize yourself with the code base, you are in the right place!

## Bird's Eye View

Media over QUIC (MoQ) media pipelines exist natively in [moq-kit](https://github.com/software-mansion/moq-kit), a separate Software Mansion library, but have no React Native surface. The problem this repo solves is marshalling that event-driven native media stack into React's declarative world: sub-second-latency video/audio playback, camera/mic/screen publishing, and realtime data tracks, all through a MoQ relay.

The actual MoQ protocol, media pipelines, encoders and decoders all live in moq-kit. **This repo contains no protocol or media code** — it is the React Native binding layer: TurboModules and native views on the native side, and a state/lifecycle layer on the JS side that turns moq-kit's callbacks into reactive objects and hooks.

Data flows in two deliberately different shapes: JS → native as fire-and-forget void method calls on TurboModules (`connect`, `play`, `publish`, …), and native → JS as a stream of state events (see *Error model* below).

## Code Map

This is a yarn-workspaces monorepo driven by turbo. The two publishable packages live under `packages/`.

### `packages/react-native-moq/src`

The TypeScript API. `index.tsx` is the single export surface; `types.ts` holds the public object interfaces (`Session`, `Player`, `Publisher`, capture tracks) and is the best place to start reading.

The JS side is layered, bottom to top:

- **`src/native/`** — TurboModule specs (codegen, `NativeMoQ*.ts`). `NativeMoQ.ts` covers sessions, broadcast discovery and playback; each capture/source feature (camera, microphone, data track, audio/video source, screen broadcast, publisher) has its own module.
- **`src/*.ts` (cores)** — hook-free imperative handles: `createSession`, `createCamera`, `subscribeBroadcasts`, etc. Each core owns its native ids, watches native state events, and exposes live getters plus an `EventEmitter`. `nativeState.ts` centralizes the state-watching/`lastError` machinery shared by all of them.
- **`src/hooks/`** — thin React wrappers over the cores: mint ids, create the handle once, subscribe to `stateChange`, re-render.

  **Architecture Invariant:** hooks contain no domain logic. Anything a hook can do must be doable from plain JS through the corresponding `create*`/`subscribe*` core.

- **`src/views/`** — native component wrappers (`VideoView`, `PublisherView`, `BroadcastPickerView`). They pass ids, not object references, down to the platform view (see *Id-based rendezvous* below).

The two native implementations below mirror each other, one file/folder per feature.

**Architecture Invariant:** iOS and Android expose byte-identical module/event/state contracts to JS. The TypeScript layer contains no `Platform.OS` branches for core behavior.

### `packages/react-native-moq/ios`

`MoQImpl.swift` is the native entry point — start reading there. `MoQ.mm` is the Objective-C++ TurboModule glue; it delegates everything to the `MoQImpl.swift` singleton and per-feature folders (`Camera/`, `Microphone/`, `Player/`, `Publisher/`, …). moq-kit is consumed as an SPM dependency declared in `MoQ.podspec`.

### `packages/react-native-moq/android`

Kotlin modules under `com.moq` (`camera/`, `player/`, `publisher/`, …). `MoQModule.kt` is the native entry point — start reading there. `Events.kt` is the single event-emission path; `capture/RefcountedCapture.kt` implements the shared capture-device refcounting. moq-kit is consumed as a Maven artifact from `build.gradle`.

### `packages/react-native-moq-ui`

Optional player chrome (fullscreen modal, controls, volume slider) composed on top of `<VideoView>`. Pure TypeScript, no native code.

**Architecture Invariant:** `react-native-moq-ui` uses only the public API of `react-native-moq`. It is a reference consumer — if it needs an internal, the public API is missing something.

### `example/`

Demo app exercising every feature, one screen per feature area. Also serves as the manual test bed for both platforms.

### `docs/`, `skills/`

`docs/API.md` is the full API reference; `skills/react-native-moq` is the Claude Code skill distributed with the library.

## Cross-Cutting Concerns

### Id-based rendezvous

Everything is keyed by plain strings minted on the JS side: `sessionId` (from `mintSessionId()`), `broadcastPath`, track names, capture ids. Native keeps maps from these ids to live objects; JS never holds a native reference. This is what lets a `<VideoView>` find its player with just `(sessionId, broadcastPath)` props, lets any number of sessions coexist, and keeps every TurboModule method a simple `(id, ...args) → void` call.

### Error model

Media failures never throw and never reject. A failure surfaces as a state transition to an error state, delivered through the same event channel as every other state change. `nativeState.ts` lifts the message into a `lastError` field on handles that have one. Consequence: adding a new failure mode never changes a method signature.

### Refcounting

Two kinds of shared resources are refcounted rather than owned:

- **Capture devices** — camera and microphone are process-wide singletons; hardware starts on first consumer and stops when the count drops to zero. All consumers see the same device (a `flip()` affects everyone).
- **Subscriptions** — broadcast-prefix and track-object subscriptions are refcounted per `(sessionId, key)`, so multiple hooks can watch the same data without duplicate relay traffic.

### Lifecycle & teardown

Nothing is left to GC. Every JS core exposes an explicit `destroy()`/`stop()`, and every hook calls it from a `useEffect` cleanup on unmount or id change. Native cleans its id→object maps at well-defined lifecycle points, the coarsest being `disconnect`, which drops the whole per-session context.

Two subtleties are worth internalizing:

- **A native player is owned by its broadcast, not by the view.** `VideoView` and `createVideoPlayer` teardown only detach the display layer / surface and drop listeners — they never stop native playback. (The audio-only player is the exception: it owns and stops its native player.) So unmounting a `<VideoView>` never tears down the stream; it just stops rendering it.
- **Publisher stop/replace is serialized** — a new `publish()` awaits the previous `stop()`/`unpublish()` instead of racing it on the shared session (a race there can drop the entire session).

**Platform asymmetry to know about:** Android modules override `invalidate()` and proactively tear down every session, capture and publisher on JS reload / catalyst teardown. **iOS has no `invalidate` equivalent** — its process-wide singletons persist across a reload until JS explicitly disconnects, or until the next `connect()` reaps the now-dead context. This is the one place the two platforms deliberately differ.

### Threading

- **iOS:** all bridge work and event emission run on the **main actor**, deliberately, to keep call ordering deterministic.
- **Android:** control methods hand async work to a background coroutine scope; events are emitted from there, with no dedicated event thread.

The invariant that matters across both: **view/layer/surface attachment happens on the main thread.** iOS gets this for free (everything is already on main). Android must re-post surface delivery onto the main thread — a deliberate happens-before barrier so the surface push observes a fully-built playback pipeline. Getting that barrier wrong is a classic source of black-screen races.

### Testing

The JS layer is unit-tested with Jest (`src/__tests__/`): TurboModules are replaced with `jest.mock` and native state events are simulated through `DeviceEventEmitter`, so the whole core/hook state machinery runs without any native code. Native behavior has no automated coverage — it is verified manually on both platforms through `example/`.

### The moq-kit boundary

Bugs in transport, decoding, A/V sync or latency almost always belong in moq-kit, not here. This repo's job ends at: marshalling calls/events across the bridge, mapping ids to moq-kit objects, and managing lifecycles (refcounts, surface/layer attachment, teardown on invalidate). When debugging, first establish which side of that boundary the problem is on.
