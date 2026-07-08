import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import {
  KOKORO_AMERICAN_ENGLISH_FEMALE_HEART,
  useTextToSpeech,
} from 'react-native-executorch';
import type { AudioSourceTrack, PublishedTrackState } from 'react-native-moq';
import { createMonoResampler } from '../resamplePcm';
import { Button, Input } from './ui';
import { useTheme } from '../theme';

// Kokoro synthesizes 24 kHz mono; resample to the 48 kHz the source publishes.
const KOKORO_SAMPLE_RATE = 24000;
const PUBLISH_SAMPLE_RATE = 48000;
// ~120 ms slices keep each bridge payload small; native buffers + paces them.
const SLICE_SAMPLES = Math.floor(PUBLISH_SAMPLE_RATE * 0.12);

/**
 * Text-to-speech → publish. Runs Kokoro on-device (react-native-executorch),
 * resamples its 24 kHz float PCM to 48 kHz, and pushes it into the broadcast's
 * audio source. The model downloads on first enable.
 */
export function TtsAudioSection({
  audioSource,
  enabled,
  publishing,
  trackState,
}: {
  audioSource: AudioSourceTrack;
  enabled: boolean;
  publishing: boolean;
  trackState?: PublishedTrackState;
}) {
  const [text, setText] = useState(
    'Hello from React Native, over Media over QUIC.'
  );
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load Kokoro only once the user enables TTS.
  const tts = useTextToSpeech(KOKORO_AMERICAN_ENGLISH_FEMALE_HEART, {
    preventLoad: !enabled,
  });

  const trackActive = trackState === 'active';
  const canSpeak =
    publishing && trackActive && tts.isReady && !tts.isGenerating && !speaking;

  const speak = async () => {
    const phrase = text.trim();
    if (!phrase) return;
    setError(null);
    setSpeaking(true);
    try {
      const audio = await tts.forward({ text: phrase });
      // Fresh resampler per utterance so no state bleeds between phrases.
      const resample = createMonoResampler(PUBLISH_SAMPLE_RATE);
      const pcm = resample(audio, 1, KOKORO_SAMPLE_RATE);
      for (let i = 0; i < pcm.length; i += SLICE_SAMPLES) {
        audioSource.send(
          pcm.subarray(i, Math.min(i + SLICE_SAMPLES, pcm.length))
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSpeaking(false);
    }
  };

  const status = tts.error
    ? `error: ${tts.error.message}`
    : tts.isReady
      ? 'model ready'
      : tts.downloadProgress > 0 && tts.downloadProgress < 1
        ? `downloading model… ${Math.round(tts.downloadProgress * 100)}%`
        : 'loading model…';

  return (
    <>
      <Input
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="Type something to speak"
        multiline
        editable={!tts.isGenerating && !speaking}
      />
      <Button
        title={
          tts.isGenerating || speaking
            ? 'Synthesizing…'
            : 'Speak into broadcast'
        }
        icon="record-voice-over"
        variant="tonal"
        onPress={speak}
        disabled={!canSpeak}
      />
      <Status text={status} />
      {publishing && !trackActive && (
        <Status text="Waiting for the audio track to start…" />
      )}
      {!publishing && <Status text="Publish first, then speak." />}
      {error && <ErrorText text={error} />}
    </>
  );
}

function Status({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.status, { color: colors.secondaryLabel }]}>
      {text}
    </Text>
  );
}

function ErrorText({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.error, { color: colors.destructive }]}>{text}</Text>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  status: { fontSize: 12 },
  error: { fontSize: 13 },
});
