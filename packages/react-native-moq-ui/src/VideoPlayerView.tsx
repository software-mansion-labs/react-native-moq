import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  Modal,
  StatusBar,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewProps,
} from 'react-native';
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import { FullscreenContext } from './contexts/FullscreenContext';
import { FullscreenControls } from './components/FullscreenControls';
import { MiniPlayerContext } from './contexts/MiniPlayerContext';
import { MiniPlayerControls } from './components/MiniPlayerControls';
import { ControlsLayer } from './components/ControlsLayer';
import { useAutoHideControls } from './useAutoHideControls';
import { VideoView, type Player } from 'react-native-moq';

export interface VideoPlayerViewProps extends ViewProps {
  player: Player;
  children?: ReactNode;
  // Source video aspect ratio (width / height), used to letterbox inside the
  // fullscreen modal. Defaults to 16/9. iOS letterboxes natively via videoGravity.
  videoAspectRatio?: number;
  /**
   * Fullscreen chrome. `true` (default) renders the built-in
   * `<FullscreenControls />`; `false` disables controls and tap-to-toggle; a
   * ReactNode replaces the default (wrapped in the same auto-hide fade — read
   * `useFullscreenControls()` inside).
   */
  controls?: boolean | ReactNode;
  /**
   * Inline (non-fullscreen) chrome. Same shape as `controls`; `true` renders
   * the built-in `<MiniPlayerControls />`, a ReactNode replaces it (read
   * `useMiniPlayerControls()` inside).
   */
  miniControls?: boolean | ReactNode;
  onFullscreenEnter?: () => void;
  onFullscreenExit?: () => void;
}

export interface VideoPlayerViewRef {
  enterFullscreen(): void;
  exitFullscreen(): void;
}

// Fullscreen uses an RN <Modal> rather than reparenting the native view: the
// native view isn't a ViewGroup, and reparenting outside RN's root breaks touch
// handling (overlay buttons become untappable). Wrapping it in a <View> toggled
// into a <Modal> keeps everything inside RN's tree.
//
// VideoPlayerView is a preset over the bare <VideoView> primitive, owning the
// fullscreen modal, default chrome, and enterFullscreen/exitFullscreen API.
export const VideoPlayerView = forwardRef<
  VideoPlayerViewRef,
  VideoPlayerViewProps
