import { StyleSheet, View } from 'react-native';
import { Button, ErrorText, Hint } from './ui';
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
      <ErrorText text={`Model error: ${String(transcription.modelError)}`} />
    );
  }

  if (!transcription.modelRequested) {
    return (
      <>
        <Hint>{intro}</Hint>
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
        <Hint>Downloading & loading Whisper… {pct}%</Hint>
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
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: { height: 6 },
});
