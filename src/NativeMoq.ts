import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  addListener(eventName: string): void;
  removeListeners(count: number): void;

  // Session
  connect(url: string, prefix: string): void;
  disconnect(): void;

  // Player controls
  play(): void;
  pause(): void;
  stopAll(): void;
  updateTargetLatency(ms: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('Moq');
