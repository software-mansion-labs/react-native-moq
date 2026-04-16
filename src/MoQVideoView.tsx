import { requireNativeComponent, type ViewProps } from 'react-native';

export interface MoQVideoViewProps extends ViewProps {
  broadcastPath: string;
}

const NativeMoQVideoView =
  requireNativeComponent<MoQVideoViewProps>('MoQVideoView');

export function MoQVideoView(props: MoQVideoViewProps) {
  return <NativeMoQVideoView {...props} />;
}
