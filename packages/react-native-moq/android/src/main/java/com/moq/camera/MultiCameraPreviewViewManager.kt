package com.moq.camera

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class MultiCameraPreviewViewManager : SimpleViewManager<MultiCameraPreviewView>() {

  companion object {
    const val NAME = "MoQMultiCameraPreviewView"
  }

  override fun getName() = NAME

  override fun createViewInstance(context: ThemedReactContext) = MultiCameraPreviewView(context)

  @ReactProp(name = "source")
  fun setSource(view: MultiCameraPreviewView, source: String?) {
    view.source = source ?: "front"
  }

  override fun onDropViewInstance(view: MultiCameraPreviewView) {
    view.cleanup()
    super.onDropViewInstance(view)
  }
}
