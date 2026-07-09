import { StyleSheet, Text, View } from 'react-native';
import type { BroadcastInfo } from 'react-native-moq';
import { Button } from './ui';
import { WhisperModelGate } from './WhisperModelGate';
import { useWhisperTranscription } from '../hooks/useWhisperTranscription';
import { useTheme } from '../theme';

/**
 * Live on-device transcription of a broadcast's audio — the UI over
 * `useWhisperTranscription` (rolling-window Whisper via react-native-executorch).
 */
export function TranscriptionPanel({
  broadcast,
}: {
  broadcast: BroadcastInfo;
}) {
  const { colors, radius } = useTheme();
  const transcription = useWhisperTranscription(broadcast);
  const { capturing, transcript } = transcription;

  return (
    <View style={styles.panel}>
      <WhisperModelGate
        transcription={transcription}
        intro="Transcribe this broadcast on-device with Whisper. The model downloads once (~tens of MB) and runs locally — no audio leaves the device."
      >
        <Button
          title={capturing ? 'Stop transcription' : 'Start transcription'}
          icon={capturing ? 'stop' : 'closed-caption'}
          variant={capturing ? 'tonal' : 'filled'}
          onPress={capturing ? transcription.stop : transcription.start}
        />
        <View
          style={[
            styles.transcriptBox,
            { backgroundColor: colors.fill, borderRadius: radius.control },
          ]}
        >
          {transcript === '' ? (
            <Text style={[styles.muted, { color: colors.tertiaryLabel }]}>
              {capturing
                ? 'Listening…'
                : 'Press start to caption the live audio.'}
            </Text>
          ) : (
            <Text style={[styles.transcript, { color: colors.label }]}>
              {transcript}
            </Text>
          )}
        </View>
      </WhisperModelGate>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 12 },
  muted: { fontSize: 13, lineHeight: 18 },
  transcriptBox: {
    minHeight: 96,
    padding: 12,
  },
  transcript: { fontSize: 15, lineHeight: 22 },
});
