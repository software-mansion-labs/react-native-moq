import { useEffect, useReducer, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';

const MAX_BAR_HEIGHT = 56;

/**
 * A live level meter. The parent keeps a ring buffer of recent peak levels
 * (0..1) in `levelsRef`; we repaint on a timer since chunks arrive too fast to
 * drive React state per chunk.
 */
export function WaveformMeter({
  levelsRef,
  active,
}: {
  levelsRef: RefObject<number[]>;
  active: boolean;
}) {
  const [, repaint] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(repaint, 60);
    return () => clearInterval(id);
  }, [active]);

  const levels = levelsRef.current ?? [];

  return (
    <View style={styles.row}>
      {levels.map((level, i) => (
        <View
          key={i}
          style={[
            styles.bar,
            { height: 2 + Math.min(1, level) * MAX_BAR_HEIGHT },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: MAX_BAR_HEIGHT + 4,
    paddingVertical: 2,
  },
  bar: {
    flex: 1,
    marginHorizontal: 0.5,
    borderRadius: 1,
    backgroundColor: '#2563eb',
  },
});
