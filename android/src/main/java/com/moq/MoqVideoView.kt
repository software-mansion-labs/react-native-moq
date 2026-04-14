package com.moq

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.view.Surface
import android.view.SurfaceHolder
import android.view.SurfaceView

class MoqVideoView(context: Context) : SurfaceView(context), SurfaceHolder.Callback {

  private var surface: Surface? = null
  private val mainHandler = Handler(Looper.getMainLooper())

  init {
    setZOrderOnTop(true)
    holder.addCallback(this)
    MoqModule.onPlayerChanged = { mainHandler.post { onPlayerChanged() } }
  }

  override fun surfaceCreated(holder: SurfaceHolder) {
    val s = holder.surface
    surface = s
    MoqModule.currentSurface = s
    MoqModule.currentPlayer?.setSurface(s)
  }

  override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {}

  override fun surfaceDestroyed(holder: SurfaceHolder) {
    MoqModule.currentPlayer?.setSurface(null)
    MoqModule.currentSurface = null
    surface = null
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    cleanup()
  }

  fun cleanup() {
    holder.removeCallback(this)
    MoqModule.onPlayerChanged = null
    MoqModule.currentPlayer?.setSurface(null)
    MoqModule.currentSurface = null
    surface = null
  }

  private fun onPlayerChanged() {
    val s = surface ?: return
    MoqModule.currentPlayer?.setSurface(s)
  }
}
