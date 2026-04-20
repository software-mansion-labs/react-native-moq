package com.moq

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class MoQVideoViewManager : SimpleViewManager<MoQVideoView>() {

  companion object {
    const val NAME = "MoQVideoView"
  }

  override fun getName() = NAME

  override fun createViewInstance(context: ThemedReactContext) = MoQVideoView(context)

  @ReactProp(name = "broadcastPath")
  fun setBroadcastPath(view: MoQVideoView, broadcastPath: String?) {
    view.broadcastPath = broadcastPath
  }

  override fun onDropViewInstance(view: MoQVideoView) {
    view.cleanup()
    super.onDropViewInstance(view)
  }
}
