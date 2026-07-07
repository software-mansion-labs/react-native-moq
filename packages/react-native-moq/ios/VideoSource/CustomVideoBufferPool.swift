import CoreVideo
import Foundation

/// A fixed pool of BGRA, IOSurface-backed, Metal-compatible `CVPixelBuffer`s the app
/// renders into by index, allocated once for the source's lifetime. Pinning the pool
/// to `poolSize` means no per-frame allocation; round-robining `buffers` so a slot
/// isn't redrawn mid-encode is the caller's job. Modeled on fishjam's pool.
final class CustomVideoBufferPool {
  let width: Int
  let height: Int
  private(set) var buffers: [CVPixelBuffer] = []
  private var pool: CVPixelBufferPool?
  private var disposed = false

  init?(width: Int, height: Int, poolSize: Int) {
    guard width > 0, height > 0, poolSize > 0 else { return nil }
    self.width = width
    self.height = height

    let pixelBufferAttributes: [String: Any] = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
      kCVPixelBufferWidthKey as String: width,
      kCVPixelBufferHeightKey as String: height,
      kCVPixelBufferIOSurfacePropertiesKey as String: [:],
      kCVPixelBufferMetalCompatibilityKey as String: true,
    ]
    let poolAttributes: [String: Any] = [
      kCVPixelBufferPoolMinimumBufferCountKey as String: poolSize
    ]

    var createdPool: CVPixelBufferPool?
    guard
      CVPixelBufferPoolCreate(
        kCFAllocatorDefault, poolAttributes as CFDictionary,
        pixelBufferAttributes as CFDictionary, &createdPool) == kCVReturnSuccess,
      let createdPool
    else { return nil }
    self.pool = createdPool

    var allocated: [CVPixelBuffer] = []
    for _ in 0..<poolSize {
      var pixelBuffer: CVPixelBuffer?
      guard
        CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, createdPool, &pixelBuffer)
          == kCVReturnSuccess,
        let pixelBuffer
      else { return nil }
      allocated.append(pixelBuffer)
    }
    self.buffers = allocated
  }

  /// Per-slot descriptors for JS. The IOSurface handle is the raw
  /// `(uintptr_t)IOSurfaceRef` as a decimal string (64-bit handles exceed JS's safe
  /// integer range); the app's native renderer imports it to draw into the surface.
  func descriptors() -> [[String: Any]] {
    buffers.enumerated().map { index, buffer in
      var handle: UInt = 0
      if let surfacePtr = CVPixelBufferGetIOSurface(buffer)?.toOpaque() {
        handle = UInt(bitPattern: surfacePtr)
      }
      return [
        "index": index,
        "surfaceHandle": String(handle),
        "width": width,
        "height": height,
      ]
    }
  }

  func pixelBuffer(at index: Int) -> CVPixelBuffer? {
    guard index >= 0, index < buffers.count else { return nil }
    return buffers[index]
  }

  /// Demo helper: CPU-fill a slot with animated horizontal BGRA bands so the
  /// pipeline can be exercised without a GPU renderer. `memset` per row is cheap
  /// enough to run on the JS thread.
  func fillTestPattern(at index: Int, frameIndex: Int) {
    guard let buffer = pixelBuffer(at: index) else { return }
    CVPixelBufferLockBaseAddress(buffer, [])
    defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
    guard let base = CVPixelBufferGetBaseAddress(buffer) else { return }
    let bytesPerRow = CVPixelBufferGetBytesPerRow(buffer)
    let w = CVPixelBufferGetWidth(buffer)
    let h = CVPixelBufferGetHeight(buffer)
    let rowBytes = w * 4
    let f = frameIndex
    for y in 0..<h {
      let row = base.advanced(by: y * bytesPerRow)
      // BGRA byte order in memory: B, G, R, A.
      var pattern: [UInt8] = [
        UInt8((y &+ f) & 0xFF),
        UInt8((y &* 2 &+ f) & 0xFF),
        UInt8((y &* 3 &+ f &* 2) & 0xFF),
        255,
      ]
      memset_pattern4(row, &pattern, rowBytes)
    }
  }

  func dispose() {
    guard !disposed else { return }
    disposed = true
    buffers.removeAll()
    pool = nil
  }

  deinit { dispose() }
}
