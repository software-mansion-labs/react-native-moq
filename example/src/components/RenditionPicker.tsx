import type { VideoTrackInfo } from 'react-native-moq';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

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
  return (
    <View style={styles.renditionRow}>
      {tracks.map((track) => {
        const isActive = track.name === currentTrackName;
        return (
          <TouchableOpacity
            key={track.name}
            style={[styles.renditionBtn, isActive && styles.renditionBtnActive]}
            onPress={() => onSelect(track.name)}
          >
            <Text
              style={[
                styles.renditionBtnText,
                isActive && styles.renditionBtnTextActive,
              ]}
            >
              {trackLabel(track)}
            </Text>
          </TouchableOpacity>
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#e5e7eb',
  },
  renditionBtnActive: {
    backgroundColor: '#3b82f6',
  },
  renditionBtnText: {
    fontSize: 13,
    color: '#374151',
  },
  renditionBtnTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
});
