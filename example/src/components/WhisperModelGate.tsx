import { StyleSheet, Text, View } from 'react-native';
import { Button } from './ui';
import { useTheme } from '../theme';
import type { WhisperTranscription } from '../hooks/useWhisperTranscription';

/**
 * Pre-ready states of the Whisper model — error, download prompt (`intro` above
 * the load button), download progress. Renders `children` once the model is
 * loaded.
 */
export function WhisperModelGate({
  transcription,
  intro,
  children,
}: {
  transcription: WhisperTranscription;
  intro: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();

  if (transcription.modelError) {
    return (
      <Text style={[styles.text, { color: colors.destructive }]}>
        Model error: {String(transcription.modelError)}
      </Text>
    );
  }

  if (!transcription.modelRequested) {
    return (
      <>
        <Text style={[styles.text, { color: colors.secondaryLabel }]}>
          {intro}
        </Text>
        <Button
          title="Load Whisper model"
          icon="download"
          onPress={transcription.requestModel}
        />
      </>
    );
  }

  if (!transcription.modelReady) {
    const pct = Math.round(transcription.downloadProgress * 100);
    return (
      <>
        <Text style={[styles.text, { color: colors.secondaryLabel }]}>
          Downloading & loading Whisper… {pct}%
        </Text>
        <View style={[styles.progressTrack, { backgroundColor: colors.fill }]}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: colors.tint, width: `${pct}%` },
            ]}
          />
        </View>
      </>
    );
  }

  return children;
}

const styles = StyleSheet.create({
  text: { fontSize: 13, lineHeight: 18 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: { height: 6 },
});
