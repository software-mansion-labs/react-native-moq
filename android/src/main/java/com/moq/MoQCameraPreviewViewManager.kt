package com.moq

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class MoQCameraPreviewViewManager : SimpleViewManager<MoQCameraPreviewView>() {

  companion object {
    const val NAME = "MoQCameraPreviewView"
  }

  override fun getName() = NAME

  override fun createViewInstance(context: ThemedReactContext) = MoQCameraPreviewView(context)

  @ReactProp(name = "cameraPosition")
  fun setCameraPosition(view: MoQCameraPreviewView, position: String?) {
    view.cameraPosition = position ?: "front"
  }

  override fun onDropViewInstance(view: MoQCameraPreviewView) {
    view.cleanup()
    super.onDropViewInstance(view)
  }
}
