package com.moq

import android.content.Context
import android.graphics.SurfaceTexture
import android.graphics.drawable.Drawable
import android.os.Handler
import android.os.Looper
import android.view.Surface
import android.view.TextureView

class MoqVideoView(context: Context) : TextureView(context), TextureView.SurfaceTextureListener {

  private var surface: Surface? = null
  private val mainHandler = Handler(Looper.getMainLooper())

  init {
    surfaceTextureListener = this
    MoqModule.onPlayerChanged = { mainHandler.post { onPlayerChanged() } }
  }

  override fun onSurfaceTextureAvailable(st: SurfaceTexture, width: Int, height: Int) {
    val s = Surface(st)
    surface = s
    MoqModule.currentSurface = s
    MoqModule.currentPlayer?.setSurface(s)
  }

  override fun onSurfaceTextureSizeChanged(st: SurfaceTexture, width: Int, height: Int) {}

  override fun onSurfaceTextureDestroyed(st: SurfaceTexture): Boolean {
    MoqModule.currentPlayer?.setSurface(null)
    MoqModule.currentSurface = null
    surface?.release()
    surface = null
    return true
  }

  override fun onSurfaceTextureUpdated(st: SurfaceTexture) {}

  // TextureView does not support background drawables; suppress the crash
  // that React Native triggers when it sets backgroundColor on native views.
  override fun setBackground(background: Drawable?) {}
  @Suppress("OVERRIDE_DEPRECATION")
  override fun setBackgroundDrawable(background: Drawable?) {}

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    MoqModule.onPlayerChanged = null
    MoqModule.currentPlayer?.setSurface(null)
    MoqModule.currentSurface = null
    surface?.release()
    surface = null
  }

  private fun onPlayerChanged() {
    val s = surface ?: return
    MoqModule.currentPlayer?.setSurface(s)
  }
}
