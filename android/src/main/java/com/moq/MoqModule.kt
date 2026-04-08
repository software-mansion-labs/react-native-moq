package com.moq

import com.facebook.react.bridge.ReactApplicationContext
import com.swmansion.moqkit.MoQSession

class MoqModule(reactContext: ReactApplicationContext) :
  NativeMoqSpec(reactContext) {

  override fun getSessionState(): String {
    return currentState.toStringValue()
  }

  override fun setSessionState(state: String?) {
    currentState = state.toSessionState()
  }

  companion object {
    const val NAME = NativeMoqSpec.NAME

    private var currentState: MoQSession.State = MoQSession.State.Idle

    private fun MoQSession.State.toStringValue(): String = when (this) {
      is MoQSession.State.Idle -> "idle"
      is MoQSession.State.Connecting -> "connecting"
      is MoQSession.State.Connected -> "connected"
      is MoQSession.State.Closed -> "closed"
      is MoQSession.State.Error -> "error:${this.message}"
    }

    private fun String?.toSessionState(): MoQSession.State {
      if (this != null && startsWith("error:")) {
        return MoQSession.State.Error(removePrefix("error:"))
      }
      return when (this) {
        "connecting" -> MoQSession.State.Connecting
        "connected" -> MoQSession.State.Connected
        "closed" -> MoQSession.State.Closed
        else -> MoQSession.State.Idle
      }
    }
  }
}
