import Foundation
import MoQKit

/// State for one prefix subscription: the BroadcastSubscription, the task
/// collecting its `broadcasts` stream, and per-path catalog tasks. MoQImpl keeps
/// one per active prefix and forwards callbacks for player creation/teardown.
@MainActor
final class MoQPrefixSubscription {
  let prefix: String

  private let subscription: BroadcastSubscription
  private var broadcastsTask: Task<Void, Never>?
  private var catalogTasks: [String: Task<Void, Never>] = [:]

  private let onBroadcastAvailable:
    (_ prefix: String, _ broadcast: Broadcast, _ catalog: Catalog) async -> Void
  private let onBroadcastUnavailable: (_ prefix: String, _ path: String) async -> Void

  init(
    prefix: String,
    subscription: BroadcastSubscription,
    onBroadcastAvailable: @escaping (String, Broadcast, Catalog) async -> Void,
    onBroadcastUnavailable: @escaping (String, String) async -> Void
  ) {
    self.prefix = prefix
    self.subscription = subscription
    self.onBroadcastAvailable = onBroadcastAvailable
    self.onBroadcastUnavailable = onBroadcastUnavailable
  }

  /// Observe the relay's broadcast stream. Each broadcast spins up a child task
  /// following its catalog updates, reporting unavailable when that stream ends.
  func start() {
    let prefix = self.prefix
    broadcastsTask = Task { @MainActor [weak self] in
      guard let self else { return }
      for await broadcast in self.subscription.broadcasts {
        let path = broadcast.path
        // Relay re-emitted the broadcast — restart catalog observation.
        self.catalogTasks[path]?.cancel()
        self.catalogTasks[path] = Task { @MainActor [weak self] in
          for await catalog in broadcast.catalogs() {
            await self?.onBroadcastAvailable(prefix, broadcast, catalog)
          }
          await self?.onBroadcastUnavailable(prefix, path)
          self?.catalogTasks.removeValue(forKey: path)
        }
      }
    }
  }

  /// Cancel a path's catalog task so it stops emitting events after MoQImpl
  /// tears its player down externally (e.g. stopPlayer).
  func cancelCatalogTask(for path: String) {
    catalogTasks.removeValue(forKey: path)?.cancel()
  }

  /// Cancel the subscription and all tasks. Returns the tracked broadcast paths
  /// so the caller can tear down their players.
  func cancel() -> Set<String> {
    let paths = Set(catalogTasks.keys)
    broadcastsTask?.cancel(); broadcastsTask = nil
    catalogTasks.values.forEach { $0.cancel() }
    catalogTasks = [:]
    subscription.cancel()
    return paths
  }
}
