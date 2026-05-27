package com.moq

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager

class MoQPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
    return when (name) {
      MoQModule.NAME -> MoQModule(reactContext)
      MoQPublisherModule.NAME -> MoQPublisherModule(reactContext)
      MoQCameraModule.NAME -> MoQCameraModule(reactContext)
      MoQMicrophoneModule.NAME -> MoQMicrophoneModule(reactContext)
      MoQScreenBroadcastModule.NAME -> MoQScreenBroadcastModule(reactContext)
      else -> null
    }
  }

  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    mapOf(
      MoQModule.NAME to ReactModuleInfo(
        name = MoQModule.NAME,
        className = MoQModule.NAME,
        canOverrideExistingModule = false,
        needsEagerInit = false,
        isCxxModule = false,
        isTurboModule = true,
      ),
      MoQPublisherModule.NAME to ReactModuleInfo(
        name = MoQPublisherModule.NAME,
        className = MoQPublisherModule.NAME,
        canOverrideExistingModule = false,
        needsEagerInit = false,
        isCxxModule = false,
        isTurboModule = true,
      ),
      MoQCameraModule.NAME to ReactModuleInfo(
        name = MoQCameraModule.NAME,
        className = MoQCameraModule.NAME,
        canOverrideExistingModule = false,
        needsEagerInit = false,
        isCxxModule = false,
        isTurboModule = true,
      ),
      MoQMicrophoneModule.NAME to ReactModuleInfo(
        name = MoQMicrophoneModule.NAME,
        className = MoQMicrophoneModule.NAME,
        canOverrideExistingModule = false,
        needsEagerInit = false,
        isCxxModule = false,
        isTurboModule = true,
      ),
      MoQScreenBroadcastModule.NAME to ReactModuleInfo(
        name = MoQScreenBroadcastModule.NAME,
        className = MoQScreenBroadcastModule.NAME,
        canOverrideExistingModule = false,
        needsEagerInit = false,
        isCxxModule = false,
        isTurboModule = true,
      )
    )
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return listOf(MoQVideoViewManager(), MoQCameraPreviewViewManager())
  }
}
