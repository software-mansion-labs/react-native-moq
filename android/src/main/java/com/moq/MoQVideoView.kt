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
    setZOrderOnTop(true)
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
