package com.moq

import android.content.Context
import android.view.Surface
import android.view.SurfaceHolder
import android.view.SurfaceView

class MoQVideoView(context: Context) : SurfaceView(context), SurfaceHolder.Callback {

  var broadcastPath: String? = null
    set(value) {
      val old = field
      field = value
      if (old != null) {
        MoQModule.removePlayerListener(old, playerChangedCallback)
      }
      if (value != null) {
        MoQModule.addPlayerListener(value, playerChangedCallback)
        setSurface(holder.surface)
      }
    }

  private val playerChangedCallback: () -> Unit = { setSurface(holder.surface) }

  init {
    // Keep the surface BELOW the window so RN-side overlays drawn in the
    // view hierarchy (close button, play/pause, captions, etc.) actually
    // composite on top of the video. `setZOrderOnTop(true)` would put the
    // surface above the entire window and hide anything React Native draws
    // over it. `setZOrderMediaOverlay(true)` keeps us above any other
    // sibling surfaces (e.g. a camera preview) without going above the
    // window. The window is hole-punched at this view's bounds so the
    // surface is still visible through the RN view tree.
    setZOrderMediaOverlay(true)
    holder.addCallback(this)
  }

  override fun surfaceCreated(holder: SurfaceHolder) {
    setSurface(holder.surface)
  }

  override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {}

  override fun surfaceDestroyed(holder: SurfaceHolder) {
    setSurface(null)
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    cleanup()
  }

  fun setSurface(surface: Surface?) {
    broadcastPath?.let { path -> MoQModule.playerHandles[path]?.setSurface(surface) }
  }

  fun cleanup() {
    holder.removeCallback(this)
    broadcastPath?.let { path -> MoQModule.removePlayerListener(path, playerChangedCallback) }
    setSurface(null)
  }
}
