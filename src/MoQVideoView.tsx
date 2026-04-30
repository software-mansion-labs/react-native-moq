import { requireNativeComponent, type ViewProps } from 'react-native';
import type { MoQPlayer } from './types';

interface NativeMoQVideoViewProps extends ViewProps {
  broadcastPath: string;
}

export interface MoQVideoViewProps extends ViewProps {
  player: MoQPlayer;
}

const NativeMoQVideoView =
  requireNativeComponent<NativeMoQVideoViewProps>('MoQVideoView');

export function MoQVideoView({ player, ...rest }: MoQVideoViewProps) {
  return <NativeMoQVideoView broadcastPath={player.broadcastPath} {...rest} />;
}
