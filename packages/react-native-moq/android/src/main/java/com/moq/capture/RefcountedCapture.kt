package com.moq.capture

import kotlinx.coroutines.CompletableDeferred

// Generic refcounted capture lifecycle shared by CameraModule, MultiCameraModule
// and MicrophoneModule. Each owns its capture as a device singleton: multiple
// consumers (hooks, publishers, preview views) call start/stop independently and
// the hardware only stops once the refcount drops to zero. This factors out the
// start-Deferred bookkeeping, the "last consumer stopped while we were still
// starting" rollback and the state-event emission, so each module only has to
// say how to build and stop its specific capture.
//
// Confined to its module's main-dispatcher scope (every caller launches on it),
// so the plain Int / nullable fields need no extra synchronization.
class RefcountedCapture<T>(
  private val label: String,
  private val emitState: (String) -> Unit,
  private val stopCapture: (T) -> Unit,
  // Runs when a capture becomes active (Camera / MultiCamera publish their
  // shared source to the preview views here).
  private val onActive: (T) -> Unit = {},
  // Runs whenever we settle back to no running capture at refcount zero (idle,
  // explicit stop, or a start that failed with no remaining consumers).
  private val onInactive: () -> Unit = {},
) {
  private var capture: T? = null
  private var refCount: Int = 0
  // Set while a start is in flight so concurrent consumers (including publish())
  // can await the same Deferred instead of each spinning up their own.
  private var startDeferred: CompletableDeferred<T>? = null

  fun current(): T? = capture

  // Awaits any in-flight start so publish() can grab the capture right after a
  // hook calls startCapture. Throws if no consumer has asked for it at all.
  suspend fun waitForCapture(): T {
    capture?.let { return it }
    startDeferred?.let { return it.await() }
    throw CaptureException("$label capture not started")
  }

  // `preflight` may abort the start with an error message before any work runs
  // (e.g. a missing activity, or MultiCamera rejecting unsupported devices).
  // `make` builds and starts the underlying capture.
  suspend fun start(
    preflight: () -> String? = { null },
    make: suspend () -> T,
  ) {
    refCount += 1
    if (capture != null || startDeferred != null) return

    preflight()?.let { message ->
      if (refCount > 0) refCount -= 1
      emitState("error:$message")
      return
    }

    emitState("starting")
    val deferred = CompletableDeferred<T>()
    startDeferred = deferred

    try {
      val c = make()
      // The last consumer may have called stop() while we were starting.
      if (refCount == 0) {
        stopCapture(c)
        startDeferred = null
        deferred.completeExceptionally(
          CaptureException("$label capture cancelled before start completed"))
        onInactive()
        emitState("idle")
        return
      }
      capture = c
      startDeferred = null
      onActive(c)
      deferred.complete(c)
      emitState("active")
    } catch (e: Exception) {
      startDeferred = null
      // Roll back the refcount this start owned so a later retry isn't skewed.
      if (refCount > 0) refCount -= 1
      deferred.completeExceptionally(e)
      if (refCount == 0) onInactive()
      emitState("error:${e.message ?: "$label start failed"}")
    }
  }

  fun stop() {
    if (refCount > 0) refCount -= 1
    if (refCount > 0) return
    capture?.let { stopCapture(it) }
    capture = null
    onInactive()
    emitState("idle")
  }
}

class CaptureException(message: String) : RuntimeException(message)
