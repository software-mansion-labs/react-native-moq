import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import {
  useSpeechToText,
  WHISPER_TINY_EN,
  WHISPER_TINY_EN_MODEL_XNNPACK,
} from 'react-native-executorch';
import { useAudioChunks, type BroadcastInfo } from 'react-native-moq';
import { createMonoResampler } from '../resamplePcm';

const TARGET_RATE = 16000;
// Rolling transcription window: transcribe at most this many seconds of recent
// audio, no sooner than we have a little, on this cadence.
const MAX_SAMPLES = TARGET_RATE * 12;
const MIN_SAMPLES = TARGET_RATE * 1;
const TRANSCRIBE_EVERY_MS = 1500;

// WHISPER_TINY_EN points its iOS modelSource at a CoreML .pte that isn't
// published (404s on HuggingFace as of executorch 0.9.2). Pin the XNNPACK
// build, which exists and runs cross-platform (incl. the simulator).
const WHISPER_MODEL = {
  ...WHISPER_TINY_EN,
  modelSource: WHISPER_TINY_EN_MODEL_XNNPACK,
};

// transcribe() returns a TranscriptionResult; be tolerant of a bare string too.
function textOf(result: unknown): string {
  if (typeof result === 'string') return result;
  return (result as { text?: string } | undefined)?.text ?? '';
}

/**
 * Live on-device transcription of a broadcast's audio — the "decoded → ML" half
 * of the audio-chunks demo. Decoded `pcm-f32` chunks from `useAudioChunks` are
 * downmixed + resampled to the 16 kHz mono waveform Whisper wants, buffered into
 * a rolling window, and transcribed on a timer with react-native-executorch. The
 * Whisper model (~tens of MB) downloads on first use, gated behind a button.
 *
 * Uses the one-shot `transcribe()` over the rolling buffer rather than the
 * streaming generator — far more predictable, and the transcript naturally
 * reflects the last ~12s of audio.
 */
export function TranscriptionPanel({
  broadcast,
}: {
  broadcast: BroadcastInfo;
}) {
  const [load, setLoad] = useState(false);
  const stt = useSpeechToText({ model: WHISPER_MODEL, preventLoad: !load });
  // `stt` is a fresh object every render; hold the latest in a ref so the
  // transcription interval can call it without depending on its identity (which
  // would otherwise tear the interval down mid-inference).
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

  // Catalog values are the fallback if a chunk arrives with sampleRate/channels
  // unset (the decoded path can send 0).
  const catalogTrack = broadcast.audioTracks[0];
  const fallbackRate =
    catalogTrack?.sampleRate && catalogTrack.sampleRate > 0
      ? catalogTrack.sampleRate
      : 48000;
  const fallbackCh =
    catalogTrack?.channelCount && catalogTrack.channelCount > 0
      ? catalogTrack.channelCount
      : 1;

  // Always subscribed (autoStart), like PlaybackPanel; we only accumulate audio
  // into the rolling buffer while capturing.
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

  // Transcribe the rolling buffer on a timer while capturing. transcribe() is a
  // one-shot; the guard keeps calls from overlapping, and depending only on
  // `capturing` keeps the interval alive across the renders inference triggers.
  useEffect(() => {
    if (!capturing) return;
    let cancelled = false;
    const id = setInterval(async () => {
      if (transcribing.current || bufferLen.current < MIN_SAMPLES) return;

      // Atomic snapshot of the current window (sync, no await before it's built).
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
        // transcribe() can reject if the model is mid-teardown — ignore and
        // retry on the next tick.
      } finally {
        transcribing.current = false;
      }
    }, TRANSCRIBE_EVERY_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [capturing]);

  // Stop capturing if the panel unmounts mid-session. The audio subscription is
  // torn down by useAudioChunks' own cleanup.
  useEffect(
    () => () => {
      capturingRef.current = false;
    },
    []
  );

  if (stt.error) {
    return (
      <View style={styles.panel}>
        <Text style={styles.error}>Model error: {String(stt.error)}</Text>
      </View>
    );
  }

  if (!load) {
    return (
      <View style={styles.panel}>
        <Text style={styles.muted}>
          Transcribe this broadcast on-device with Whisper. The model downloads
          once (~tens of MB) and runs locally — no audio leaves the device.
        </Text>
        <Button title="Load Whisper model" onPress={() => setLoad(true)} />
      </View>
    );
  }

  if (!stt.isReady) {
    return (
      <View style={styles.panel}>
        <Text style={styles.muted}>
          Downloading & loading Whisper…{' '}
          {Math.round(stt.downloadProgress * 100)}%
        </Text>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.round(stt.downloadProgress * 100)}%` },
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
        onPress={capturing ? stop : start}
      />
      <View style={styles.transcriptBox}>
        {transcript === '' ? (
          <Text style={styles.muted}>
            {capturing
              ? 'Listening…'
              : 'Press start to caption the live audio.'}
          </Text>
        ) : (
          <Text style={styles.transcript}>{transcript}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 12 },
  muted: { fontSize: 13, color: '#9ca3af', lineHeight: 18 },
  error: { fontSize: 13, color: '#ef4444', lineHeight: 18 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e5e7eb',
    overflow: 'hidden',
  },
  progressFill: { height: 6, backgroundColor: '#2563eb' },
  transcriptBox: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#f9fafb',
  },
  transcript: { fontSize: 15, color: '#111827', lineHeight: 22 },
});
