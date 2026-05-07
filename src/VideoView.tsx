import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useState,
  type ReactNode,
} from 'react';
import {
  Modal,
  StyleSheet,
  useWindowDimensions,
  View,
  requireNativeComponent,
  type ViewProps,
} from 'react-native';
import type { Player } from './types';

interface NativeVideoViewProps extends ViewProps {
  broadcastPath: string;
}

export interface VideoViewProps extends ViewProps {
  player: Player;
  children?: ReactNode;
  // Aspect ratio (width / height) of the source video. Used to letterbox the
  // video inside the fullscreen modal so it isn't stretched to whatever shape
  // the device window happens to be. Defaults to 16/9 if not provided. iOS
  // letterboxes natively via the display layer's videoGravity, so this only
  // affects rendering inside the fullscreen modal.
  videoAspectRatio?: number;
  onFullscreenEnter?: () => void;
  onFullscreenExit?: () => void;
}

export interface VideoViewRef {
  enterFullscreen(): void;
  exitFullscreen(): void;
}

const NativeMoQVideoView =
  requireNativeComponent<NativeVideoViewProps>('MoQVideoView');

// Fullscreen is implemented as an RN <Modal> rather than reparenting the
// native view. The native view (AVSampleBufferDisplayLayer / SurfaceView) is
// not a ViewGroup, and reparenting it outside RN's root view also breaks
// RN's touch handling, so any overlay buttons would be untappable. Wrapping
// the native view in a regular RN <View> and toggling that wrapper into a
// <Modal> keeps everything inside RN's tree — touches and child layout
// behave normally on both platforms.
export const VideoView = forwardRef<VideoViewRef, VideoViewProps>(
  function VideoView(
    {
      player,
      children,
      style,
      videoAspectRatio,
      onFullscreenEnter,
      onFullscreenExit,
      ...rest
    },
    ref
  ) {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();

    const enterFullscreen = useCallback(() => {
      setIsFullscreen((prev) => {
        if (prev) return prev;
        onFullscreenEnter?.();
        return true;
      });
    }, [onFullscreenEnter]);

    const exitFullscreen = useCallback(() => {
      setIsFullscreen((prev) => {
        if (!prev) return prev;
        onFullscreenExit?.();
        return false;
      });
    }, [onFullscreenExit]);

    useImperativeHandle(ref, () => ({ enterFullscreen, exitFullscreen }), [
      enterFullscreen,
      exitFullscreen,
    ]);

    // The shared MoQ video output (the AVSampleBufferDisplayLayer on iOS,
    // the player Surface on Android) is keyed by broadcastPath, so when this
    // element remounts on fullscreen toggle the underlying layer/surface
    // simply re-attaches to the new instance. There may be a brief frame of
    // black during the transition; this is acceptable.
    const native = (
      <NativeMoQVideoView
        broadcastPath={player.broadcastPath}
        style={StyleSheet.absoluteFill}
      />
    );

    if (isFullscreen) {
      // Compute a letterboxed box that fits the window while preserving the
      // video's aspect ratio. Android's SurfaceView would otherwise stretch
      // the surface buffer to whatever shape the window happens to be.
      const aspect = videoAspectRatio ?? 16 / 9;
      const screenAspect = windowWidth / windowHeight;
      const fitBox =
        screenAspect > aspect
          ? { width: windowHeight * aspect, height: windowHeight }
          : { width: windowWidth, height: windowWidth / aspect };

      return (
        <Modal
          visible
          animationType="fade"
          supportedOrientations={[
            'portrait',
            'portrait-upside-down',
            'landscape',
            'landscape-left',
            'landscape-right',
          ]}
          onRequestClose={exitFullscreen}
        >
          <View style={styles.fullscreenContainer}>
            <View style={fitBox}>{native}</View>
            {children}
          </View>
        </Modal>
      );
    }

    return (
      <View style={style} {...rest}>
        {native}
        {children}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  fullscreenContainer: {
    flex: 1,
    backgroundColor: 'black',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
