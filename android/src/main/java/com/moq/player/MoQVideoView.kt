package com.moq.player

import android.content.Context
import android.view.Surface
import android.view.SurfaceHolder
import android.view.SurfaceView
import com.moq.MoQModule

class MoQVideoView(context: Context) : SurfaceView(context), SurfaceHolder.Callback {

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
