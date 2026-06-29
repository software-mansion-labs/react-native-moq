package com.moq

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

// Single place for the RCTDeviceEventEmitter plumbing every native module
// repeated. `emit` from a module becomes `reactApplicationContext.emitDeviceEvent(...)`.
fun ReactApplicationContext.emitDeviceEvent(name: String, params: WritableMap) {
  getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
    .emit(name, params)
}

// Convenience for the common single-key `{ state }` event the capture modules
// and the screen-broadcast module all emit.
fun ReactApplicationContext.emitStateEvent(eventName: String, state: String) {
  val map = Arguments.createMap()
  map.putString("state", state)
  emitDeviceEvent(eventName, map)
}
