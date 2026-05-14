package com.moq

import android.content.Context
import android.view.SurfaceHolder
import android.view.SurfaceView

class MoQCameraPreviewView(context: Context) : SurfaceView(context), SurfaceHolder.Callback {

  private var startedPreview = false
  private var pendingFlip = false

  var cameraPosition: String = "front"
    set(value) {
      val old = field
      field = value
      // Skip the initial prop set (it arrives after the view is created).
      // Subsequent changes flip the shared camera.
      if (startedPreview && old != value) {
        MoQPublisherModule.instance?.flipCamera()
      } else if (!startedPreview) {
        pendingFlip = false // initial value is just stored
      }
    }

  private val cameraChangedCallback: () -> Unit = { attachSurface() }

  init {
    holder.addCallback(this)
    MoQPublisherModule.addCameraListener(cameraChangedCallback)
  }

  override fun surfaceCreated(holder: SurfaceHolder) {
    if (!startedPreview) {
      startedPreview = true
      MoQPublisherModule.instance?.startPreview(cameraPosition)
    } else {
      attachSurface()
    }
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
    MoQPublisherModule.removeCameraListener(cameraChangedCallback)
    detachSurface()
    if (startedPreview) {
      startedPreview = false
      MoQPublisherModule.instance?.stopPreview()
    }
    holder.removeCallback(this)
  }

  private fun attachSurface() {
    val cam = MoQPublisherModule.sharedCameraCapture ?: return
    if (holder.surface.isValid) cam.setPreviewSurface(holder.surface)
  }

  private fun detachSurface() {
    MoQPublisherModule.sharedCameraCapture?.setPreviewSurface(null)
  }
}
