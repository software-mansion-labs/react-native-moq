package com.moq

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager

class MoQPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
    return if (name == MoQModule.NAME) MoQModule(reactContext) else null
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
      )
    )
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return listOf(MoQVideoViewManager())
  }
}
