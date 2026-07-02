import {
  Platform,
  requireNativeComponent,
  View,
  type ViewProps,
} from 'react-native';

export interface BroadcastPickerViewProps extends ViewProps {
  // Bundle id of the Broadcast Upload Extension; when set the picker pre-selects
  // it so it's a single tap. iOS-only.
  preferredExtension?: string;
  // iOS-only.
  tintColor?: string;
}

interface NativeBroadcastPickerViewProps extends ViewProps {
  preferredExtension?: string;
  tintColor?: string;
}

// iOS wraps RPSystemBroadcastPickerView (system sheet launches the extension);
// renders nothing on Android, where MediaProjection starts programmatically.
const NativeMoQBroadcastPickerView =
  Platform.OS === 'ios'
    ? requireNativeComponent<NativeBroadcastPickerViewProps>(
        'MoQBroadcastPickerView'
      )
    : null;

export function BroadcastPickerView(props: BroadcastPickerViewProps) {
  if (NativeMoQBroadcastPickerView == null) {
    return <View {...props} />;
  }
  return <NativeMoQBroadcastPickerView {...props} />;
}
