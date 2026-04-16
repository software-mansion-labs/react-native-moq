package com.moq

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class MoqVideoViewManager : SimpleViewManager<MoqVideoView>() {

  companion object {
    const val NAME = "MoQVideoView"
  }

  override fun getName() = NAME

  override fun createViewInstance(context: ThemedReactContext) = MoqVideoView(context)

  @ReactProp(name = "broadcastPath")
  fun setBroadcastPath(view: MoqVideoView, broadcastPath: String?) {
    view.broadcastPath = broadcastPath
  }

  override fun onDropViewInstance(view: MoqVideoView) {
    view.cleanup()
    super.onDropViewInstance(view)
  }
}
