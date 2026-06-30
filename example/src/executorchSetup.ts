import { initExecutorch } from 'react-native-executorch';
import { BareResourceFetcher } from 'react-native-executorch-bare-resource-fetcher';

// react-native-executorch 0.9 requires a resource-fetcher adapter to be
// registered once, before any model loads, so it knows how to download/cache
// model files. This is the bare-RN (non-Expo) adapter, backed by
// @dr.pogodin/react-native-fs + @kesha-antonov/react-native-background-downloader.
// Imported for its side effect at app startup (see App.tsx).
initExecutorch({ resourceFetcher: BareResourceFetcher });
