package com.moq.capture

import kotlinx.coroutines.CompletableDeferred

// Refcounted capture singleton: the hardware only stops once the refcount drops
// to zero. Confined to its module's main-dispatcher scope, so the plain Int /
// nullable fields need no extra synchronization.
class RefcountedCapture<T>(
  private val label: String,
  private val emitState: (String) -> Unit,
  private val stopCapture: (T) -> Unit,
  private val onActive: (T) -> Unit = {},
  private val onInactive: () -> Unit = {},
) {
  private var capture: T? = null
  private var refCount: Int = 0
  // Shared by concurrent consumers so they await one start instead of each spinning up their own.
  private var startDeferred: CompletableDeferred<T>? = null

  fun current(): T? = capture

  suspend fun waitForCapture(): T {
    capture?.let { return it }
    startDeferred?.let { return it.await() }
    throw CaptureException("$label capture not started")
  }

  // `preflight` may abort the start with an error message before any work runs.
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
      // Roll back this start's refcount so a later retry isn't skewed.
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
