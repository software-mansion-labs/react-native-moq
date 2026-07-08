import { TurboModuleRegistry, type TurboModule } from 'react-native';

// On iOS surfaceHandle is the (uintptr_t)IOSurfaceRef as a decimal string — 64-bit
// handles exceed JS's safe integer range, so they cross as strings. On Android
// there is no JS-importable GPU handle (slots are native bitmaps), so it's '0'.
export type CustomVideoBufferDescriptor = {
  index: number;
  surfaceHandle: string;
  width: number;
  height: number;
};

export interface Spec extends TurboModule {
  // Allocates a pool of `poolSize` buffers (BGRA IOSurfaces on iOS, bitmaps on
  // Android) and resolves with their descriptors. width/height must match the
  // publish-time encoder config.
  create(
    trackId: string,
    width: number,
    height: number,
    poolSize: number
  ): Promise<CustomVideoBufferDescriptor[]>;

  destroy(trackId: string): void;

  // timestampNs <= 0 stamps the device clock at push time; fenceHandle/fenceValue
  // are an MTLSharedEvent handle+value as decimal strings ('' or '0' = no fence).
  // Android always stamps the clock at push time and ignores fences. No-op until
  // the track is published and started.
  pushFrame(
    trackId: string,
    bufferIndex: number,
    timestampNs: number,
    fenceHandle: string,
    fenceValue: string
  ): void;

  // Demo helper: CPU-fills a slot with an animated pattern so the pipeline can be
  // exercised without a GPU renderer.
  fillTestPattern(
    trackId: string,
    bufferIndex: number,
    frameIndex: number
  ): void;
}

// `get`, not `getEnforcing`: on platforms without the module useVideoSource
// degrades to a no-op instead of throwing at import.
export default TurboModuleRegistry.get<Spec>('MoQVideoSource');
