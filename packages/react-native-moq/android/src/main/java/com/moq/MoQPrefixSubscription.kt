package com.moq

import com.swmansion.moqkit.subscribe.BroadcastSubscription
import com.swmansion.moqkit.subscribe.Catalog
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/**
 * Owns the state for a single prefix subscription: the underlying MoQKit
 * [BroadcastSubscription], the coroutine collecting its `broadcasts` flow,
 * and the per-path catalog jobs.  The owning [MoQModule] keeps one of these
 * per active prefix and forwards callbacks for player creation/teardown.
 */
class MoQPrefixSubscription(
  val prefix: String,
  private val subscription: BroadcastSubscription,
  private val scope: CoroutineScope,
  private val onBroadcastAvailable: suspend (prefix: String, catalog: Catalog) -> Unit,
  private val onBroadcastUnavailable: suspend (prefix: String, path: String) -> Unit,
) {
  private var broadcastsJob: Job? = null
  private val catalogJobs = ConcurrentHashMap<String, Job>()

  /**
   * Begin observing the relay's broadcast flow.  Each new broadcast spins up
   * a child coroutine that follows its catalog updates and reports the final
   * unavailable when the catalog flow ends naturally.
   */
  fun start() {
    broadcastsJob = scope.launch {
      subscription.broadcasts.collect { broadcast ->
        val path = broadcast.path
        // Replace any in-flight catalog job for this path — the relay
        // re-emitted the broadcast so we restart catalog observation.
        catalogJobs[path]?.cancel()
        val job = launch {
          try {
            broadcast.use { b ->
              b.catalogs().collect { catalog ->
                onBroadcastAvailable(prefix, catalog)
              }
            }
            // Natural end of the catalog flow — broadcast unavailable.
            onBroadcastUnavailable(prefix, path)
          } catch (_: CancellationException) {
          } catch (_: Exception) {
            onBroadcastUnavailable(prefix, path)
          } finally {
            catalogJobs.remove(path)
          }
        }
        catalogJobs[path] = job
      }
    }
  }

  /**
   * Cancel the in-flight catalog job for a single broadcast path.  Used when
   * [MoQModule] tears down a player externally (e.g. stopPlayer) so the job
   * doesn't keep emitting events afterward.
   */
  fun cancelCatalogJob(path: String) {
    catalogJobs.remove(path)?.cancel()
  }

  /**
   * Cancel the underlying subscription and all in-flight jobs.  Returns the
   * set of broadcast paths the subscription was tracking so the caller can
   * tear down the corresponding players.
   */
  fun cancel(): Set<String> {
    val paths = catalogJobs.keys.toSet()
    broadcastsJob?.cancel()
    broadcastsJob = null
    catalogJobs.values.forEach { it.cancel() }
    catalogJobs.clear()
    subscription.close()
    return paths
  }
}
