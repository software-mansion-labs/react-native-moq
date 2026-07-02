package com.moq.player

import android.content.Context
import android.view.Surface
import android.view.SurfaceHolder
import android.view.SurfaceView
import com.moq.MoQModule

class VideoView(context: Context) : SurfaceView(context), SurfaceHolder.Callback {

  var sessionId: String? = null
    set(value) {
      val oldSession = field
      val oldPath = broadcastPath
      field = value
      reregisterListener(oldSession, oldPath)
    }

  var broadcastPath: String? = null
    set(value) {
      val oldSession = sessionId
      val oldPath = field
      field = value
      reregisterListener(oldSession, oldPath)
    }

  private fun reregisterListener(oldSession: String?, oldPath: String?) {
    if (oldSession != null && oldPath != null) {
      MoQModule.removePlayerListener(oldSession, oldPath, playerChangedCallback)
    }
    val s = sessionId
    val p = broadcastPath
    if (s != null && p != null) {
      MoQModule.addPlayerListener(s, p, playerChangedCallback)
      setSurface(holder.surface)
    }
  }

  private val playerChangedCallback: () -> Unit = { setSurface(holder.surface) }

  init {
    // Media-overlay (not on-top) keeps the surface below the window so RN
    // overlays still composite over the video; setZOrderOnTop would hide them.
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
    val s = sessionId ?: return
    val p = broadcastPath ?: return
    MoQModule.playerHandle(s, p)?.setSurface(surface)
  }

  fun cleanup() {
    holder.removeCallback(this)
    val s = sessionId
    val p = broadcastPath
    if (s != null && p != null) {
      MoQModule.removePlayerListener(s, p, playerChangedCallback)
    }
    setSurface(null)
  }
}
