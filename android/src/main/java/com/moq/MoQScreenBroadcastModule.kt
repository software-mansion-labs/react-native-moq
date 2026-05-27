package com.moq

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Build
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

// Out-of-process screen broadcasting on Android. configureScreenBroadcast
// caches the relay URL + options; startScreenBroadcast launches the system
// MediaProjection consent flow and, on approval, starts MoQScreenBroadcastService
// in the foreground. The service opens its own MoQ session — it does not
// reuse any host-side publisher session.
class MoQScreenBroadcastModule(reactContext: ReactApplicationContext) :
  NativeMoQScreenBroadcastSpec(reactContext), ActivityEventListener {

  init {
    reactContext.addActivityEventListener(this)
  }

  private var configuredUrl: String? = null
  private var configuredOptsJson: String? = null
  private var pendingPromise: Promise? = null
  private val requestCode = 0xC051

  private val stateListener: (String) -> Unit = { state ->
    val map = Arguments.createMap()
    map.putString("state", state)
    emit("screenBroadcastStateChanged", map)
  }

  companion object {
    const val NAME = NativeMoQScreenBroadcastSpec.NAME
  }

  override fun addListener(eventName: String) {}
  override fun removeListeners(count: Double) {}

  override fun configureScreenBroadcast(url: String, optsJson: String) {
    configuredUrl = url
    configuredOptsJson = optsJson
  }

  override fun startScreenBroadcast(promise: Promise) {
    val url = configuredUrl
    val opts = configuredOptsJson
    if (url.isNullOrEmpty() || opts == null) {
      promise.reject(
        "not_configured", "configureScreenBroadcast must be called before startScreenBroadcast"
      )
      return
    }
    val activity = currentActivity ?: run {
      promise.reject("no_activity", "No foreground activity available to request screen capture")
      return
    }
    if (pendingPromise != null) {
      promise.reject("in_progress", "A screen broadcast request is already in flight")
      return
    }
    pendingPromise = promise
    val mpm = activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE)
      as MediaProjectionManager
    try {
      activity.startActivityForResult(mpm.createScreenCaptureIntent(), requestCode)
    } catch (e: Exception) {
      pendingPromise = null
      promise.reject("launch_failed", e.message ?: "Failed to launch projection intent")
    }
  }

  override fun stopScreenBroadcast() {
    stopService()
  }

  override fun invalidate() {
    super.invalidate()
    reactApplicationContext.removeActivityEventListener(this)
    pendingPromise?.reject("module_invalidated", "Module invalidated")
    pendingPromise = null
    stopService()
  }

  private fun stopService() {
    val ctx = reactApplicationContext
    val intent = Intent(ctx, MoQScreenBroadcastService::class.java)
      .setAction(MoQScreenBroadcastService.ACTION_STOP)
    try { ctx.startService(intent) } catch (_: Exception) {}
    MoQScreenBroadcastService.stateListener = null
    MoQScreenBroadcastService.trackListener = null
    stateListener("idle")
  }

  override fun onActivityResult(
    activity: Activity, requestCode: Int, resultCode: Int, data: Intent?
  ) {
    if (requestCode != this.requestCode) return
    val promise = pendingPromise ?: return
    pendingPromise = null

    if (resultCode != Activity.RESULT_OK || data == null) {
      promise.reject("user_cancelled", "User did not grant screen capture permission")
      return
    }

    val ctx = reactApplicationContext
    MoQScreenBroadcastService.stateListener = stateListener
    // Per-track state events from the screen service are intentionally dropped —
    // useScreenBroadcast exposes only the aggregate state.
    MoQScreenBroadcastService.trackListener = null

    val serviceIntent = Intent(ctx, MoQScreenBroadcastService::class.java)
      .setAction(MoQScreenBroadcastService.ACTION_START)
      .putExtra(MoQScreenBroadcastService.EXTRA_RESULT_CODE, resultCode)
      .putExtra(MoQScreenBroadcastService.EXTRA_PROJECTION_DATA, data)
      .putExtra(MoQScreenBroadcastService.EXTRA_URL, configuredUrl)
      .putExtra(MoQScreenBroadcastService.EXTRA_CONFIG_JSON, configuredOptsJson)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        ctx.startForegroundService(serviceIntent)
      } else {
        ctx.startService(serviceIntent)
      }
      promise.resolve(null)
    } catch (e: Exception) {
      MoQScreenBroadcastService.stateListener = null
      promise.reject("service_start_failed", e.message ?: "Failed to start broadcast service")
    }
  }

  override fun onNewIntent(intent: Intent) {}

  private fun emit(name: String, params: WritableMap) {
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(name, params)
  }
}
