import type {
  AudioTrackInfo,
  BroadcastInfo,
  VideoTrackInfo,
} from 'react-native-moq';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAudioPlayer, useVideoPlayer } from 'react-native-moq';
import {
  SpeakerGlyph,
  VideoPlayerView,
  VolumeSlider,
} from 'react-native-moq-ui';
import type { AddEntry } from './EventLog';
import { usePlayerEventLog } from './usePlayerEventLog';
import { sortVideoTracksByResolution } from '../videoTracks';
import { AudioChunksMeter } from './AudioChunksMeter';
import { RenditionPicker } from './RenditionPicker';
import { StatsPanel } from './StatsPanel';
import { Card, IconButton, Pill, Segmented } from './ui';
import { useTheme } from '../theme';

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
  const { colors } = useTheme();
  const [mode, setMode] = useState<Mode>(initialMode);

  return (
    <Card>
      <View style={styles.broadcastHeader}>
        <Text
          style={[styles.broadcastPath, { color: colors.label }]}
          numberOfLines={1}
        >
          {broadcast.path}
        </Text>
        <IconButton
          icon="close"
          size={32}
          accessibilityLabel={`Stop watching ${broadcast.path}`}
          onPress={onRemove}
        />
      </View>

      <Segmented
        value={mode}
        options={[
          { value: 'video', label: 'Video' },
          { value: 'audio', label: 'Audio only' },
        ]}
        onChange={setMode}
      />

      {mode === 'video' ? (
        <VideoSection broadcast={broadcast} addEntry={addEntry} />
      ) : (
        <AudioSection broadcast={broadcast} addEntry={addEntry} />
      )}
    </Card>
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

  // Pause on unmount (mode switch / disconnect) so the video stream stops.
  useEffect(() => {
    return () => player.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedVideoTracks = sortVideoTracksByResolution(broadcast.videoTracks);

  // Aspect ratio of the active track, so Android's fullscreen modal letterboxes
  // rather than stretching the video.
  const activeTrack =
    broadcast.videoTracks.find(
      (t) => t.name === player.currentVideoTrackName
    ) ?? sortedVideoTracks[0];
  const videoAspectRatio =
    activeTrack && activeTrack.width && activeTrack.height
      ? activeTrack.width / activeTrack.height
      : undefined;

  usePlayerEventLog(player, 'video', addEntry, broadcast.path);

  return (
    <>
      {/* Renders its own inline + fullscreen chrome; pass
          `miniControls`/`controls` (false or a ReactNode) to opt out or replace. */}
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
  const { dark, colors, radius } = useTheme();
  const player = useAudioPlayer(broadcast, (p) => {
    p.play();
  });

  usePlayerEventLog(player, 'audio', addEntry, broadcast.path);

  return (
    <>
      <View
        style={[
          styles.audioRow,
          { backgroundColor: colors.fill, borderRadius: radius.control },
        ]}
      >
        <IconButton
          icon={player.isPlaying ? 'pause' : 'play-arrow'}
          variant="filled"
          accessibilityLabel={player.isPlaying ? 'Pause' : 'Resume'}
          onPress={player.isPlaying ? player.pause : player.play}
        />
        <Text style={[styles.audioStatusText, { color: colors.label }]}>
          {player.isPlaying ? 'Playing' : 'Paused'}
          {player.currentAudioTrackName
            ? ` · ${player.currentAudioTrackName}`
            : ''}
        </Text>
      </View>

      <View style={styles.volumeRow}>
        <SpeakerGlyph
          size={16}
          color={dark ? '#98989f' : '#6c6c70'}
          volume={player.volume}
        />
        <VolumeSlider
          player={player}
          width={200}
          theme={dark ? 'dark' : 'light'}
        />
      </View>

      <TrackInfoPills
        audio={broadcast.audioTracks.find(
          (t) => t.name === player.currentAudioTrackName
        )}
      />

      <AudioChunksMeter broadcast={broadcast} />

      {player.playbackStats && <StatsPanel stats={player.playbackStats} />}
    </>
  );
}

// Codec / dimensions / sample rate of the currently-playing track.
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
      {video && <Pill text={video.codec.toUpperCase()} />}
      {video && video.width && video.height && (
        <Pill text={`${video.width}×${video.height}`} />
      )}
      {audio && (
        <Pill text={`${audio.codec.toUpperCase()} ${audio.sampleRate} Hz`} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  broadcastHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  broadcastPath: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  video: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
  },
  audioStatusText: {
    fontSize: 14,
  },
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
});
