import {
  useEventListener,
  type AudioPlayer,
  type Player,
} from 'react-native-moq';
import type { AddEntry } from './EventLog';

// Mirrors a player's lifecycle events into the on-screen event log. Shared by
// the video and audio sections of BroadcastPlayer, which only differ in the
// `kind` label they attach to each entry.
export function usePlayerEventLog(
  player: Player | AudioPlayer,
  kind: 'video' | 'audio',
  addEntry: AddEntry,
  path: string
) {
  useEventListener(player, 'playingChange', ({ isPlaying }) =>
    addEntry('playingChange', `${kind} isPlaying=${isPlaying}`, path)
  );
  useEventListener(player, 'trackStopped', () =>
    addEntry('trackStopped', kind, path)
  );
  useEventListener(player, 'trackSwitched', ({ trackKind, trackName }) =>
    addEntry('trackSwitched', `${trackKind} → ${trackName}`, path)
  );
}
