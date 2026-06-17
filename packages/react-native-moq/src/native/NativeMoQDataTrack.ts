import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  // Creates a standalone DataTrackEmitter identified by trackId. The emitter is
  // owned independently of any publisher (mirrors MoQKit, where you create an
  // emitter and hand it to Publisher.addDataTrack). usePublisher looks it up by
  // trackId when wiring the track into a broadcast.
  create(trackId: string): void;

  // Drops the emitter. A publisher that already attached it keeps working until
  // it stops; subsequent send() calls for this trackId are ignored.
  destroy(trackId: string): void;

  // Sends one UTF-8 string payload on the emitter. No-op until the track has
  // been published and started; delivered in invocation order.
  send(trackId: string, payload: string): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('MoQDataTrack');
