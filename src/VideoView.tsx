import { requireNativeComponent, type ViewProps } from 'react-native';
import type { Player } from './types';

interface NativeVideoViewProps extends ViewProps {
  broadcastPath: string;
}

export interface VideoViewProps extends ViewProps {
  player: Player;
}

const NativeMoQVideoView =
  requireNativeComponent<NativeVideoViewProps>('MoQVideoView');

// Thin wrapper around the MoQ native view: renders the player's video output
// with no extra chrome, fullscreen handling, or overlay support. This is the
// building block for fully custom video UIs. If you want a ready-made layout
// with fullscreen + platform-styled controls, reach for `<VideoPlayer>`.
export function VideoView({ player, ...rest }: VideoViewProps) {
  return <NativeMoQVideoView broadcastPath={player.broadcastPath} {...rest} />;
}
