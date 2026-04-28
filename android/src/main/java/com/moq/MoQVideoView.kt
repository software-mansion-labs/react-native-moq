package com.moq

import android.content.Context
import android.view.Surface
import android.view.SurfaceHolder
import android.view.SurfaceView

class MoQVideoView(context: Context) : SurfaceView(context), SurfaceHolder.Callback {

  var playerHandle: Int? = null
    set(value) {
      // Detach the old player's surface before switching.
      field?.let { MoQModule.players[it]?.setSurface(null) }
      field = value
      value?.let { MoQModule.players[it]?.setSurface(holder.surface) }
    }

  init {
    setZOrderOnTop(true)
    holder.addCallback(this)
  }

  override fun surfaceCreated(holder: SurfaceHolder) {
    playerHandle?.let { MoQModule.players[it]?.setSurface(holder.surface) }
  }

  override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {}

  override fun surfaceDestroyed(holder: SurfaceHolder) {
    playerHandle?.let { MoQModule.players[it]?.setSurface(null) }
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    holder.removeCallback(this)
    playerHandle?.let { MoQModule.players[it]?.setSurface(null) }
  }
}
