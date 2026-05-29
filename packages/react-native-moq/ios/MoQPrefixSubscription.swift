import Foundation
import MoQKit

/// Owns the state for a single prefix subscription: the underlying MoQKit
/// `BroadcastSubscription`, the task collecting its `broadcasts` stream, and
/// the per-path catalog tasks.  The owning `MoQImpl` keeps one of these per
/// active prefix and forwards callbacks for player creation/teardown.
@MainActor
final class MoQPrefixSubscription {
  let prefix: String

  private let subscription: BroadcastSubscription
  private var broadcastsTask: Task<Void, Never>?
  private var catalogTasks: [String: Task<Void, Never>] = [:]

  private let onBroadcastAvailable: (_ prefix: String, _ catalog: Catalog) async -> Void
  private let onBroadcastUnavailable: (_ prefix: String, _ path: String) async -> Void

  init(
    prefix: String,
    subscription: BroadcastSubscription,
    onBroadcastAvailable: @escaping (String, Catalog) async -> Void,
    onBroadcastUnavailable: @escaping (String, String) async -> Void
  ) {
    self.prefix = prefix
    self.subscription = subscription
    self.onBroadcastAvailable = onBroadcastAvailable
    self.onBroadcastUnavailable = onBroadcastUnavailable
  }

  /// Begin observing the relay's broadcast stream.  Each new broadcast spins
  /// up a child task that follows its catalog updates and reports the
  /// final unavailable when the catalog stream ends naturally.
  func start() {
    let prefix = self.prefix
    broadcastsTask = Task { @MainActor [weak self] in
      guard let self else { return }
      for await broadcast in self.subscription.broadcasts {
        let path = broadcast.path
        // Replace any in-flight catalog task for this path — the relay
        // re-emitted the broadcast so we restart catalog observation.
        self.catalogTasks[path]?.cancel()
        self.catalogTasks[path] = Task { @MainActor [weak self] in
          for await catalog in broadcast.catalogs() {
            await self?.onBroadcastAvailable(prefix, catalog)
          }
          await self?.onBroadcastUnavailable(prefix, path)
          self?.catalogTasks.removeValue(forKey: path)
        }
      }
    }
  }

  /// Cancel the in-flight catalog task for a single broadcast path.  Used
  /// when MoQImpl tears down a player externally (e.g. stopPlayer) so the
  /// task doesn't keep emitting events afterward.
  func cancelCatalogTask(for path: String) {
    catalogTasks.removeValue(forKey: path)?.cancel()
  }

  /// Cancel the underlying subscription and all in-flight tasks.  Returns
  /// the set of broadcast paths the subscription was tracking so the caller
  /// can tear down the corresponding players.
  func cancel() -> Set<String> {
    let paths = Set(catalogTasks.keys)
    broadcastsTask?.cancel(); broadcastsTask = nil
    catalogTasks.values.forEach { $0.cancel() }
    catalogTasks = [:]
    subscription.cancel()
    return paths
  }
}
