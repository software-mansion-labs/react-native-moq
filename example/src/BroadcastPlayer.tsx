import type { BroadcastInfo } from 'react-native-moq';
import { Button, StyleSheet, Text, View } from 'react-native';
import { VideoView, useEventListener, usePlayer } from 'react-native-moq';
import type { AddEntry } from './EventLog';
import { RenditionPicker } from './RenditionPicker';
import { StatsPanel } from './StatsPanel';

export function BroadcastPlayer({
  broadcast,
  onRemove,
  addEntry,
}: {
  broadcast: BroadcastInfo;
  onRemove: () => void;
  addEntry: AddEntry;
}) {
  const player = usePlayer(broadcast.player, (p) => {
    p.play();
  });

  const handleRemove = () => {
    player.pause();
    onRemove();
  };

  const sortedVideoTracks = [...broadcast.videoTracks].sort((a, b) => {
    const px = (t: typeof a) => (t.width ?? 0) * (t.height ?? 0);
    return px(b) - px(a);
  });

  useEventListener(player.emitter, 'playingChange', ({ isPlaying }) => {
    addEntry('playingChange', `isPlaying=${isPlaying}`, broadcast.path);
  });

  useEventListener(player.emitter, 'trackStopped', () => {
    addEntry('trackStopped', undefined, broadcast.path);
  });

  useEventListener(
    player.emitter,
    'trackSwitched',
    ({ trackKind, trackName }) => {
      addEntry('trackSwitched', `${trackKind} → ${trackName}`, broadcast.path);
    }
  );

  return (
    <View style={styles.broadcastCard}>
      <View style={styles.broadcastHeader}>
        <Text style={styles.broadcastPath}>{broadcast.path}</Text>
        <Button title="Disconnect" onPress={handleRemove} color="#ef4444" />
      </View>

      <VideoView player={player} style={styles.video} />

      {sortedVideoTracks.length > 1 && (
        <RenditionPicker
          tracks={sortedVideoTracks}
          currentTrackName={player.currentVideoTrackName}
          onSelect={(name: string) => player.switchVideoTrack(name)}
        />
      )}

      <Button
        title={player.isPlaying ? 'Pause' : 'Resume'}
        onPress={player.isPlaying ? player.pause : player.play}
      />

      {player.playbackStats && <StatsPanel stats={player.playbackStats} />}
    </View>
  );
}

const styles = StyleSheet.create({
  broadcastCard: {
    gap: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
  },
  broadcastHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  broadcastPath: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  video: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
});
