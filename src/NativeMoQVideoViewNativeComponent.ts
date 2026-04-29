import type { HostComponent, ViewProps } from 'react-native';
import type { Int32 } from 'react-native/Libraries/Types/CodegenTypes';
import { codegenNativeComponent } from 'react-native';

export interface NativeProps extends ViewProps {
  playerId?: Int32;
}

export default codegenNativeComponent<NativeProps>(
  'MoQVideoView'
) as HostComponent<NativeProps>;
