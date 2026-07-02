package com.moq

import com.swmansion.moqkit.subscribe.Broadcast
import com.swmansion.moqkit.subscribe.BroadcastSubscription
import com.swmansion.moqkit.subscribe.Catalog
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/** Owns the state for a single prefix subscription. */
class MoQPrefixSubscription(
  val prefix: String,
  private val subscription: BroadcastSubscription,
  private val scope: CoroutineScope,
  private val onBroadcastAvailable:
    suspend (prefix: String, broadcast: Broadcast, catalog: Catalog) -> Unit,
  private val onBroadcastUnavailable: suspend (prefix: String, path: String) -> Unit,
) {
  private var broadcastsJob: Job? = null
  private val catalogJobs = ConcurrentHashMap<String, Job>()

  fun start() {
    broadcastsJob = scope.launch {
      subscription.broadcasts.collect { broadcast ->
        val path = broadcast.path
        // Relay re-emitted the broadcast; restart catalog observation.
        catalogJobs[path]?.cancel()
        val job = launch {
          try {
            broadcast.use { b ->
              b.catalogs().collect { catalog ->
                onBroadcastAvailable(prefix, b, catalog)
              }
            }
            // Catalog flow ended — broadcast unavailable.
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

  /** Cancel the catalog job for one path so it stops emitting after external teardown. */
  fun cancelCatalogJob(path: String) {
    catalogJobs.remove(path)?.cancel()
  }

  /** Cancel the subscription and all jobs; returns the paths it was tracking. */
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
