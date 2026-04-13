package com.moq

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext

class MoqVideoViewManager : SimpleViewManager<MoqVideoView>() {

  companion object {
    const val NAME = "MoQVideoView"
  }

  override fun getName() = NAME

  override fun createViewInstance(context: ThemedReactContext) = MoqVideoView(context)
}
