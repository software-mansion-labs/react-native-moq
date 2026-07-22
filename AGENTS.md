# AGENTS.md

Guidance for AI coding agents working in this repo. Read [ARCHITECTURE.md](ARCHITECTURE.md) before making non-trivial changes — it explains the layering, invariants, and where bugs belong.

## What this is

React Native bindings for [moq-kit](https://github.com/software-mansion-labs/moq-kit) (Media over QUIC). This repo contains **no protocol or media code** — transport, decoding, A/V sync, and latency bugs almost always belong in moq-kit.

**Before debugging any media, A/V-sync, or latency issue:** establish which side of the moq-kit boundary it's on (see "The moq-kit boundary" in ARCHITECTURE.md). When a bug looks like it lives on the moq-kit side, read [moq-kit](https://github.com/software-mansion-labs/moq-kit) directly rather than guessing at its behavior from this side.

## Layout

- `packages/react-native-moq` — the bindings: framework-free cores in `src/*.ts`, hooks in `src/hooks/`, native modules in `ios/` and `android/`
- `packages/react-native-moq-ui` — player UI components built on the public API
- `example/` — the example app, and the only test bed for native code
- `docs/API.md` — public API reference; `skills/react-native-moq/` — the distributable agent skill for library consumers

## Setup and commands

Yarn 4 workspaces + turbo monorepo. `npm` will not work. Node 22 (`.nvmrc`).

```sh
yarn                        # install
yarn typecheck              # tsc across workspaces
yarn lint [--fix]           # ESLint + Prettier
yarn test                   # Jest (JS layer only)
yarn test path/to/file      # one file; add -t "name" to scope to one test
yarn example ios|android    # build & run the example app
yarn example start          # Metro only
```

There is no working web target: `yarn example web` fails (`example/vite.config.mjs` is an unadapted template leftover reading the wrong `package.json`) — don't use it as a verification path.

The public API surface is documented in [docs/API.md](docs/API.md) — read it there rather than reconstructing it from `src/`.

## Verifying changes

- JS changes hot-reload into the example app; **native changes require a rebuild** via `yarn example ios|android`.
- Testing playback needs a MoQ relay: from the moq-kit repo root, `mise relay:run` starts one and `mise stream:file --input path/to/video.mp4` publishes a broadcast from a file. The relay URL entered in the app is the URL/IP of the device running the relay (use the machine's LAN IP for physical devices).
- Jest covers only the TypeScript layer (`packages/react-native-moq/src/__tests__/`) with mocked TurboModules. **Native code has no automated tests** — verify manually in the example app, on both platforms if the change touches both.
- CI runs lint, typecheck, tests, a library build, and example builds for both platforms (the iOS build on `macos-26` — see "Don't touch without a reason to").
- The bindings consume **published** moq-kit artifacts — Android via `com.swmansion.moqkit:moqkit` in `packages/react-native-moq/android/build.gradle`, iOS via the SPM pin in `packages/react-native-moq/MoQ.podspec` — not a local checkout. Verifying a local moq-kit change means publishing it to `mavenLocal` at the pinned version (Android) or pointing the SPM reference at the local checkout (iOS), then rebuilding the example.

## Invariants — do not break

Rationale for each is in ARCHITECTURE.md:

- **Hooks contain no domain logic.** Anything a hook does must be doable from plain JS via the `create*`/`subscribe*` cores in `src/*.ts`.
- **iOS and Android expose identical module/event/state contracts as seen from JS.** No `Platform.OS` branches for core behavior; a feature or contract change must land on both platforms.
- **`react-native-moq-ui` uses only the public API** of `react-native-moq`.
- **Media failures never throw or reject** — they surface as state transitions (`lastError`), through the same event channel as every other state change.

## Changing the public API

A new API is a vertical slice — core in `src/*.ts`, hook wrapper in `src/hooks/`, and both native implementations. Mirror an existing slice (e.g. `dataMessages.ts` → `useDataMessages.ts` → its iOS/Android modules) rather than inventing new structure.

Keep these in sync in the same PR:

1. `docs/API.md`
2. `skills/react-native-moq/SKILL.md` (bump its version line when releasing — releases run via `yarn release`, i.e. release-it)
3. Both native implementations (`packages/react-native-moq/ios` and `android`)

## Don't touch without a reason to

These are pinned deliberately; changing them breaks the build in non-obvious ways:

- **ESLint stays on 9** (the React Native shared preset doesn't support 10).
- **Jest is pinned to `30.4.1`** with matching `resolutions` — don't bump it or let a transitive dep float off it.
- **CI's iOS build stays on `macos-26`**, not `macos-latest` (moqFFI module redefinition).

## Conventions

- Conventional commits. Commitlint (via lefthook) checks the format but is configured to allow type-less messages, so write them properly yourself. Lefthook also runs ESLint and tsc pre-commit.
- Comments are sparse: only non-obvious "why", never restating what the code does.
- Don't bump dependency majors as a side effect of a feature.
- Docs are concise and scannable; don't duplicate content between README, API.md, and ARCHITECTURE.md. CONTRIBUTING.md deliberately repeats the dev-workflow basics for human contributors — when commands or the PR checklist change, update it and this file together.
- If you find this file, ARCHITECTURE.md, or API.md contradicting reality, fix the doc in the same PR — stale guidance is worse than none.
