import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card, Hint } from './ui';
import { useTheme } from '../theme';

/** Row card for a discovered broadcast: path, optional subtitle, actions. */
export function BroadcastRow({
  path,
  subtitle,
  actions,
}: {
  path: string;
  subtitle?: string;
  actions: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Card style={styles.row}>
      <View style={styles.info}>
        <Text style={[styles.path, { color: colors.label }]} numberOfLines={1}>
          {path}
        </Text>
        {subtitle != null && <Hint>{subtitle}</Hint>}
      </View>
      <View style={styles.actions}>{actions}</View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  info: { flex: 1, gap: 2 },
  path: { fontSize: 14, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8 },
});
