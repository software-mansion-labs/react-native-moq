import type {
  AudioTrackInfo,
  BroadcastInfo,
  VideoTrackInfo,
} from 'react-native-moq';
import { useEffect, useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import {
  useAudioPlayer,
  useEvent,
  useEventListener,
  useVideoPlayer,
} from 'react-native-moq';
import {
  SpeakerGlyph,
  VideoPlayerView,
  VolumeSlider,
} from 'react-native-moq-ui';
import type { AddEntry } from './EventLog';
import { AudioChunksMeter } from './AudioChunksMeter';
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
  const player = useVideoPlayer(broadcast, (p) => {
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

  // Aspect ratio of the active video track (or the largest one we know of).
  // Passed to VideoPlayerView so the fullscreen modal letterboxes correctly on
  // Android, where SurfaceView would otherwise stretch the video.
  const activeTrack =
    broadcast.videoTracks.find(
      (t) => t.name === player.currentVideoTrackName
    ) ?? sortedVideoTracks[0];
  const videoAspectRatio =
    activeTrack && activeTrack.width && activeTrack.height
      ? activeTrack.width / activeTrack.height
      : undefined;

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
      {/* VideoPlayerView renders its own native-looking inline mini chrome
          (centered play/pause + bottom-right fullscreen-enter) and fullscreen
          chrome (close + play/pause), both with tap-to-toggle auto-hide. Pass
          `miniControls={false}` / `controls={false}` to opt out, or pass a
          ReactNode to either to swap in your own. */}
      <VideoPlayerView
        player={player}
        style={styles.video}
        videoAspectRatio={videoAspectRatio}
      />

      <TrackInfoPills
        video={activeTrack}
        audio={broadcast.audioTracks.find(
          (t) => t.name === player.currentAudioTrackName
        )}
      />

      {sortedVideoTracks.length > 1 && (
        <RenditionPicker
          tracks={sortedVideoTracks}
          currentTrackName={player.currentVideoTrackName}
          onSelect={(name: string) => player.switchVideoTrack(name)}
        />
      )}

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

      <TrackInfoPills
        audio={broadcast.audioTracks.find(
          (t) => t.name === player.currentAudioTrackName
        )}
      />

      <Button
        title={player.isPlaying ? 'Pause' : 'Resume'}
        onPress={player.isPlaying ? player.pause : player.play}
      />

      <View style={styles.volumeCard}>
        <SpeakerGlyph size={16} color="#374151" volume={player.volume} />
        <VolumeSlider player={player} width={200} theme="light" />
      </View>

      <AudioChunksMeter broadcast={broadcast} />

      {player.playbackStats && <StatsPanel stats={player.playbackStats} />}
    </>
  );
}

// Mirrors moq-kit's iOS demo SessionPlayerView InfoPill row — shows the
// currently-playing track's codec / dimensions / sample rate.
function TrackInfoPills({
  video,
  audio,
}: {
  video?: VideoTrackInfo;
  audio?: AudioTrackInfo;
}) {
  if (!video && !audio) return null;
  return (
    <View style={styles.pillRow}>
      {video && <InfoPill text={video.codec.toUpperCase()} />}
      {video && video.width && video.height && (
        <InfoPill text={`${video.width}×${video.height}`} />
      )}
      {audio && (
        <InfoPill
          text={`${audio.codec.toUpperCase()} ${audio.sampleRate} Hz`}
        />
      )}
    </View>
  );
}

function InfoPill({ text }: { text: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText}>{text}</Text>
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
  volumeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
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
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    backgroundColor: '#e5e7eb',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#374151',
  },
});
