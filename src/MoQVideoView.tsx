import { requireNativeComponent, type ViewProps } from 'react-native';

const NativeMoQVideoView = requireNativeComponent<ViewProps>('MoQVideoView');

export function MoQVideoView(props: ViewProps) {
  return <NativeMoQVideoView {...props} />;
}
