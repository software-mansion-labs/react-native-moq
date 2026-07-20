import type { ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

/** 9:16 preview frame(s) on the left, wrapping pills on the right. */
export function PreviewRow({
  children,
  side,
}: {
  children: ReactNode;
  side: ReactNode;
}) {
  return (
    <View style={styles.previewRow}>
      {children}
      <View style={styles.previewSide}>{side}</View>
    </View>
  );
}

export function PreviewFrame({
  children,
  style,
  badge,
  accessibilityLabel,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  badge?: string;
  accessibilityLabel?: string;
}) {
  return (
    <View
      style={[styles.preview, style]}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
      {badge != null && <Text style={styles.previewBadge}>{badge}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  previewRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  preview: {
    height: 200,
    aspectRatio: 9 / 16,
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
  },
  previewSide: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  previewBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
});
