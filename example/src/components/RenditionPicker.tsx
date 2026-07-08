import type { VideoTrackInfo } from 'react-native-moq';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

function trackLabel(track: VideoTrackInfo): string {
  if (track.height) return `${track.height}p`;
  return track.name;
}

export function RenditionPicker({
  tracks,
  currentTrackName,
  onSelect,
}: {
  tracks: VideoTrackInfo[];
  currentTrackName: string | undefined;
  onSelect: (name: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.renditionRow}>
      {tracks.map((track) => {
        const isActive = track.name === currentTrackName;
        return (
          <Pressable
            key={track.name}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            style={({ pressed }) => [
              styles.renditionBtn,
              { backgroundColor: isActive ? colors.tint : colors.fill },
              pressed && styles.pressed,
            ]}
            onPress={() => onSelect(track.name)}
          >
            <Text
              style={[
                styles.renditionBtnText,
                { color: isActive ? colors.onTint : colors.secondaryLabel },
                isActive && styles.renditionBtnTextActive,
              ]}
            >
              {trackLabel(track)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  renditionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  renditionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  pressed: { opacity: 0.55 },
  renditionBtnText: {
    fontSize: 13,
  },
  renditionBtnTextActive: {
    fontWeight: '600',
  },
});
