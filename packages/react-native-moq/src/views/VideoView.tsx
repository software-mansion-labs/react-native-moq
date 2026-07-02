import { requireNativeComponent, type ViewProps } from 'react-native';
import type { Player } from '../types';

interface NativeVideoViewProps extends ViewProps {
  sessionId: string;
  broadcastPath: string;
}

export interface VideoViewProps extends ViewProps {
  player: Player;
}

const NativeMoQVideoView =
  requireNativeComponent<NativeVideoViewProps>('MoQVideoView');

// Bare native video output, no chrome — the building block for custom UIs.
// For a ready-made layout with fullscreen + controls, use `<VideoPlayerView>`.
export function VideoView({ player, ...rest }: VideoViewProps) {
  return (
    <NativeMoQVideoView
      sessionId={player.sessionId}
      broadcastPath={player.broadcastPath}
      {...rest}
    />
  );
}
