package com.moq

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager
import com.moq.camera.CameraModule
import com.moq.camera.CameraPreviewViewManager
import com.moq.camera.MultiCameraModule
import com.moq.camera.MultiCameraPreviewViewManager
import com.moq.datatrack.DataTrackModule
import com.moq.microphone.MicrophoneModule
import com.moq.player.VideoViewManager
import com.moq.publisher.PublisherModule
import com.moq.screenbroadcast.ScreenBroadcastModule

class MoQPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
    return when (name) {
      MoQModule.NAME -> MoQModule(reactContext)
      PublisherModule.NAME -> PublisherModule(reactContext)
      DataTrackModule.NAME -> DataTrackModule(reactContext)
      CameraModule.NAME -> CameraModule(reactContext)
      MultiCameraModule.NAME -> MultiCameraModule(reactContext)
      MicrophoneModule.NAME -> MicrophoneModule(reactContext)
      ScreenBroadcastModule.NAME -> ScreenBroadcastModule(reactContext)
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
      PublisherModule.NAME to ReactModuleInfo(
        name = PublisherModule.NAME,
        className = PublisherModule.NAME,
        canOverrideExistingModule = false,
        needsEagerInit = false,
        isCxxModule = false,
        isTurboModule = true,
      ),
      DataTrackModule.NAME to ReactModuleInfo(
        name = DataTrackModule.NAME,
        className = DataTrackModule.NAME,
        canOverrideExistingModule = false,
        needsEagerInit = false,
        isCxxModule = false,
        isTurboModule = true,
      ),
      CameraModule.NAME to ReactModuleInfo(
        name = CameraModule.NAME,
        className = CameraModule.NAME,
        canOverrideExistingModule = false,
        needsEagerInit = false,
        isCxxModule = false,
        isTurboModule = true,
      ),
      MultiCameraModule.NAME to ReactModuleInfo(
        name = MultiCameraModule.NAME,
        className = MultiCameraModule.NAME,
        canOverrideExistingModule = false,
        needsEagerInit = false,
        isCxxModule = false,
        isTurboModule = true,
      ),
      MicrophoneModule.NAME to ReactModuleInfo(
        name = MicrophoneModule.NAME,
        className = MicrophoneModule.NAME,
        canOverrideExistingModule = false,
        needsEagerInit = false,
        isCxxModule = false,
        isTurboModule = true,
      ),
      ScreenBroadcastModule.NAME to ReactModuleInfo(
        name = ScreenBroadcastModule.NAME,
        className = ScreenBroadcastModule.NAME,
        canOverrideExistingModule = false,
        needsEagerInit = false,
        isCxxModule = false,
        isTurboModule = true,
      )
    )
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return listOf(
      VideoViewManager(),
      CameraPreviewViewManager(),
      MultiCameraPreviewViewManager(),
    )
  }
}
