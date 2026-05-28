import {
  Platform,
  requireNativeComponent,
  View,
  type ViewProps,
} from 'react-native';

export interface BroadcastPickerViewProps extends ViewProps {
  // Bundle identifier of the Broadcast Upload Extension target. When set, the
  // system picker pre-selects this extension and the user only sees one tap
  // to start. iOS-only.
  preferredExtension?: string;
  // Tint of the picker's broadcast button. iOS-only.
  tintColor?: string;
}

interface NativeBroadcastPickerViewProps extends ViewProps {
  preferredExtension?: string;
  tintColor?: string;
}

// iOS wraps RPSystemBroadcastPickerView. Tapping it opens the system sheet
// that launches the configured Broadcast Upload Extension. On Android (where
// MediaProjection is started programmatically via startScreenBroadcast) this
// component renders nothing.
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
