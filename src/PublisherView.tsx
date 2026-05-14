import { requireNativeComponent, type ViewProps } from 'react-native';

export type CameraPosition = 'front' | 'back';

interface NativePublisherViewProps extends ViewProps {
  cameraPosition: CameraPosition;
}

export interface PublisherViewProps extends ViewProps {
  cameraPosition?: CameraPosition;
}

const NativeMoQCameraPreviewView =
  requireNativeComponent<NativePublisherViewProps>('MoQCameraPreviewView');

// Renders the publisher's camera preview. Mounting this view starts the
// camera; unmounting stops it (unless a publish is in progress, in which
// case the camera keeps running until publish stops).
export function PublisherView({
  cameraPosition = 'front',
  ...rest
}: PublisherViewProps) {
  return (
    <NativeMoQCameraPreviewView cameraPosition={cameraPosition} {...rest} />
  );
}
