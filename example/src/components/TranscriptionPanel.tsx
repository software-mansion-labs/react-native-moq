import { StyleSheet, View } from 'react-native';
import type { BroadcastInfo } from 'react-native-moq';
import { Button } from './ui';
import { TranscriptBox } from './TranscriptBox';
import { WhisperModelGate } from './WhisperModelGate';
import { useWhisperTranscription } from '../hooks/useWhisperTranscription';

/**
 * Live on-device transcription of a broadcast's audio — the UI over
 * `useWhisperTranscription` (rolling-window Whisper via react-native-executorch).
 */
export function TranscriptionPanel({
  broadcast,
}: {
  broadcast: BroadcastInfo;
}) {
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
        <TranscriptBox
          transcript={transcript}
          placeholder={
            capturing ? 'Listening…' : 'Press start to caption the live audio.'
          }
          minHeight={96}
        />
      </WhisperModelGate>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 12 },
});
