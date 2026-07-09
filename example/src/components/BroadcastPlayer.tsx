import type {
  AudioTrackInfo,
  BroadcastInfo,
  VideoTrackInfo,
} from 'react-native-moq';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  useAudioPlayer,
  useDataMessages,
  useVideoPlayer,
} from 'react-native-moq';
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
  const { colors } = useTheme();
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

  const [captionsOn, setCaptionsOn] = useState(false);
  const caption = useSubtitles(broadcast, captionsOn);

  return (
    <>
      {/* Renders its own inline + fullscreen chrome; pass
          `miniControls`/`controls` (false or a ReactNode) to opt out or replace. */}
      <View style={styles.videoWrap}>
        <VideoPlayerView
          player={player}
          style={styles.video}
          videoAspectRatio={videoAspectRatio}
        />
        {captionsOn && caption !== '' && (
          <View style={styles.captionOverlay} pointerEvents="none">
            <Text style={styles.captionText}>{caption}</Text>
          </View>
        )}
      </View>

      <TrackInfoPills
        video={activeTrack}
        audio={broadcast.audioTracks.find(
          (t) => t.name === player.currentAudioTrackName
        )}
      />

      <View style={styles.captionRow}>
        <Text style={[styles.captionHint, { color: colors.secondaryLabel }]}>
          Subtitles — shown if the broadcast publishes them
        </Text>
        <IconButton
          icon="closed-caption"
          size={32}
          variant={captionsOn ? 'filled' : 'tonal'}
          accessibilityLabel={captionsOn ? 'Hide subtitles' : 'Show subtitles'}
          onPress={() => setCaptionsOn((on) => !on)}
        />
      </View>

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

// Publishers using live captions send the rolling transcript on the
// `subtitles` data track (see the Publish tab's SubtitlesSection); data tracks
// aren't in the catalog, so the name is agreed upon here.
const SUBTITLES_TRACK = 'subtitles';
// Whisper rewrites a ~12 s window; only its tail fits a caption bar.
const CAPTION_MAX_CHARS = 160;
// Clear the caption when the publisher stops sending (e.g. captions stopped).
const CAPTION_TTL_MS = 8000;

function captionTail(text: string): string {
  if (text.length <= CAPTION_MAX_CHARS) return text;
  const cut = text.slice(-CAPTION_MAX_CHARS);
  const space = cut.indexOf(' ');
  return space > 0 && space < 40 ? cut.slice(space + 1) : cut;
}

// Latest caption from the broadcast's subtitles data track; subscribes only
// while enabled and clears when messages stop arriving.
function useSubtitles(broadcast: BroadcastInfo, enabled: boolean): string {
  const [caption, setCaption] = useState('');
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useDataMessages(
    broadcast,
    (message) => {
      setCaption(captionTail(message.payload));
      if (clearTimer.current) clearTimeout(clearTimer.current);
      clearTimer.current = setTimeout(() => setCaption(''), CAPTION_TTL_MS);
    },
    { trackName: SUBTITLES_TRACK, autoStart: enabled }
  );

  useEffect(() => {
    if (!enabled) setCaption('');
    return () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, [enabled]);

  return caption;
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
  videoWrap: { width: '100%' },
  video: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  captionOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    alignItems: 'center',
  },
  captionText: {
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.65)',
    fontSize: 14,
    lineHeight: 19,
    textAlign: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
  captionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  captionHint: { flexShrink: 1, fontSize: 13 },
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
