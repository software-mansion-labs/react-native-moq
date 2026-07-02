Demo app for [`react-native-moq`](../packages/react-native-moq), bootstrapped with [`@react-native-community/cli`](https://github.com/react-native-community/cli).

## What's inside

Four tabs:

- **Subscribe** — discover broadcasts on a relay and play them (video or audio-only).
- **Publish** — broadcast the camera, microphone, or screen.
- **Audio** — consume a broadcast's audio as raw chunks with `useAudioChunks`: play decoded PCM through [react-native-audio-api](https://github.com/software-mansion/react-native-audio-api) and run on-device Whisper transcription through [react-native-executorch](https://github.com/software-mansion/react-native-executorch). Both run on **iOS and Android**.
- **MoQBoy** — a cloud-gaming controller built on data tracks.

## Running

From the repo root:

```sh
yarn                 # install
yarn example start   # start Metro

# in another terminal
yarn example ios     # or: yarn example android
```

On iOS, install pods first: `cd ios && bundle install && bundle exec pod install` (re-run `pod install` after changing native deps).

> **Note:** Complete the [React Native environment setup](https://reactnative.dev/docs/set-up-your-environment) before your first build.

## The Audio tab's extra native modules

The **Audio** tab pulls in react-native-audio-api, react-native-executorch (+ its bare resource fetcher), react-native-fs, and background-downloader. They're already in `package.json` — just `yarn` then `pod install`. A few platform gotchas:

- **iOS** — executorch requires **iOS 17+** (the example's deployment target). Some of these libs need the `pre_install` / `post_install` tweaks in [`ios/Podfile`](ios/Podfile) to build under `use_frameworks!`.
- **Android** — executorch only ships native libs for `arm64-v8a` / `x86_64`, so [`android/gradle.properties`](android/gradle.properties) restricts `reactNativeArchitectures` to those. It also bundles a `libc++_shared.so` that collides with react-native-audio-api's, resolved by a `pickFirst` in [`android/app/build.gradle`](android/app/build.gradle).
- The first time you open the transcription demo it downloads the Whisper model (~tens of MB).
