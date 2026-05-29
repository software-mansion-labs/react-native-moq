import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
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
import { VideoView, type Player } from 'react-native-moq';

export interface VideoPlayerViewProps extends ViewProps {
  player: Player;
  children?: ReactNode;
  // Aspect ratio (width / height) of the source video. Used to letterbox the
  // video inside the fullscreen modal so it isn't stretched to whatever shape
  // the device window happens to be. Defaults to 16/9 if not provided. iOS
  // letterboxes natively via the display layer's videoGravity, so this only
  // affects rendering inside the fullscreen modal.
  videoAspectRatio?: number;
  /**
   * Chrome shown while in fullscreen.
   *
   * - `true` (default): render the built-in `<FullscreenControls />`, styled
   *   to look like the native iOS / Android video player.
   * - `false`: no controls and no tap-to-toggle gesture.
   * - A ReactNode: replace the default chrome with your own element. It is
   *   wrapped in the same auto-hide fade as the default, and a tap on the
   *   video background toggles its visibility. Use `useFullscreenControls()`
   *   inside to read the same `{visible, show, exit, player}` API.
   *
   * For chrome shown while the player is inline (not fullscreen), see
   * `miniControls`.
   */
  controls?: boolean | ReactNode;
  /**
   * Chrome shown inline (when not fullscreen). Same shape as `controls`.
   *
   * - `true` (default): render the built-in `<MiniPlayerControls />` —
   *   a centered play/pause and a fullscreen-enter button in the bottom
   *   right, wrapped in the same tap-to-toggle auto-hide fade as the
   *   fullscreen chrome.
   * - `false`: no inline chrome and no tap-to-toggle gesture.
   * - A ReactNode: replace the default mini chrome. Use
   *   `useMiniPlayerControls()` inside to read the same
   *   `{visible, show, enterFullscreen, player}` API.
   */
  miniControls?: boolean | ReactNode;
  onFullscreenEnter?: () => void;
  onFullscreenExit?: () => void;
}

export interface VideoPlayerViewRef {
  enterFullscreen(): void;
  exitFullscreen(): void;
}

// Auto-hide timing for fullscreen controls. ~3.5s matches the AVPlayer
// default; the fade itself is short so it doesn't feel sluggish.
const CONTROLS_AUTO_HIDE_MS = 3500;
const CONTROLS_FADE_MS = 220;

// Fullscreen is implemented as an RN <Modal> rather than reparenting the
// native view. The native view (AVSampleBufferDisplayLayer / SurfaceView) is
// not a ViewGroup, and reparenting it outside RN's root view also breaks
// RN's touch handling, so any overlay buttons would be untappable. Wrapping
// the native view in a regular RN <View> and toggling that wrapper into a
// <Modal> keeps everything inside RN's tree — touches and child layout
// behave normally on both platforms.
//
// `<VideoPlayerView>` is a batteries-included preset built on top of the bare
// `<VideoView>` primitive. It owns the fullscreen modal, the default
// platform-styled chrome, and the imperative `enterFullscreen/exitFullscreen`
// API. For a no-frills surface you can wrap in your own UI, use `<VideoView>`.
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

  // The shared MoQ video output (the AVSampleBufferDisplayLayer on iOS,
  // the player Surface on Android) is keyed by broadcastPath, so when this
  // element remounts on fullscreen toggle the underlying layer/surface
  // simply re-attaches to the new instance. There may be a brief frame of
  // black during the transition; this is acceptable.
  const native = <VideoView player={player} style={StyleSheet.absoluteFill} />;

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

    // Resolve `controls` to either a ReactNode or null.
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
        // Lets the modal extend behind the (now hidden) status bar on
        // Android so the chrome sits flush against the top edge.
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
        {/* Hide the system status bar while fullscreen, matching how
              AVPlayerViewController and Media3 PlayerView present video. */}
        <StatusBar hidden animated />
        {/* `react-native-safe-area-context` doesn't propagate insets across
              the Modal boundary, so we mount a fresh provider here. The
              initialMetrics seed avoids a 0-inset first frame so the close
              button doesn't briefly snap into the notch before measuring. */}
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

  // Resolve `miniControls` the same way as `controls`: a boolean toggles the
  // built-in chrome, a ReactNode replaces it.
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
 * Hosts the actual fullscreen visual layout: black backdrop, letterboxed
 * video, tap-to-toggle controls layer with a fade, and the user's overlay
 * children. Split out so that the controls visibility state and animation
 * are created fresh each time fullscreen is entered.
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
  /** The native video element. Goes inside the letterboxed box. */
  video: ReactNode;
  /** User-provided overlay children. Rendered above everything, at the
   *  container level (not clipped to the letterbox). */
  overlay: ReactNode;
}) {
  const [visible, setVisible] = useState(true);
  const opacity = useRef(new Animated.Value(1)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const startHideTimer = useCallback(() => {
    clearHideTimer();
    hideTimer.current = setTimeout(() => {
      setVisible(false);
    }, CONTROLS_AUTO_HIDE_MS);
  }, [clearHideTimer]);

  const show = useCallback(() => {
    setVisible(true);
    startHideTimer();
  }, [startHideTimer]);

  // Start the auto-hide countdown when controls are present. If the user
  // opts out of controls entirely we skip the timer altogether (no fade,
  // no Pressable, nothing to dismiss).
  useEffect(() => {
    if (controls == null) return;
    startHideTimer();
    return clearHideTimer;
  }, [controls, startHideTimer, clearHideTimer]);

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: CONTROLS_FADE_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [visible, opacity]);

  const onBackgroundPress = useCallback(() => {
    if (visible) {
      // Tapping the video while controls are visible hides them right away,
      // matching the AVPlayer / PlayerView behavior.
      clearHideTimer();
      setVisible(false);
    } else {
      show();
    }
  }, [visible, show, clearHideTimer]);

  const api = useMemo(
    () => ({ visible, show, exit: onExit, player }),
    [visible, show, onExit, player]
  );

  return (
    <FullscreenContext.Provider value={api}>
      <View style={styles.fullscreenContainer}>
        <View style={fitBox}>{video}</View>

        {controls != null && (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onBackgroundPress}
            // Avoid the click sound on each tap-to-toggle on Android.
            android_disableSound
          >
            <Animated.View
              style={[StyleSheet.absoluteFill, { opacity }]}
              // When hidden the layer must let taps fall through to the
              // Pressable so the next tap brings controls back.
              pointerEvents={visible ? 'box-none' : 'none'}
            >
              {controls}
            </Animated.View>
          </Pressable>
        )}

        {/* User-provided overlay sits above the controls layer, with its
            own pointerEvents handling. Useful for e.g. a rendition picker
            anchored to a side of the screen. */}
        {overlay}
      </View>
    </FullscreenContext.Provider>
  );
}

