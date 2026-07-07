import { useCallback, useEffect, useMemo, useState } from 'react';
import NativeMoQVideoSource, {
  type CustomVideoBufferDescriptor,
} from '../native/NativeMoQVideoSource';
import type { VideoCodec, VideoEncoderOptions } from './useCamera';

// Unique id per instance so the native source registry can address it
// independently of the track name (two tracks may share the default "video").
let nextVideoSourceId = 0;

// A GPU fence the app exports after rendering into a slot. On iOS an MTLSharedEvent:
// `handle` is its (uintptr_t) as a decimal string, `signaledValue` the value the GPU
// signals when the render completes. Native waits for it before sampling the buffer.
export interface VideoFrameFence {
  handle: string;
  signaledValue: string;
}

export interface PushVideoFrameArgs {
  // The pool slot (VideoSourceTrack.buffers) this frame was rendered into.
  bufferIndex: number;
  // Omit (recommended): native stamps the device clock at push time, keeping the
  // track aligned with camera/mic. If set, it must be monotonic and advance in real
  // time — a timeline that drifts from the clock renders as a frozen image.
  timestampNs?: number;
  // Omit for CPU-filled frames or when the app already finished its GPU work.
  fence?: VideoFrameFence;
}

export interface VideoSourceOptions {
  name?: string; // Track name in the catalog. Default: 'video'.
  width: number;
  height: number;
  // Slots to round-robin over so one isn't redrawn mid-encode. Default: 3.
  poolSize?: number;
  videoCodec?: VideoCodec;
  framerate?: number;
}

export interface VideoSourceTrack {
  // Internal discriminator: usePublisher routes to addVideoTrack.
  readonly __type: 'videoSource';
  readonly __name: string;
  readonly __id: string;
  readonly encoder: VideoEncoderOptions;
  // Pool slots to render into; populated once the native pool is allocated.
  readonly buffers: CustomVideoBufferDescriptor[];
  // Submit a frame rendered into a pool slot. No-op until published and started.
  pushFrame(frame: PushVideoFrameArgs): void;
  // Demo helper: CPU-fills a slot with an animated pattern so you can exercise the
  // pipeline without a GPU renderer. Real apps render into the surface themselves.
  fillTestPattern(bufferIndex: number, frameIndex: number): void;
}

/**
 * A publishable video track fed by app-rendered frames — the custom-video
 * counterpart of useCamera. The native side allocates a pool of IOSurface-backed
 * buffers (`buffers`); render into slot `i` with your own GPU engine (WebGPU, Skia,
 * Metal…), then `pushFrame({ bufferIndex: i, fence })`. Pixels never cross the
 * bridge — only the slot index and fence do — so publishing is zero-copy.
 *
 * `width` / `height` / `poolSize` are fixed for the source's lifetime; change them
 * by re-mounting the hook (e.g. via a React `key`).
 */
export function useVideoSource(options: VideoSourceOptions): VideoSourceTrack {
  const name = options.name ?? 'video';
  const codec = options.videoCodec ?? 'h264';
  const width = options.width;
  const height = options.height;
  const framerate = options.framerate ?? 30;
  const poolSize = options.poolSize ?? 3;
  const [id] = useState(() => `videoSource-${nextVideoSourceId++}`);
  const [buffers, setBuffers] = useState<CustomVideoBufferDescriptor[]>([]);

  useEffect(() => {
    if (!NativeMoQVideoSource) return;
    const native = NativeMoQVideoSource;
    let cancelled = false;
    native
      .create(id, width, height, poolSize)
      .then((descriptors) => {
        if (!cancelled) setBuffers(descriptors);
      })
      .catch(() => {
        // Allocation failed; buffers stays empty and pushFrame is a no-op.
      });
    return () => {
      cancelled = true;
      setBuffers([]);
      native.destroy(id);
    };
    // Mount-only: width/height/poolSize are baked into the native pool; changing
    // them requires re-mounting the hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const pushFrame = useCallback(
    (frame: PushVideoFrameArgs) => {
      NativeMoQVideoSource?.pushFrame(
        id,
        frame.bufferIndex,
        frame.timestampNs ?? 0,
        frame.fence?.handle ?? '',
        frame.fence?.signaledValue ?? ''
      );
    },
    [id]
  );

  const fillTestPattern = useCallback(
    (bufferIndex: number, frameIndex: number) => {
      NativeMoQVideoSource?.fillTestPattern(id, bufferIndex, frameIndex);
    },
    [id]
  );

  return useMemo<VideoSourceTrack>(
    () => ({
      __type: 'videoSource',
      __name: name,
      __id: id,
      encoder: { codec, width, height, framerate },
      buffers,
      pushFrame,
      fillTestPattern,
    }),
    [
      name,
      id,
      codec,
      width,
      height,
      framerate,
      buffers,
      pushFrame,
      fillTestPattern,
    ]
  );
}
