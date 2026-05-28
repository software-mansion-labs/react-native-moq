package com.moq.camera

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext

class CameraPreviewViewManager : SimpleViewManager<CameraPreviewView>() {

  companion object {
    const val NAME = "MoQCameraPreviewView"
  }

  override fun getName() = NAME

  override fun createViewInstance(context: ThemedReactContext) = CameraPreviewView(context)

  override fun onDropViewInstance(view: CameraPreviewView) {
    view.cleanup()
    super.onDropViewInstance(view)
  }
}
