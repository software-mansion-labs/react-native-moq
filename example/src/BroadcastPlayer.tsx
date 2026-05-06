import type { BroadcastInfo } from 'react-native-moq';
import { useEffect, useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import {
  VideoView,
  useAudioPlayer,
  useEvent,
  useEventListener,
  usePlayer,
} from 'react-native-moq';
import type { AddEntry } from './EventLog';
import { RenditionPicker } from './RenditionPicker';
import { StatsPanel } from './StatsPanel';

type Mode = 'video' | 'audio';

export function BroadcastPlayer({
  broadcast,
  initialMode,
  onRemove,
  addEntry,
}: {
  broadcast: BroadcastInfo;
  initialMode: Mode;
  onRemove: () => void;
  addEntry: AddEntry;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);

  const switchMode = () => setMode((m) => (m === 'video' ? 'audio' : 'video'));

  return (
    <View style={styles.broadcastCard}>
      <View style={styles.broadcastHeader}>
        <Text style={styles.broadcastPath}>{broadcast.path}</Text>
        {mode === 'audio' && (
          <View style={styles.audioBadge}>
            <Text style={styles.audioBadgeText}>AUDIO ONLY</Text>
          </View>
        )}
        <Button title="Disconnect" onPress={onRemove} color="#ef4444" />
      </View>

      <Button
        title={mode === 'video' ? 'Switch to audio only' : 'Switch to video'}
        onPress={switchMode}
      />

      {mode === 'video' ? (
        <VideoSection broadcast={broadcast} addEntry={addEntry} />
      ) : (
        <AudioSection broadcast={broadcast} addEntry={addEntry} />
      )}
    </View>
  );
}

function VideoSection({
  broadcast,
  addEntry,
}: {
  broadcast: BroadcastInfo;
  addEntry: AddEntry;
}) {
  const player = usePlayer(broadcast.player, (p) => {
    p.play();
  });

  // Pause when this section unmounts (mode switch or full disconnect) so the
  // video stream stops while audio mode is active.
  useEffect(() => {
    return () => player.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedVideoTracks = [...broadcast.videoTracks].sort((a, b) => {
    const px = (t: typeof a) => (t.width ?? 0) * (t.height ?? 0);
    return px(b) - px(a);
  });

  const playingChangeEvent = useEvent(player, 'playingChange');
  useEffect(() => {
    if (playingChangeEvent !== undefined) {
      addEntry(
        'playingChange',
        `video isPlaying=${playingChangeEvent.isPlaying}`,
        broadcast.path
      );
    }
  }, [playingChangeEvent, addEntry, broadcast.path]);

  useEventListener(player, 'trackStopped', () => {
    addEntry('trackStopped', 'video', broadcast.path);
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
    <>
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
    </>
  );
}

function AudioSection({
  broadcast,
  addEntry,
}: {
  broadcast: BroadcastInfo;
  addEntry: AddEntry;
}) {
  const player = useAudioPlayer(broadcast, (p) => {
    p.play();
  });

  const playingChangeEvent = useEvent(player, 'playingChange');
  useEffect(() => {
    if (playingChangeEvent !== undefined) {
      addEntry(
        'playingChange',
        `audio isPlaying=${playingChangeEvent.isPlaying}`,
        broadcast.path
      );
    }
  }, [playingChangeEvent, addEntry, broadcast.path]);

  useEventListener(player, 'trackStopped', () => {
    addEntry('trackStopped', 'audio', broadcast.path);
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
    <>
      <View style={styles.audioStatus}>
        <Text style={styles.audioStatusIcon}>
          {player.isPlaying ? '🔊' : '🔇'}
        </Text>
        <Text style={styles.audioStatusText}>
          {player.isPlaying ? 'Playing' : 'Paused'}
          {player.currentAudioTrackName
            ? ` · ${player.currentAudioTrackName}`
            : ''}
        </Text>
      </View>

      <Button
        title={player.isPlaying ? 'Pause' : 'Resume'}
        onPress={player.isPlaying ? player.pause : player.play}
      />

      {player.playbackStats && <StatsPanel stats={player.playbackStats} />}
    </>
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
    gap: 8,
  },
  broadcastPath: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  audioBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  audioBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1d4ed8',
    letterSpacing: 0.5,
  },
  video: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  audioStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
  },
  audioStatusIcon: {
    fontSize: 24,
  },
  audioStatusText: {
    fontSize: 14,
    color: '#374151',
  },
});
