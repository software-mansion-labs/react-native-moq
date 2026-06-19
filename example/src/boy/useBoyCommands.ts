import { useCallback, useEffect, useRef } from 'react';
import type { DataTrack } from 'react-native-moq';
import type { BoyControl } from './types';

// Resend interval and long-press threshold copied from moq-kit's
// BoyDemoViewModel (10 ms repeat, 300 ms before a held button starts repeating).
const REPEAT_INTERVAL_MS = 10;
const LONG_PRESS_THRESHOLD_MS = 300;

/**
 * Owns the held-button set and the auto-repeat loop for the Boy controller,
 * encoding presses as JSON on the `command` data track. Faithful to moq-kit's
 * BoyDemoViewModel.setButton / sendHeldButtons / repeat loop:
 *   - every press/release sends `{type:"buttons",buttons:[…],timestamps:[]}`
 *     with the held buttons sorted by name
 *   - while any button stays held past 300 ms, the held set is re-sent every
 *     10 ms so the host keeps registering the input
 */
export function useBoyCommands(dataTrack: DataTrack, enabled: boolean) {
  const held = useRef<Set<BoyControl>>(new Set());
  const holdStart = useRef<Map<BoyControl, number>>(new Map());
  const repeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const dataTrackRef = useRef(dataTrack);
  dataTrackRef.current = dataTrack;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const sendHeld = useCallback(() => {
    const buttons = [...held.current].sort();
    dataTrackRef.current.send(
      JSON.stringify({ type: 'buttons', buttons, timestamps: [] })
    );
  }, []);

  const stopRepeat = useCallback(() => {
    if (repeatTimer.current != null) {
      clearInterval(repeatTimer.current);
      repeatTimer.current = null;
    }
  }, []);

  const updateRepeat = useCallback(() => {
    if (held.current.size === 0) {
      stopRepeat();
      return;
    }
    if (repeatTimer.current != null) return;
    repeatTimer.current = setInterval(() => {
      if (held.current.size === 0) {
        stopRepeat();
        return;
      }
      const now = Date.now();
      const shouldRepeat = [...holdStart.current.values()].some(
        (startedAt) => now >= startedAt + LONG_PRESS_THRESHOLD_MS
      );
      if (shouldRepeat) sendHeld();
    }, REPEAT_INTERVAL_MS);
  }, [sendHeld, stopRepeat]);

  const setButton = useCallback(
    (control: BoyControl, isPressed: boolean) => {
      if (!enabledRef.current) return;

      let changed = false;
      if (isPressed) {
        if (!held.current.has(control)) {
          held.current.add(control);
          holdStart.current.set(control, Date.now());
          changed = true;
        }
      } else if (held.current.delete(control)) {
        holdStart.current.delete(control);
        changed = true;
      }

      if (!changed) return;
      sendHeld();
      updateRepeat();
    },
    [sendHeld, updateRepeat]
  );

  // Drop any held state when the controller goes away (game ejected, console
  // powered off, screen unmounted) so the repeat loop never outlives publishing.
  useEffect(() => {
    if (enabled) return;
    held.current.clear();
    holdStart.current.clear();
    stopRepeat();
  }, [enabled, stopRepeat]);

  useEffect(() => stopRepeat, [stopRepeat]);

  return { setButton };
}
