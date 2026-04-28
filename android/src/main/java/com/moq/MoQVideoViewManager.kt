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

  @ReactProp(name = "player")
  fun setPlayer(view: MoQVideoView, handleId: Int) {
    view.playerHandle = if (handleId > 0) handleId else null
  }

  override fun onDropViewInstance(view: MoQVideoView) {
    view.playerHandle = null
    super.onDropViewInstance(view)
  }
}
