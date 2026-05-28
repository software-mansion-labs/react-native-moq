package com.moq.camera

import android.content.Context
import android.view.SurfaceHolder
import android.view.SurfaceView

class CameraPreviewView(context: Context) : SurfaceView(context), SurfaceHolder.Callback {

  private val cameraChangedCallback: () -> Unit = { attachSurface() }

  init {
    holder.addCallback(this)
    CameraModule.addCameraListener(cameraChangedCallback)
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
    CameraModule.removeCameraListener(cameraChangedCallback)
    detachSurface()
    holder.removeCallback(this)
  }

  private fun attachSurface() {
    val cam = CameraModule.sharedCameraCapture ?: return
    if (holder.surface.isValid) cam.setPreviewSurface(holder.surface)
  }

  private fun detachSurface() {
    CameraModule.sharedCameraCapture?.setPreviewSurface(null)
  }
}
