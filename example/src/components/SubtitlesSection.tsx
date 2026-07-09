import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useBroadcasts, useSession, type DataTrack } from 'react-native-moq';
import { WhisperModelGate } from './WhisperModelGate';
import { useWhisperTranscription } from '../hooks/useWhisperTranscription';
import { useTheme } from '../theme';

/**
 * Publisher-side live subtitles. While live, a loopback session subscribes to
 * this broadcast's own audio (the same decoded PCM any viewer gets), Whisper
 * transcribes it on-device, and each rolling transcript is sent on the
 * `subtitles` data track. Viewers toggle captions with `useDataMessages`.
 */
export function SubtitlesSection({
  url,
  path,
  publishing,
  micEnabled,
  dataTrack,
}: {
  url: string;
  path: string;
  publishing: boolean;
  micEnabled: boolean;
  dataTrack: DataTrack;
}) {
  const { colors, radius } = useTheme();

  // Loopback session: connected only while publishing, so the extra pull from
  // the relay lives exactly as long as the broadcast.
  const loop = useSession(url);
  const { connect, disconnect } = loop;
  useEffect(() => {
    if (publishing) connect();
    else disconnect();
  }, [publishing, connect, disconnect]);

  // Prefix '' like the Subscribe tab: broadcast paths are announced relative
  // to the subscription prefix, so `path` itself would come back as ''.
  const broadcasts = useBroadcasts(loop, '');
  const own = publishing
    ? (broadcasts.find((b) => b.path === path && b.audioTracks.length > 0) ??
      null)
    : null;

  const transcription = useWhisperTranscription(own);
  const { modelReady, capturing, transcript, start, stop } = transcription;

  // Caption automatically: start once the model and the loopback broadcast are
  // both up, stop when the broadcast ends.
  useEffect(() => {
    if (publishing && own && modelReady) start();
    if (!publishing) stop();
  }, [publishing, own, modelReady, start, stop]);

  // Ship each new rolling transcript; subscribers render the tail.
  const lastSent = useRef('');
  useEffect(() => {
    if (!publishing) {
      lastSent.current = '';
      return;
    }
    if (!capturing || transcript === '' || transcript === lastSent.current) {
      return;
    }
    lastSent.current = transcript;
    dataTrack.send(transcript);
  }, [transcript, publishing, capturing, dataTrack]);

  return (
    <View style={styles.panel}>
      <WhisperModelGate
        transcription={transcription}
        intro="Caption this broadcast on-device with Whisper and publish the transcript as a subtitles data track viewers can toggle. The model downloads once (~tens of MB) and runs locally."
      >
        {!micEnabled ? (
          <Text style={[styles.muted, { color: colors.tertiaryLabel }]}>
            Enable the mic — subtitles transcribe the broadcast&apos;s audio
            track.
          </Text>
        ) : !publishing ? (
          <Text style={[styles.muted, { color: colors.tertiaryLabel }]}>
            Go live to start captioning.
          </Text>
        ) : !own ? (
          <Text style={[styles.muted, { color: colors.tertiaryLabel }]}>
            Waiting for the broadcast audio…
          </Text>
        ) : (
          <View
            style={[
              styles.transcriptBox,
              { backgroundColor: colors.fill, borderRadius: radius.control },
            ]}
          >
            <Text
              style={[
                transcript === '' ? styles.muted : styles.transcript,
                {
                  color:
                    transcript === '' ? colors.tertiaryLabel : colors.label,
                },
              ]}
            >
              {transcript === '' ? 'Listening…' : transcript}
            </Text>
          </View>
        )}
      </WhisperModelGate>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 12 },
  muted: { fontSize: 13, lineHeight: 18 },
  transcriptBox: {
    minHeight: 72,
    padding: 12,
  },
  transcript: { fontSize: 15, lineHeight: 22 },
});
