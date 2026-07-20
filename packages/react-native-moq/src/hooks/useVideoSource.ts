import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CustomVideoBufferDescriptor } from '../native/NativeMoQVideoSource';
import {
  createVideoSourceWithId,
  fillVideoTestPattern,
  mintVideoSourceId,
  pushVideoFrame,
  resolveVideoSourceOptions,
  type PushVideoFrameArgs,
  type VideoSourceOptions,
  type VideoSourceTrack,
} from '../videoSource';

export type {
  PushVideoFrameArgs,
  VideoFrameFence,
  VideoSourceOptions,
  VideoSourceTrack,
} from '../videoSource';

/**
 * A publishable video track fed by app-rendered frames — the custom-video
 * counterpart of useCamera. On iOS the native side allocates a pool of
 * IOSurface-backed buffers (`buffers`); render into slot `i` with your own GPU
 * engine (WebGPU, Skia, Metal…), then `pushFrame({ bufferIndex: i, fence })`.
 * Pixels never cross the bridge — only the slot index and fence do — so publishing
 * is zero-copy. On Android the slots are native bitmaps with no JS-importable
 * handle yet, so only natively-filled frames (e.g. fillTestPattern) can be pushed.
 *
 * `width` / `height` / `poolSize` are fixed for the source's lifetime; change them
 * by re-mounting the hook (e.g. via a React `key`).
 */
export function useVideoSource(options: VideoSourceOptions): VideoSourceTrack {
  const { name, poolSize, encoder } = resolveVideoSourceOptions(options);
  const { codec, width, height, framerate } = encoder;
  const [id] = useState(() => mintVideoSourceId());
  const [buffers, setBuffers] = useState<CustomVideoBufferDescriptor[]>([]);

  useEffect(() => {
    const source = createVideoSourceWithId(id, { width, height, poolSize });
    let cancelled = false;
    source.ready.then((descriptors) => {
      if (!cancelled) setBuffers(descriptors);
    });
    return () => {
      cancelled = true;
      setBuffers([]);
      source.destroy();
    };
    // Mount-only: width/height/poolSize are baked into the native pool; changing
    // them requires re-mounting the hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const pushFrame = useCallback(
    (frame: PushVideoFrameArgs) => pushVideoFrame(id, frame),
    [id]
  );

  const fillTestPattern = useCallback(
    (bufferIndex: number, frameIndex: number) =>
      fillVideoTestPattern(id, bufferIndex, frameIndex),
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
