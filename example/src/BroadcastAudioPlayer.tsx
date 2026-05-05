import type { AudioTrackInfo, BroadcastInfo } from 'react-native-moq';
import { useEffect } from 'react';
import {
  Button,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAudioPlayer, useEvent, useEventListener } from 'react-native-moq';
import type { AddEntry } from './EventLog';
import { StatsPanel } from './StatsPanel';

function audioTrackLabel(track: AudioTrackInfo): string {
  if (track.bitrate) return `${Math.round(track.bitrate / 1000)}k`;
  return track.name;
}

export function BroadcastAudioPlayer({
  broadcast,
  onRemove,
  addEntry,
}: {
  broadcast: BroadcastInfo;
  onRemove: () => void;
  addEntry: AddEntry;
}) {
  const player = useAudioPlayer(broadcast.player, (p) => {
    p.play();
  });

  const handleRemove = () => {
    player.pause();
    onRemove();
  };

  const playingChangeEvent = useEvent(player, 'playingChange');
  useEffect(() => {
    if (playingChangeEvent !== undefined) {
      addEntry(
        'playingChange',
        `isPlaying=${playingChangeEvent.isPlaying}`,
        broadcast.path
      );
    }
  }, [playingChangeEvent, addEntry, broadcast.path]);

  useEventListener(player, 'trackStopped', () => {
    addEntry('trackStopped', undefined, broadcast.path);
  });

  useEffect(() => {
    const sub = player.addListener(
      'trackSwitched',
      ({ trackKind, trackName }) => {
        addEntry(
          'trackSwitched',
          `${trackKind} → ${trackName}`,
          broadcast.path
        );
      }
    );
    return () => sub.remove();
  }, [player, addEntry, broadcast.path]);

  return (
    <View style={styles.broadcastCard}>
      <View style={styles.broadcastHeader}>
        <Text style={styles.broadcastPath}>{broadcast.path}</Text>
        <Button title="Disconnect" onPress={handleRemove} color="#ef4444" />
      </View>

      {broadcast.audioTracks.length > 1 && (
        <View style={styles.trackRow}>
          {broadcast.audioTracks.map((track) => {
            const isActive = track.name === player.currentAudioTrackName;
            return (
              <TouchableOpacity
                key={track.name}
                style={[styles.trackBtn, isActive && styles.trackBtnActive]}
                onPress={() => player.switchAudioTrack(track.name)}
              >
                <Text
                  style={[
                    styles.trackBtnText,
                    isActive && styles.trackBtnTextActive,
                  ]}
                >
                  {audioTrackLabel(track)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
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
  trackRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  trackBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#e5e7eb',
  },
  trackBtnActive: {
    backgroundColor: '#3b82f6',
  },
  trackBtnText: {
    fontSize: 13,
    color: '#374151',
  },
  trackBtnTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
});
