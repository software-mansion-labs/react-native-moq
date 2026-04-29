package com.moq

import android.content.Context
import android.view.Surface
import android.view.SurfaceHolder
import android.view.SurfaceView

class MoQVideoView(context: Context) : SurfaceView(context), SurfaceHolder.Callback {

  var playerId: Int = 0
    set(value) {
      val old = field
      field = value
      if (old != 0) {
        MoQModule.removePlayerListener(old, playerChangedCallback)
      }
      if (value != 0) {
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
    if (playerId != 0) MoQModule.playerHandlesById[playerId]?.setSurface(surface)
  }

  fun cleanup() {
    holder.removeCallback(this)
    if (playerId != 0) MoQModule.removePlayerListener(playerId, playerChangedCallback)
    setSurface(null)
  }
}
