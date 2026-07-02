import type { VideoTrackInfo } from 'react-native-moq';

// Highest-resolution first (by pixel area). Returns a new array.
export function sortVideoTracksByResolution(
  tracks: VideoTrackInfo[]
): VideoTrackInfo[] {
  const pixels = (t: VideoTrackInfo) => (t.width ?? 0) * (t.height ?? 0);
  return [...tracks].sort((a, b) => pixels(b) - pixels(a));
}
