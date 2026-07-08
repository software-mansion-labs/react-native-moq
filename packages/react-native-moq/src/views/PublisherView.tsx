import { requireNativeComponent, type ViewProps } from 'react-native';
import type { CameraTrack } from '../camera';

interface NativePublisherViewProps extends ViewProps {}

interface NativeMultiPublisherViewProps extends ViewProps {
  source: 'front' | 'back';
}

export interface PublisherViewProps extends ViewProps {
  // The useCamera / useMultiCamera track driving this preview. Capture is owned
  // by the hook, not by mounting this view; the prop keeps it alive on screen.
  camera: CameraTrack;
}

const NativeMoQCameraPreviewView =
  requireNativeComponent<NativePublisherViewProps>('MoQCameraPreviewView');

const NativeMoQMultiCameraPreviewView =
  requireNativeComponent<NativeMultiPublisherViewProps>(
    'MoQMultiCameraPreviewView'
  );

// Routes to the multi-camera preview (front/back stream) for useMultiCamera
// tracks, otherwise the single-camera preview.
export function PublisherView({ camera, ...rest }: PublisherViewProps) {
  if (camera.__source === 'multi-front' || camera.__source === 'multi-back') {
    const source = camera.__source === 'multi-front' ? 'front' : 'back';
    return <NativeMoQMultiCameraPreviewView source={source} {...rest} />;
  }
  return <NativeMoQCameraPreviewView {...rest} />;
}
