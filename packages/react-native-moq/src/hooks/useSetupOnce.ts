import { useEffect, useRef } from 'react';

// Runs the optional `setup` callback once on mount with the value current at
// that moment. Shared by useSession / useVideoPlayer / useAudioPlayer.
export function useSetupOnce<T>(value: T, setup?: (value: T) => void): void {
  const valueRef = useRef(value);
  valueRef.current = value;

  const setupRef = useRef(setup);

  useEffect(() => {
    setupRef.current?.(valueRef.current);
  }, []);
}
