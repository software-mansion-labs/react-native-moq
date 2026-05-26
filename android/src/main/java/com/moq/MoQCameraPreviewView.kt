package com.moq

import android.content.Context
import android.view.SurfaceHolder
import android.view.SurfaceView

class MoQCameraPreviewView(context: Context) : SurfaceView(context), SurfaceHolder.Callback {

  private val cameraChangedCallback: () -> Unit = { attachSurface() }

  init {
    holder.addCallback(this)
    MoQCameraModule.addCameraListener(cameraChangedCallback)
  }

  override fun surfaceCreated(holder: SurfaceHolder) {
    attachSurface()
  }

  override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {}

  override fun surfaceDestroyed(holder: SurfaceHolder) {
    detachSurface()
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    cleanup()
  }

  fun cleanup() {
    MoQCameraModule.removeCameraListener(cameraChangedCallback)
    detachSurface()
    holder.removeCallback(this)
  }

  private fun attachSurface() {
    val cam = MoQCameraModule.sharedCameraCapture ?: return
    if (holder.surface.isValid) cam.setPreviewSurface(holder.surface)
  }

  private fun detachSurface() {
    MoQCameraModule.sharedCameraCapture?.setPreviewSurface(null)
  }
}
