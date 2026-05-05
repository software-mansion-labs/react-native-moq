import { useEffect, useRef, useState } from 'react';
import { EventEmitter } from './EventEmitter';

type EmitterSource = EventEmitter<any> | { emitter: EventEmitter<any> };

type EventsMapOf<TSource> =
  TSource extends EventEmitter<infer TEventsMap>
    ? TEventsMap
    : TSource extends { emitter: EventEmitter<infer TEventsMap> }
      ? TEventsMap
      : never;

type EventDataOf<
  TSource,
  TEventName extends keyof EventsMapOf<TSource>,
> = Parameters<EventsMapOf<TSource>[TEventName]>[0];

function resolveEmitter<TSource extends EmitterSource>(
  source: TSource
): EventEmitter<EventsMapOf<TSource>> {
  if (source instanceof EventEmitter) return source as any;
  return (source as { emitter: EventEmitter<any> }).emitter as any;
}

export function useEvent<
  TSource extends EmitterSource,
  TEventName extends keyof EventsMapOf<TSource>,
  TData extends EventDataOf<TSource, TEventName>,
>(source: TSource, eventName: TEventName, initialValue: TData): TData;

export function useEvent<
  TSource extends EmitterSource,
  TEventName extends keyof EventsMapOf<TSource>,
  TData extends EventDataOf<TSource, TEventName>,
>(source: TSource, eventName: TEventName): TData | undefined;

export function useEvent<
  TSource extends EmitterSource,
  TEventName extends keyof EventsMapOf<TSource>,
  TData extends EventDataOf<TSource, TEventName>,
>(
  source: TSource,
  eventName: TEventName,
  initialValue?: TData
): TData | undefined {
  const [data, setData] = useState<TData | undefined>(initialValue);
  // Keep latest setter in a ref so the effect closure never goes stale,
  // without needing to re-subscribe when the component re-renders.
  const setDataRef = useRef(setData);
  setDataRef.current = setData;

  const emitter = resolveEmitter(source);

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
  TSource extends EmitterSource,
  TEventName extends keyof EventsMapOf<TSource>,
>(
  source: TSource,
  eventName: TEventName,
  listener: EventsMapOf<TSource>[TEventName]
): void {
  const listenerRef = useRef(listener);
  listenerRef.current = listener;

  const emitter = resolveEmitter(source);

  useEffect(() => {
    const sub = emitter.addListener(eventName as any, (...args: any[]) => {
      (listenerRef.current as any)(...args);
    });
    return () => sub.remove();
  }, [emitter, eventName]);
}
