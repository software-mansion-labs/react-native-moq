package com.moq.camera

import android.content.Context
import android.view.SurfaceHolder
import android.view.SurfaceView
import com.swmansion.moqkit.publish.source.VideoFrameSource

// Previews one stream (front or back) of the shared multi-camera capture,
// selected by the `source` prop.
class MultiCameraPreviewView(context: Context) : SurfaceView(context), SurfaceHolder.Callback {

  var source: String = "front"
    set(value) {
      if (field == value) return
      detachSurface()
      field = value
      attachSurface()
    }

  private val sourcesChangedCallback: () -> Unit = { attachSurface() }

  init {
    holder.addCallback(this)
    MultiCameraModule.addListener(sourcesChangedCallback)
  }

  override fun surfaceCreated(holder: SurfaceHolder) {
    attachSurface()
  }

  override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {}

  override fun surfaceDestroyed(holder: SurfaceHolder) {
    detachSurface()
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    cleanup()
  }

  fun cleanup() {
    MultiCameraModule.removeListener(sourcesChangedCallback)
    detachSurface()
    holder.removeCallback(this)
  }

  private fun currentSource(): VideoFrameSource? =
    if (source == "back") MultiCameraModule.sharedBackSource
    else MultiCameraModule.sharedFrontSource

  private fun attachSurface() {
    val src = currentSource() ?: return
    if (holder.surface.isValid) src.setPreviewSurface(holder.surface)
  }

  private fun detachSurface() {
    currentSource()?.setPreviewSurface(null)
  }
}
