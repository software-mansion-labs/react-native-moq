import type { VideoTrackInfo } from 'react-native-moq';

// Highest-resolution first (by pixel area). Used to pick a default rendition
// and to order the rendition picker. Returns a new array; the input is left
// untouched.
export function sortVideoTracksByResolution(
  tracks: VideoTrackInfo[]
): VideoTrackInfo[] {
  const pixels = (t: VideoTrackInfo) => (t.width ?? 0) * (t.height ?? 0);
  return [...tracks].sort((a, b) => pixels(b) - pixels(a));
}
