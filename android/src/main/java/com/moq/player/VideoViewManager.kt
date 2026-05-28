package com.moq.player

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class VideoViewManager : SimpleViewManager<VideoView>() {

  companion object {
    const val NAME = "MoQVideoView"
  }

  override fun getName() = NAME

  override fun createViewInstance(context: ThemedReactContext) = VideoView(context)

  @ReactProp(name = "sessionId")
  fun setSessionId(view: VideoView, sessionId: String?) {
    view.sessionId = sessionId
  }

  @ReactProp(name = "broadcastPath")
  fun setBroadcastPath(view: VideoView, broadcastPath: String?) {
    view.broadcastPath = broadcastPath
  }

  override fun onDropViewInstance(view: VideoView) {
    view.cleanup()
    super.onDropViewInstance(view)
  }
}
