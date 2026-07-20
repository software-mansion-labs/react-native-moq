import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioContext,
  AudioManager,
  type AudioBufferQueueSourceNode,
} from 'react-native-audio-api';
import type { AudioChunk } from 'react-native-moq';

/**
 * Plays decoded-PCM (`pcm-f32`) audio chunks through react-native-audio-api. One
 * `AudioContext` with a single `AudioBufferQueueSourceNode`; each chunk is
 * de-interleaved into an `AudioBuffer` and enqueued for gapless scheduling.
 */
export function useAudioApiPlayback() {
  const ctxRef = useRef<AudioContext | null>(null);
  const queueRef = useRef<AudioBufferQueueSourceNode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const start = useCallback(() => {
    if (ctxRef.current) return;
    // Mirror MicrophoneImpl.configurePublishingAudioSession exactly: with the
    // same category/mode/options react-native-audio-api skips setCategory when
    // the mic is capturing (changing the category then fails with
    // insufficientPriority) and playback shares the session with a live mic.
    // playAndRecord also ignores the ringer switch, like playback.
    // No explicit setAudioSessionActivity: the engine activates the session on
    // start, and a second concurrent activation can reject (SessionActivationError).
    AudioManager.setAudioSessionOptions({
      iosCategory: 'playAndRecord',
      iosMode: 'videoRecording',
      iosOptions: ['defaultToSpeaker', 'allowBluetoothHFP'],
    });

    const ctx = new AudioContext();
    const queue = ctx.createBufferQueueSource();
    queue.connect(ctx.destination);
    // Pass offset 0 explicitly: react-native-audio-api 0.12.2's queue-source
    // `start()` defaults offset to -1 then rejects it, so bare `start()` throws.
    queue.start(0, 0);

    ctxRef.current = ctx;
    queueRef.current = queue;
    setIsPlaying(true);
  }, []);

  const stop = useCallback(() => {
    queueRef.current?.stop();
    queueRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    setIsPlaying(false);
  }, []);

  // Feed one decoded chunk into the queue; no-op until `start()` runs.
  const enqueue = useCallback((chunk: AudioChunk) => {
    const ctx = ctxRef.current;
    const queue = queueRef.current;
    if (!ctx || !queue) return;

    const channels = chunk.channelCount ?? 1;
    const frames = chunk.frameCount ?? 0;
    if (frames === 0) return;

    const interleaved = new Float32Array(chunk.data);
    const buffer = ctx.createBuffer(
      channels,
      frames,
      chunk.sampleRate || ctx.sampleRate
    );
    for (let ch = 0; ch < channels; ch++) {
      const planar = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        planar[i] = interleaved[i * channels + ch] ?? 0;
      }
      buffer.copyToChannel(planar, ch);
    }
    queue.enqueueBuffer(buffer);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { isPlaying, start, stop, enqueue };
}
