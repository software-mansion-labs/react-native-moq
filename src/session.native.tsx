import Moq from './NativeMoq';

export function getSessionState(): string {
  return Moq.getSessionState();
}

export function setSessionState(state: string): void {
  Moq.setSessionState(state);
}
