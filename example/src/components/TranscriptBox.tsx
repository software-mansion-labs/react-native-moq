import { StyleSheet, Text, View } from 'react-native';
import { Hint } from './ui';
import { useTheme } from '../theme';

/** Fill-colored box showing a rolling transcript, or a muted placeholder. */
export function TranscriptBox({
  transcript,
  placeholder,
  minHeight = 72,
}: {
  transcript: string;
  placeholder: string;
  minHeight?: number;
}) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={[
        styles.box,
        {
          minHeight,
          backgroundColor: colors.fill,
          borderRadius: radius.control,
        },
      ]}
    >
      {transcript === '' ? (
        <Hint tone="tertiary">{placeholder}</Hint>
      ) : (
        <Text style={[styles.transcript, { color: colors.label }]}>
          {transcript}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { padding: 12 },
  transcript: { fontSize: 15, lineHeight: 22 },
});
