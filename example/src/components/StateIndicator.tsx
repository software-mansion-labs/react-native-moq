import { StyleSheet, Text, View, type ColorValue } from 'react-native';
import { useTheme, type Theme } from '../theme';

function stateColor(state: string, colors: Theme['colors']): ColorValue {
  if (state.startsWith('error')) return colors.destructive;
  switch (state) {
    case 'connecting':
      return colors.warning;
    case 'connected':
    case 'publishing':
    case 'broadcasting':
      return colors.tint;
    default:
      return colors.tertiaryLabel;
  }
}

export function StateIndicator({ state }: { state: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.stateRow}>
      <View
        style={[styles.dot, { backgroundColor: stateColor(state, colors) }]}
      />
      <Text style={[styles.stateText, { color: colors.secondaryLabel }]}>
        {state}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  stateText: {
    fontSize: 14,
    flexShrink: 1,
  },
});
