import { requireNativeComponent, type ViewProps } from 'react-native';
import type { MoQPlayerHandle } from './types';

interface NativeMoQVideoViewProps extends ViewProps {
  broadcastPath: string;
}

export interface MoQVideoViewProps extends ViewProps {
  player: MoQPlayerHandle;
}

const NativeMoQVideoView =
  requireNativeComponent<NativeMoQVideoViewProps>('MoQVideoView');

export function MoQVideoView({ player, ...rest }: MoQVideoViewProps) {
  return <NativeMoQVideoView broadcastPath={player.broadcastPath} {...rest} />;
}
