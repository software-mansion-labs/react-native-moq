package com.moq

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

fun ReactApplicationContext.emitDeviceEvent(name: String, params: WritableMap) {
  getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
    .emit(name, params)
}

fun ReactApplicationContext.emitStateEvent(eventName: String, state: String) {
  val map = Arguments.createMap()
  map.putString("state", state)
  emitDeviceEvent(eventName, map)
}
