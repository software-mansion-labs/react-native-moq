package com.moq

import com.facebook.react.bridge.ReactApplicationContext

class MoqModule(reactContext: ReactApplicationContext) :
  NativeMoqSpec(reactContext) {

  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }

  companion object {
    const val NAME = NativeMoqSpec.NAME
  }
}
