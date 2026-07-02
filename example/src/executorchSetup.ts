import { initExecutorch } from 'react-native-executorch';
import { BareResourceFetcher } from 'react-native-executorch-bare-resource-fetcher';

// executorch 0.9 needs a resource-fetcher registered once before any model
// loads. This is the bare-RN (non-Expo) adapter; imported for side effect.
initExecutorch({ resourceFetcher: BareResourceFetcher });
