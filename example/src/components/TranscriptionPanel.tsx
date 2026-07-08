import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from './ui';
import { useTheme } from '../theme';
import {
  useSpeechToText,
  WHISPER_TINY_EN,
  WHISPER_TINY_EN_MODEL_XNNPACK,
} from 'react-native-executorch';
import { useAudioChunks, type BroadcastInfo } from 'react-native-moq';
import { createMonoResampler } from '../resamplePcm';

const TARGET_RATE = 16000;
// Rolling transcription window bounds and cadence.
const MAX_SAMPLES = TARGET_RATE * 12;
const MIN_SAMPLES = TARGET_RATE * 1;
const TRANSCRIBE_EVERY_MS = 1500;

// WHISPER_TINY_EN's iOS CoreML .pte 404s on HuggingFace (executorch 0.9.2); pin
// the cross-platform XNNPACK build instead.
const WHISPER_MODEL = {
  ...WHISPER_TINY_EN,
  modelSource: WHISPER_TINY_EN_MODEL_XNNPACK,
};

// transcribe() returns a TranscriptionResult, or sometimes a bare string.
function textOf(result: unknown): string {
  if (typeof result === 'string') return result;
  return (result as { text?: string } | undefined)?.text ?? '';
}

/**
 * Live on-device transcription of a broadcast's audio. Decoded `pcm-f32` chunks
 * are downmixed + resampled to 16 kHz mono, buffered into a rolling window, and
 * transcribed on a timer with react-native-executorch (Whisper downloads on
 * first use). Uses one-shot `transcribe()` over the buffer, not the streaming
 * generator — more predictable, and reflects the last ~12s of audio.
 */
export function TranscriptionPanel({
  broadcast,
}: {
  broadcast: BroadcastInfo;
}) {
  const { colors, radius } = useTheme();
  const [load, setLoad] = useState(false);
  const stt = useSpeechToText({ model: WHISPER_MODEL, preventLoad: !load });
  // `stt` is fresh every render; hold the latest in a ref so the interval can
  // call it without depending on its identity (which would tear it down mid-run).
  const sttRef = useRef(stt);
  sttRef.current = stt;

  const [capturing, setCapturing] = useState(false);
  const [transcript, setTranscript] = useState('');

  const resampler = useRef<ReturnType<typeof createMonoResampler> | null>(null);
  const capturingRef = useRef(false);
  // Rolling 16 kHz mono buffer fed to transcribe().
  const windows = useRef<Float32Array[]>([]);
  const bufferLen = useRef(0);
  const transcribing = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Catalog fallback for chunks that arrive with sampleRate/channels unset (0).
  const catalogTrack = broadcast.audioTracks[0];
  const fallbackRate =
    catalogTrack?.sampleRate && catalogTrack.sampleRate > 0
      ? catalogTrack.sampleRate
      : 48000;
  const fallbackCh =
    catalogTrack?.channelCount && catalogTrack.channelCount > 0
      ? catalogTrack.channelCount
      : 1;

  // Always subscribed; only accumulate into the buffer while capturing.
  useAudioChunks(
    broadcast,
    (chunk) => {
      if (!capturingRef.current || !resampler.current) return;
      const rate = chunk.sampleRate > 0 ? chunk.sampleRate : fallbackRate;
      const ch =
        chunk.channelCount && chunk.channelCount > 0
          ? chunk.channelCount
          : fallbackCh;
      const wave = resampler.current(new Float32Array(chunk.data), ch, rate);
      if (wave.length === 0) return;

      windows.current.push(wave);
      bufferLen.current += wave.length;
      while (bufferLen.current > MAX_SAMPLES && windows.current.length > 1) {
        const dropped = windows.current.shift();
        bufferLen.current -= dropped?.length ?? 0;
      }
    },
    { format: 'pcm-f32' }
  );

  const stop = useCallback(() => {
    if (!capturingRef.current) return;
    capturingRef.current = false;
    setCapturing(false);
  }, []);

  const start = useCallback(() => {
    if (capturingRef.current || !stt.isReady) return;
    resampler.current = createMonoResampler(TARGET_RATE);
    windows.current = [];
    bufferLen.current = 0;
    setTranscript('');
    capturingRef.current = true;
    setCapturing(true);
  }, [stt.isReady]);

  // Transcribe the buffer on a timer while capturing. The guard prevents
  // overlapping calls; depending only on `capturing` keeps the interval alive.
  useEffect(() => {
    if (!capturing) return;
    let cancelled = false;
    const id = setInterval(async () => {
      if (transcribing.current || bufferLen.current < MIN_SAMPLES) return;

      // Snapshot the window synchronously, before any await.
      const snapshot = windows.current.slice();
      const total = snapshot.reduce((s, w) => s + w.length, 0);
      const merged = new Float32Array(total);
      let off = 0;
      for (const w of snapshot) {
        merged.set(w, off);
        off += w.length;
      }

      transcribing.current = true;
      try {
        const result = await sttRef.current.transcribe(merged);
        if (!cancelled && mounted.current) setTranscript(textOf(result));
      } catch {
        // transcribe() can reject mid-teardown; retry next tick.
      } finally {
        transcribing.current = false;
      }
    }, TRANSCRIBE_EVERY_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [capturing]);

  // Stop capturing if the panel unmounts mid-session.
  useEffect(
    () => () => {
      capturingRef.current = false;
    },
    []
  );

  if (stt.error) {
    return (
      <View style={styles.panel}>
        <Text style={[styles.error, { color: colors.destructive }]}>
          Model error: {String(stt.error)}
        </Text>
      </View>
    );
  }

  if (!load) {
    return (
      <View style={styles.panel}>
        <Text style={[styles.muted, { color: colors.secondaryLabel }]}>
          Transcribe this broadcast on-device with Whisper. The model downloads
          once (~tens of MB) and runs locally — no audio leaves the device.
        </Text>
        <Button
          title="Load Whisper model"
          icon="download"
          onPress={() => setLoad(true)}
        />
      </View>
    );
  }

  if (!stt.isReady) {
    return (
      <View style={styles.panel}>
        <Text style={[styles.muted, { color: colors.secondaryLabel }]}>
          Downloading & loading Whisper…{' '}
          {Math.round(stt.downloadProgress * 100)}%
        </Text>
        <View style={[styles.progressTrack, { backgroundColor: colors.fill }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: colors.tint,
                width: `${Math.round(stt.downloadProgress * 100)}%`,
              },
            ]}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <Button
        title={capturing ? 'Stop transcription' : 'Start transcription'}
        icon={capturing ? 'stop' : 'closed-caption'}
        variant={capturing ? 'tonal' : 'filled'}
        onPress={capturing ? stop : start}
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
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 12 },
  muted: { fontSize: 13, lineHeight: 18 },
  error: { fontSize: 13, lineHeight: 18 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: { height: 6 },
  transcriptBox: {
    minHeight: 96,
    padding: 12,
  },
  transcript: { fontSize: 15, lineHeight: 22 },
});
