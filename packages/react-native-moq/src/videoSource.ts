import NativeMoQVideoSource, {
  type CustomVideoBufferDescriptor,
} from './native/NativeMoQVideoSource';
import type { VideoCodec, VideoEncoderOptions } from './camera';

// Unique id per instance so the native source registry can address it
// independently of the track name (two tracks may share the default "video").
let nextVideoSourceId = 0;

// Internal: useVideoSource mints its id up front so it survives StrictMode
// remounts.
export function mintVideoSourceId(): string {
  return `videoSource-${nextVideoSourceId++}`;
}

// A GPU fence the app exports after rendering into a slot. On iOS an MTLSharedEvent:
// `handle` is its (uintptr_t) as a decimal string, `signaledValue` the value the GPU
// signals when the render completes. Native waits for it before sampling the buffer.
// Ignored on Android.
export interface VideoFrameFence {
  handle: string;
  signaledValue: string;
}

export interface PushVideoFrameArgs {
  // The pool slot (VideoSourceTrack.buffers) this frame was rendered into.
  bufferIndex: number;
  // Omit (recommended): native stamps the device clock at push time, keeping the
  // track aligned with camera/mic. If set (iOS only; Android always stamps at push
  // time), it must be monotonic and advance in real time — a timeline that drifts
  // from the clock renders as a frozen image.
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
  // Internal discriminator: the publisher routes to addVideoTrack.
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

/** Hook-free video source; `destroy()` releases the native buffer pool. */
export interface VideoSourceHandle extends VideoSourceTrack {
  // Resolves with the pool descriptors once native allocation completes
  // ([] if allocation failed or the platform has no video-source module).
  readonly ready: Promise<CustomVideoBufferDescriptor[]>;
  destroy(): void;
}

// Internal: shared by the factory and useVideoSource.
export function pushVideoFrame(id: string, frame: PushVideoFrameArgs): void {
  NativeMoQVideoSource?.pushFrame(
    id,
    frame.bufferIndex,
    frame.timestampNs ?? 0,
    frame.fence?.handle ?? '',
    frame.fence?.signaledValue ?? ''
  );
}

// Internal: shared by the factory and useVideoSource.
export function fillVideoTestPattern(
  id: string,
  bufferIndex: number,
  frameIndex: number
): void {
  NativeMoQVideoSource?.fillTestPattern(id, bufferIndex, frameIndex);
}

/**
 * Imperative counterpart of `useVideoSource` for non-React code: a publishable
 * video track fed by app-rendered frames. Owns a native buffer pool until
 * `destroy()`; `buffers` is empty until `ready` resolves. See useVideoSource
 * for the rendering model (IOSurface pool, fences, zero-copy).
 *
 * `width` / `height` / `poolSize` are fixed for the source's lifetime.
 */
export function createVideoSource(
  options: VideoSourceOptions
): VideoSourceHandle {
  return createVideoSourceWithId(mintVideoSourceId(), options);
}

// Internal: useVideoSource supplies its pre-minted id.
export function createVideoSourceWithId(
  id: string,
  options: VideoSourceOptions
): VideoSourceHandle {
  const name = options.name ?? 'video';
  const codec = options.videoCodec ?? 'h264';
  const width = options.width;
  const height = options.height;
  const framerate = options.framerate ?? 30;
  const poolSize = options.poolSize ?? 3;

  let buffers: CustomVideoBufferDescriptor[] = [];
  let destroyed = false;

  const ready: Promise<CustomVideoBufferDescriptor[]> = NativeMoQVideoSource
    ? NativeMoQVideoSource.create(id, width, height, poolSize)
        .then((descriptors) => {
          if (!destroyed) buffers = descriptors;
          return buffers;
        })
        // Allocation failed; buffers stays empty and pushFrame is a no-op.
        .catch(() => [] as CustomVideoBufferDescriptor[])
    : Promise.resolve([]);

  return {
    __type: 'videoSource',
    __name: name,
    __id: id,
    encoder: { codec, width, height, framerate },
    get buffers() {
      return buffers;
    },
    ready,
    pushFrame: (frame) => pushVideoFrame(id, frame),
    fillTestPattern: (bufferIndex, frameIndex) =>
      fillVideoTestPattern(id, bufferIndex, frameIndex),
    destroy() {
      destroyed = true;
      buffers = [];
      NativeMoQVideoSource?.destroy(id);
    },
  };
}
