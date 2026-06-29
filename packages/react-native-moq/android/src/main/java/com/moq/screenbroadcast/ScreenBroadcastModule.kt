package com.moq.screenbroadcast

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Build
import com.facebook.react.bridge.ActivityEventListener
import com.moq.NativeMoQScreenBroadcastSpec
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.moq.emitStateEvent

// Out-of-process screen broadcasting on Android. configureScreenBroadcast
// caches the relay URL + options; startScreenBroadcast launches the system
// MediaProjection consent flow and, on approval, starts ScreenBroadcastService
// in the foreground. The service opens its own MoQ session — it does not
// reuse any host-side publisher session.
class ScreenBroadcastModule(reactContext: ReactApplicationContext) :
  NativeMoQScreenBroadcastSpec(reactContext), ActivityEventListener {

  init {
    reactContext.addActivityEventListener(this)
  }

  private var configuredUrl: String? = null
  private var configuredOptsJson: String? = null
  private var pendingPromise: Promise? = null
  private val requestCode = 0xC051

  private val stateListener: (String) -> Unit = { state ->
    reactApplicationContext.emitStateEvent("screenBroadcastStateChanged", state)
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
    val intent = Intent(ctx, ScreenBroadcastService::class.java)
      .setAction(ScreenBroadcastService.ACTION_STOP)
    try { ctx.startService(intent) } catch (_: Exception) {}
    ScreenBroadcastService.stateListener = null
    ScreenBroadcastService.trackListener = null
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
    ScreenBroadcastService.stateListener = stateListener
    // Per-track state events from the screen service are intentionally dropped —
    // useScreenBroadcast exposes only the aggregate state.
    ScreenBroadcastService.trackListener = null

    val serviceIntent = Intent(ctx, ScreenBroadcastService::class.java)
      .setAction(ScreenBroadcastService.ACTION_START)
      .putExtra(ScreenBroadcastService.EXTRA_RESULT_CODE, resultCode)
      .putExtra(ScreenBroadcastService.EXTRA_PROJECTION_DATA, data)
      .putExtra(ScreenBroadcastService.EXTRA_URL, configuredUrl)
      .putExtra(ScreenBroadcastService.EXTRA_CONFIG_JSON, configuredOptsJson)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        ctx.startForegroundService(serviceIntent)
      } else {
        ctx.startService(serviceIntent)
      }
      promise.resolve(null)
    } catch (e: Exception) {
      ScreenBroadcastService.stateListener = null
      promise.reject("service_start_failed", e.message ?: "Failed to start broadcast service")
    }
  }

  override fun onNewIntent(intent: Intent) {}
}
