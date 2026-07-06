import { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  KOKORO_AMERICAN_ENGLISH_FEMALE_HEART,
  useTextToSpeech,
} from 'react-native-executorch';
import type { AudioSourceTrack, PublishedTrackState } from 'react-native-moq';
import { createMonoResampler } from '../resamplePcm';

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
    <View style={styles.card}>
      <Text style={styles.sectionLabel}>TEXT-TO-SPEECH</Text>
      <TextInput
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
        onPress={speak}
        disabled={!canSpeak}
      />
      <Text style={styles.status}>{status}</Text>
      {publishing && !trackActive && (
        <Text style={styles.status}>Waiting for the audio track to start…</Text>
      )}
      {!publishing && (
        <Text style={styles.status}>Publish first, then speak.</Text>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    minHeight: 60,
    backgroundColor: '#fff',
    textAlignVertical: 'top',
  },
  status: { fontSize: 12, color: '#6b7280' },
  error: { fontSize: 13, color: '#dc2626' },
});
