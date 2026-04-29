import type { ViewProps } from 'react-native';
import type { MoQPlayerHandle } from './types';
import NativeMoQVideoView from './NativeMoQVideoViewNativeComponent';

export interface MoQVideoViewProps extends ViewProps {
  player: MoQPlayerHandle;
}

export function MoQVideoView({ player, ...rest }: MoQVideoViewProps) {
  return <NativeMoQVideoView playerId={player.playerId} {...rest} />;
}
