import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  getSessionState(): string;
  setSessionState(state: string): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('Moq');
