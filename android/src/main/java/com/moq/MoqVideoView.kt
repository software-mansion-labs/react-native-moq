package com.moq

import android.content.Context
import android.view.Surface
import android.view.SurfaceHolder
import android.view.SurfaceView

class MoqVideoView(context: Context) : SurfaceView(context), SurfaceHolder.Callback {

  init {
    setZOrderOnTop(true)
    holder.addCallback(this)
    MoqModule.onPlayerChanged = { onPlayerChanged() }
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
    MoqModule.currentPlayer?.setSurface(surface)
  }

  fun cleanup() {
    holder.removeCallback(this)
    MoqModule.onPlayerChanged = null
    setSurface(null)
  }

  private fun onPlayerChanged() {
    setSurface(holder.surface)
  }
}
