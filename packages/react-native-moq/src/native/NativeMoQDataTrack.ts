import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  // Standalone emitter, owned independently of any publisher (mirrors MoQKit).
  create(trackId: string): void;

  // An already-attached publisher keeps working; further send() calls are ignored.
  destroy(trackId: string): void;

  // No-op until the track is published and started; delivered in order.
  send(trackId: string, payload: string): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('MoQDataTrack');
