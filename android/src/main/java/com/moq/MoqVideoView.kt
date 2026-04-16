package com.moq

import android.content.Context
import android.view.Surface
import android.view.SurfaceHolder
import android.view.SurfaceView

class MoqVideoView(context: Context) : SurfaceView(context), SurfaceHolder.Callback {

  var broadcastPath: String? = null
    set(value) {
      val old = field
      field = value
      if (old != null) {
        MoqModule.removePlayerListener(old, playerChangedCallback)
      }
      if (value != null) {
        MoqModule.addPlayerListener(value, playerChangedCallback)
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
    broadcastPath?.let { path -> MoqModule.players[path]?.setSurface(surface) }
  }

  fun cleanup() {
    holder.removeCallback(this)
    broadcastPath?.let { path -> MoqModule.removePlayerListener(path, playerChangedCallback) }
    setSurface(null)
  }
}
