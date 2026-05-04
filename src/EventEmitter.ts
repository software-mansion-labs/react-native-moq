type EventsMap = Record<string, (event: any) => void>;

export interface EventSubscription {
  remove(): void;
}

export class EventEmitter<TEventsMap extends EventsMap = Record<never, never>> {
  private _listeners: Map<string, Set<(event: any) => void>> = new Map();

  addListener<TEventName extends keyof TEventsMap>(
    eventName: TEventName,
    listener: TEventsMap[TEventName]
  ): EventSubscription {
    const key = eventName as string;
    if (!this._listeners.has(key)) {
      this._listeners.set(key, new Set());
    }
    this._listeners.get(key)!.add(listener as (event: any) => void);
    return {
      remove: () => {
        this._listeners.get(key)?.delete(listener as (event: any) => void);
      },
    };
  }

  emit<TEventName extends keyof TEventsMap>(
    eventName: TEventName,
    event: Parameters<TEventsMap[TEventName]>[0]
  ): void {
    const listeners = this._listeners.get(eventName as string);
    if (listeners) {
      listeners.forEach((l) => l(event));
    }
  }

  removeAllListeners(eventName?: keyof TEventsMap): void {
    if (eventName !== undefined) {
      this._listeners.delete(eventName as string);
    } else {
      this._listeners.clear();
    }
  }
}
