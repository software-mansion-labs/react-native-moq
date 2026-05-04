import { StyleSheet, Text, View } from 'react-native';

const STATE_COLOR: Record<string, string> = {
  idle: '#9ca3af',
  connecting: '#f59e0b',
  connected: '#3b82f6',
  closed: '#9ca3af',
};

function stateColor(state: string) {
  if (state.startsWith('error:')) return '#ef4444';
  return STATE_COLOR[state] ?? '#9ca3af';
}

export function StateIndicator({ state }: { state: string }) {
  return (
    <View style={styles.stateRow}>
      <View style={[styles.dot, { backgroundColor: stateColor(state) }]} />
      <Text style={styles.stateText}>{state}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  stateText: {
    fontSize: 14,
    color: '#374151',
  },
});
