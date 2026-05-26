import { requireNativeComponent, type ViewProps } from 'react-native';
import type { CameraTrack } from './useCamera';

interface NativePublisherViewProps extends ViewProps {}

export interface PublisherViewProps extends ViewProps {
  // The camera hook driving this preview. Captures are started by the hook,
  // not by mounting this view — the prop documents the dependency and ensures
  // the camera capture is kept alive while the preview is on screen.
  camera: CameraTrack;
}

const NativeMoQCameraPreviewView =
  requireNativeComponent<NativePublisherViewProps>('MoQCameraPreviewView');

// Renders whatever the shared camera capture is producing. The capture
// lifecycle is owned by useCamera — mounting/unmounting this view does not
// start or stop the camera.
export function PublisherView({
  camera: _camera,
  ...rest
}: PublisherViewProps) {
  return <NativeMoQCameraPreviewView {...rest} />;
}