/**
 * Hosts the inline (non-fullscreen) visual layout: the native video at
 * absolute-fill, a tap-to-toggle controls layer with the same auto-hide
 * fade as the fullscreen stage, and the user's overlay children. Split out
 * so the controls visibility state is created fresh each time the inline
 * view mounts (e.g. on fullscreen exit).
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
  /** The native video element. Styled to absolute-fill its parent. */
  video: ReactNode;
  /** User-provided overlay children. Rendered above the controls layer. */
  overlay: ReactNode;
  /** Aspect ratio used to letterbox the native video so Android's
   *  SurfaceView doesn't stretch the buffer to the container shape. */
  videoAspectRatio: number;
}) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null
  );
  const [visible, setVisible] = useState(true);
  const opacity = useRef(new Animated.Value(1)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const startHideTimer = useCallback(() => {
    clearHideTimer();
    hideTimer.current = setTimeout(() => {
      setVisible(false);
    }, CONTROLS_AUTO_HIDE_MS);
  }, [clearHideTimer]);

  const show = useCallback(() => {
    setVisible(true);
    startHideTimer();
  }, [startHideTimer]);

  useEffect(() => {
    if (controls == null) return;
    startHideTimer();
    return clearHideTimer;
  }, [controls, startHideTimer, clearHideTimer]);

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: CONTROLS_FADE_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [visible, opacity]);

  const onBackgroundPress = useCallback(() => {
    if (visible) {
      clearHideTimer();
      setVisible(false);
    } else {
      show();
    }
  }, [visible, show, clearHideTimer]);

  const api = useMemo(
    () => ({ visible, show, enterFullscreen: onEnterFullscreen, player }),
    [visible, show, onEnterFullscreen, player]
  );

  // Letterbox the native video inside its container, matching the fullscreen
  // stage. Android's SurfaceView would otherwise stretch the buffer to the
  // container's shape; iOS's display layer letterboxes natively via
  // videoGravity, so this is effectively a no-op there beyond the wrapper.
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
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onBackgroundPress}
          android_disableSound
        >
          <Animated.View
            style={[StyleSheet.absoluteFill, { opacity }]}
            pointerEvents={visible ? 'box-none' : 'none'}
          >
            {controls}
          </Animated.View>
        </Pressable>
      )}
      {/* Overlay sits above the controls layer, with its own pointerEvents
          handling. Useful for e.g. a rendition picker anchored to a side. */}
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
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
