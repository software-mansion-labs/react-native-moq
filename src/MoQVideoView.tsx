import { requireNativeComponent, type ViewProps } from 'react-native';
import type { MoQPlayerHandle } from './types';

export interface MoQVideoViewProps extends ViewProps {
  player: MoQPlayerHandle | null;
}

const NativeMoQVideoView =
  requireNativeComponent<MoQVideoViewProps>('MoQVideoView');

export function MoQVideoView(props: MoQVideoViewProps) {
  return <NativeMoQVideoView {...props} />;
}
