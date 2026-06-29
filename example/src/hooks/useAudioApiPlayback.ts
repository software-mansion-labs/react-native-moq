import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioContext,
  AudioManager,
  type AudioBufferQueueSourceNode,
} from 'react-native-audio-api';
import type { AudioChunk } from 'react-native-moq';

/**
 * Plays decoded-PCM audio chunks through react-native-audio-api.
 *
 * The decoded (`pcm-f32`) chunks `useAudioChunks` hands us are already raw,
 * interleaved Float32 samples — exactly what the Web Audio graph wants. We open
 * one `AudioContext`, hang a single `AudioBufferQueueSourceNode` off its
 * destination, and feed every chunk straight in: each chunk becomes an
 * `AudioBuffer` that we de-interleave into the queue. The queue node handles
 * gapless scheduling for us, so this hook stays tiny.
 *
 * This is the "decoded" half of the audio-chunks demo; the encoded path can't be
 * played without a decoder and is only inspected.
 */
export function useAudioApiPlayback() {
  const ctxRef = useRef<AudioContext | null>(null);
  const queueRef = useRef<AudioBufferQueueSourceNode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const start = useCallback(() => {
    if (ctxRef.current) return;
    // Route to the speaker/playback session so the audio is audible even with
    // the ringer switch off (iOS).
    AudioManager.setAudioSessionOptions({
      iosCategory: 'playback',
      iosMode: 'default',
    });
    AudioManager.setAudioSessionActivity(true);

    const ctx = new AudioContext();
    const queue = ctx.createBufferQueueSource();
    queue.connect(ctx.destination);
    // Pass offset 0 explicitly: react-native-audio-api 0.12.2's queue-source
    // `start()` defaults offset to its -1 "no offset" sentinel but then rejects
    // it (`if (offset && offset < 0) throw`), so the bare `start()` always
    // throws "offset must be a finite non-negative number: -1". 0 is falsy, so
    // it skips that guard and starts from the beginning.
    queue.start(0, 0);

    ctxRef.current = ctx;
    queueRef.current = queue;
    setIsPlaying(true);
  }, []);

  const stop = useCallback(() => {
    queueRef.current?.stop();
    queueRef.current = null;
    ctxRef.current?.close();
    ctxRef.current = null;
    setIsPlaying(false);
  }, []);

  // Feed one decoded chunk into the playback queue. No-op until `start()` runs,
  // so callers can pipe every chunk through unconditionally.
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

  // Tear the context down if the component unmounts mid-playback.
  useEffect(() => () => stop(), [stop]);

  return { isPlaying, start, stop, enqueue };
}
