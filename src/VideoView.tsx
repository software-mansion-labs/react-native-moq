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

export function VideoView({ player, ...rest }: VideoViewProps) {
  return <NativeMoQVideoView broadcastPath={player.broadcastPath} {...rest} />;
}
