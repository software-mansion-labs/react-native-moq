import { useEffect, useRef, useState } from 'react';
import type { EventEmitter } from './EventEmitter';

type EventsMapOf<TEmitter> =
  TEmitter extends EventEmitter<infer TEventsMap> ? TEventsMap : never;

type EventDataOf<
  TEmitter,
  TEventName extends keyof EventsMapOf<TEmitter>,
> = Parameters<EventsMapOf<TEmitter>[TEventName]>[0];

export function useEvent<
  TEmitter extends EventEmitter<any>,
  TEventName extends keyof EventsMapOf<TEmitter>,
  TData extends EventDataOf<TEmitter, TEventName>,
>(emitter: TEmitter, eventName: TEventName, initialValue: TData): TData;

export function useEvent<
  TEmitter extends EventEmitter<any>,
  TEventName extends keyof EventsMapOf<TEmitter>,
  TData extends EventDataOf<TEmitter, TEventName>,
>(emitter: TEmitter, eventName: TEventName): TData | undefined;

export function useEvent<
  TEmitter extends EventEmitter<any>,
  TEventName extends keyof EventsMapOf<TEmitter>,
  TData extends EventDataOf<TEmitter, TEventName>,
>(
  emitter: TEmitter,
  eventName: TEventName,
  initialValue?: TData
): TData | undefined {
  const [data, setData] = useState<TData | undefined>(initialValue);
  // Keep latest setter in a ref so the effect closure never goes stale,
  // without needing to re-subscribe when the component re-renders.
  const setDataRef = useRef(setData);
  setDataRef.current = setData;

  useEffect(() => {
    const sub = emitter.addListener(eventName as any, (event: TData) => {
      setDataRef.current(event);
    });
    return () => sub.remove();
  }, [emitter, eventName]);

  return data;
}

// Lower-level hook for side-effectful listeners that don't need reactive state.
export function useEventListener<
  TEmitter extends EventEmitter<any>,
  TEventName extends keyof EventsMapOf<TEmitter>,
>(
  emitter: TEmitter,
  eventName: TEventName,
  listener: EventsMapOf<TEmitter>[TEventName]
): void {
  const listenerRef = useRef(listener);
  listenerRef.current = listener;

  useEffect(() => {
    const sub = emitter.addListener(eventName as any, (...args: any[]) => {
      (listenerRef.current as any)(...args);
    });
    return () => sub.remove();
  }, [emitter, eventName]);
}
