package com.moq

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext

class MoQCameraPreviewViewManager : SimpleViewManager<MoQCameraPreviewView>() {

  companion object {
    const val NAME = "MoQCameraPreviewView"
  }

  override fun getName() = NAME

  override fun createViewInstance(context: ThemedReactContext) = MoQCameraPreviewView(context)

  override fun onDropViewInstance(view: MoQCameraPreviewView) {
    view.cleanup()
    super.onDropViewInstance(view)
  }
}