>(function VideoPlayerView(
  {
    player,
    children,
    style,
    videoAspectRatio,
    controls = true,
    miniControls = true,
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

  // The shared MoQ video output is keyed by broadcastPath, so on fullscreen
  // toggle the underlying layer/surface re-attaches to the remounted instance
  // (with a possible brief black frame during the transition).
  const native = <VideoView player={player} style={StyleSheet.absoluteFill} />;

  if (isFullscreen) {
    // Letterbox to fit the window while preserving aspect ratio; Android's
    // SurfaceView would otherwise stretch the buffer to the window shape.
    const aspect = videoAspectRatio ?? 16 / 9;
    const screenAspect = windowWidth / windowHeight;
    const fitBox =
      screenAspect > aspect
        ? { width: windowHeight * aspect, height: windowHeight }
        : { width: windowWidth, height: windowWidth / aspect };

    const controlsElement: ReactNode =
      controls === false ? null : controls === true ? (
        <FullscreenControls />
      ) : (
        controls
      );

    return (
      <Modal
        visible
        animationType="fade"
        // Extend behind the hidden status bar on Android so chrome sits flush.
        statusBarTranslucent
        supportedOrientations={[
          'portrait',
          'portrait-upside-down',
          'landscape',
          'landscape-left',
          'landscape-right',
        ]}
        onRequestClose={exitFullscreen}
      >
        <StatusBar hidden animated />
        {/* Insets don't propagate across the Modal boundary, so mount a fresh
              provider. The initialMetrics seed avoids a 0-inset first frame. */}
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <FullscreenStage
            player={player}
            controls={controlsElement}
            onExit={exitFullscreen}
            fitBox={fitBox}
            video={native}
            overlay={children}
          />
        </SafeAreaProvider>
      </Modal>
    );
  }

  const miniControlsElement: ReactNode =
    miniControls === false ? null : miniControls === true ? (
      <MiniPlayerControls />
    ) : (
      miniControls
    );

  return (
    <View style={style} {...rest}>
      <MiniStage
        player={player}
        controls={miniControlsElement}
        onEnterFullscreen={enterFullscreen}
        video={native}
        overlay={children}
        videoAspectRatio={videoAspectRatio ?? 16 / 9}
      />
    </View>
  );
});

/**
 * Fullscreen visual layout: black backdrop, letterboxed video, tap-to-toggle
 * controls with fade, and overlay children. Split out so the controls state is
 * created fresh each time fullscreen is entered.
 */
function FullscreenStage({
  player,
  controls,
  onExit,
  fitBox,
  video,
  overlay,
}: {
  player: Player;
  controls: ReactNode;
  onExit: () => void;
  fitBox: { width: number; height: number };
  video: ReactNode;
  /** Overlay children, rendered above everything at container level (not
   *  clipped to the letterbox). */
  overlay: ReactNode;
}) {
  const { visible, show, opacity, onBackgroundPress } = useAutoHideControls(
    controls != null
  );

  const api = useMemo(
    () => ({ visible, show, exit: onExit, player }),
    [visible, show, onExit, player]
  );

  return (
    <FullscreenContext.Provider value={api}>
      <View style={styles.fullscreenContainer}>
        <View style={fitBox}>{video}</View>

        {controls != null && (
          <ControlsLayer
            visible={visible}
            opacity={opacity}
            onBackgroundPress={onBackgroundPress}
          >
            {controls}
          </ControlsLayer>
        )}

        {overlay}
      </View>
    </FullscreenContext.Provider>
  );
}

/**
 * Inline (non-fullscreen) visual layout: native video, tap-to-toggle controls
 * with the same auto-hide fade as FullscreenStage, and overlay children. Split
 * out so the controls state is created fresh each time the inline view mounts.
 */
function MiniStage({
  player,
  controls,
  onEnterFullscreen,
  video,
  overlay,
  videoAspectRatio,
}: {
  player: Player;
  controls: ReactNode;
  onEnterFullscreen: () => void;
  video: ReactNode;
  overlay: ReactNode;
  /** Letterbox aspect ratio so Android's SurfaceView doesn't stretch the
   *  buffer to the container shape. */
  videoAspectRatio: number;
}) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null
  );
  const { visible, show, opacity, onBackgroundPress } = useAutoHideControls(
    controls != null
  );

  const api = useMemo(
    () => ({ visible, show, enterFullscreen: onEnterFullscreen, player }),
    [visible, show, onEnterFullscreen, player]
  );

  // Letterbox the video so Android's SurfaceView doesn't stretch the buffer to
  // the container shape; a no-op on iOS beyond the wrapper (native videoGravity).
  let fitBox: { width: number; height: number } | null = null;
  if (size != null && size.width > 0 && size.height > 0) {
    const containerAspect = size.width / size.height;
    fitBox =
      containerAspect > videoAspectRatio
        ? {
            width: size.height * videoAspectRatio,
            height: size.height,
          }
        : {
            width: size.width,
            height: size.width / videoAspectRatio,
          };
  }

  return (
    <MiniPlayerContext.Provider value={api}>
      <View
        style={styles.miniVideoContainer}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setSize((prev) =>
            prev != null && prev.width === width && prev.height === height
              ? prev
              : { width, height }
          );
        }}
      >
        {fitBox != null && <View style={fitBox}>{video}</View>}
      </View>
      {controls != null && (
        <ControlsLayer
          visible={visible}
          opacity={opacity}
          onBackgroundPress={onBackgroundPress}
        >
          {controls}
        </ControlsLayer>
      )}
      {overlay}
    </MiniPlayerContext.Provider>
  );
}

const styles = StyleSheet.create({
  fullscreenContainer: {
    flex: 1,
    backgroundColor: 'black',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniVideoContainer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
