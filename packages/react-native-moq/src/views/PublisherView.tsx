import { requireNativeComponent, type ViewProps } from 'react-native';
import type { CameraTrack } from '../hooks/useCamera';

interface NativePublisherViewProps extends ViewProps {}

interface NativeMultiPublisherViewProps extends ViewProps {
  source: 'front' | 'back';
}

export interface PublisherViewProps extends ViewProps {
  // The camera hook driving this preview. Captures are started by the hook,
  // not by mounting this view — the prop documents the dependency and ensures
  // the camera capture is kept alive while the preview is on screen. Works with
  // both useCamera tracks and the front/back tracks from useMultiCamera.
  camera: CameraTrack;
}

const NativeMoQCameraPreviewView =
  requireNativeComponent<NativePublisherViewProps>('MoQCameraPreviewView');

const NativeMoQMultiCameraPreviewView =
  requireNativeComponent<NativeMultiPublisherViewProps>(
    'MoQMultiCameraPreviewView'
  );

// Renders whatever the backing camera capture is producing. The capture
// lifecycle is owned by useCamera / useMultiCamera — mounting/unmounting this
// view does not start or stop the camera. Routes to the multi-camera preview
// (selecting the front or back stream) when given a useMultiCamera track.
export function PublisherView({ camera, ...rest }: PublisherViewProps) {
  if (camera.__source === 'multi-front' || camera.__source === 'multi-back') {
    const source = camera.__source === 'multi-front' ? 'front' : 'back';
    return <NativeMoQMultiCameraPreviewView source={source} {...rest} />;
  }
  return <NativeMoQCameraPreviewView {...rest} />;
}
