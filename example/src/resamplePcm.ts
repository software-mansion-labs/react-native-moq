/**
 * Streaming PCM → 16 kHz mono resampler for Whisper. Downmixes to mono and
 * linearly resamples, carrying a fractional read cursor + the previous chunk's
 * final sample across calls so back-to-back chunks resample as one continuous
 * stream (no clicks or drift). Good enough for STT; not hi-fi.
 */
export function createMonoResampler(targetRate = 16000) {
  let nextPos = 0; // next output position, in this chunk's sample coordinates
  let lastSample = 0; // previous chunk's final sample (virtual index -1)
  let primed = false;

  return (
    interleaved: Float32Array,
    channels: number,
    sourceRate: number
  ): Float32Array => {
    const frames = Math.floor(interleaved.length / Math.max(1, channels));
    if (frames === 0 || sourceRate <= 0) return new Float32Array(0);

    const mono = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      let sum = 0;
      for (let c = 0; c < channels; c++) {
        sum += interleaved[i * channels + c] ?? 0;
      }
      mono[i] = sum / channels;
    }

    // Virtual sample access: index -1 is the previous chunk's tail; indices past
    // the end clamp to the last sample (only ever hit with a zero weight).
    const at = (idx: number): number => {
      if (idx < 0) return primed ? lastSample : (mono[0] ?? 0);
      if (idx >= frames) return mono[frames - 1] ?? 0;
      return mono[idx] ?? 0;
    };

    const ratio = sourceRate / targetRate; // input samples per output sample
    const out: number[] = [];
    let pos = nextPos;
    while (pos <= frames - 1) {
      const i0 = Math.floor(pos);
      const frac = pos - i0;
      out.push(at(i0) + (at(i0 + 1) - at(i0)) * frac);
      pos += ratio;
    }

    // Carry the leftover into the next chunk's coordinate space (shift by frames).
    nextPos = pos - frames;
    lastSample = mono[frames - 1] ?? lastSample;
    primed = true;

    return Float32Array.from(out);
  };
}
