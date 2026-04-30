import { requireNativeComponent, type ViewProps } from 'react-native';
import type { MoQPlayer } from './types';

interface NativeMoQVideoViewProps extends ViewProps {
  broadcastPath: string;
}

export interface VideoViewProps extends ViewProps {
  player: MoQPlayer;
}

const NativeMoQVideoView =
  requireNativeComponent<NativeMoQVideoViewProps>('MoQVideoView');

export function VideoView({ player, ...rest }: VideoViewProps) {
  return <NativeMoQVideoView broadcastPath={player.broadcastPath} {...rest} />;
}
