import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  useBroadcasts,
  useDataTrack,
  usePublisher,
  useSession,
  useVideoPlayer,
  type BroadcastInfo,
  type Player,
  type Session,
} from 'react-native-moq';
import { BoyConsole } from '../boy/BoyConsole';
import { useBoyCommands } from '../boy/useBoyCommands';
import type { BoyControl, BoyGame } from '../boy/types';
import { sortVideoTracksByResolution } from '../videoTracks';

// Wiring the headless BoyGameSession reports up to the single BoyConsole.
// VideoView only reads the player's stable sessionId/broadcastPath, so a
// snapshot of the player object is safe to hold in state.
type LiveGame = {
  path: string;
  player: Player;
  onButton: (control: BoyControl, isPressed: boolean) => void;
  lastError: string | null;
};

const noopButton = () => {};

// MoQBoy cloud-gaming client. Discovers game broadcasts under `boy`, plays the
// selected game as the console screen, and publishes a `command` data track to
// `viewer/boy/<game>/<viewerId>` carrying button input.
const SUBSCRIBE_PREFIX = 'boy';
const VIEWER_PREFIX = 'viewer/boy';
const BOY_RELAY_URL = 'https://cdn.moq.dev/demo';

function lastComponent(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path;
}

function makeViewerId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// Note: this screen's container must stay transparent. An opaque background on
// it makes iOS composite the header buttons into the same layer as the 3D flip
// animation, which corrupts them mid-flip. The native screen behind already
// follows light/dark.
export function MoQBoyScreen() {
  const session = useSession(BOY_RELAY_URL);
  const isConnected = session.state === 'connected';
  const isConnecting = session.state === 'connecting';
  const canStop = isConnected || isConnecting;

  const broadcasts = useBroadcasts(session, SUBSCRIBE_PREFIX);
  const games = useMemo<BoyGame[]>(
    () =>
      broadcasts
        .map((b) => ({ name: lastComponent(b.path), broadcastPath: b.path }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [broadcasts]
  );

  // `selectedGamePath` is the user's choice (drives the flip immediately);
  // `activeGamePath` is the mounted/playing game, updated only once the console
  // settles facing front so a VideoView never initializes behind a rotated face
  // (AVSampleBufferDisplayLayer would freeze on a stale frame).
  const [selectedGamePath, setSelectedGamePath] = useState<string | null>(null);
  const [activeGamePath, setActiveGamePath] = useState<string | null>(null);
  const [latency, setLatency] = useState(200);
  const [showsBack, setShowsBack] = useState(false);
  const toggleFlip = useCallback(() => setShowsBack((b) => !b), []);

  // Insert: flip to front (the game mounts once the flip lands). Eject: drop it
  // immediately and stay on the back to pick again.
  const onSelectGame = useCallback((path: string | null) => {
    setSelectedGamePath(path);
    if (path === null) setActiveGamePath(null);
    else setShowsBack(false);
  }, []);

  // Flip finished facing front — now it's safe to mount the chosen game.
  const onFlipSettled = useCallback(() => {
    setActiveGamePath(selectedGamePath);
  }, [selectedGamePath]);

  // Clear the inserted cartridge whenever the console powers down.
  useEffect(() => {
    if (!canStop) {
      setSelectedGamePath(null);
      setActiveGamePath(null);
      setShowsBack(false);
    }
  }, [canStop]);

  const onPower = () => {
    if (canStop) {
      setSelectedGamePath(null);
      setActiveGamePath(null);
      session.disconnect();
    } else {
      session.connect(latency);
    }
  };

  const activeBroadcast =
    isConnected && activeGamePath
      ? broadcasts.find((b) => b.path === activeGamePath)
      : undefined;

  const selectedGameName = selectedGamePath
    ? (games.find((g) => g.broadcastPath === selectedGamePath)?.name ??
      lastComponent(selectedGamePath))
    : null;

  const placeholder = useMemo(() => {
    if (isConnecting) {
      return {
        title: 'Powering on',
        subtitle: 'The relay session is starting up.',
      };
    }
    if (!isConnected) {
      return {
        title: 'Power is off',
        subtitle: 'Tap the power button at the top to connect this console.',
      };
    }
    if (selectedGameName) {
      return {
        title: `Waiting for ${selectedGameName}`,
        subtitle:
          'This cartridge will start as soon as its broadcast appears on the relay.',
      };
    }
    return {
      title: 'Insert a cartridge',
      subtitle: 'Choose a game below to start playing.',
    };
  }, [isConnected, isConnecting, selectedGameName]);

  // BoyGameSession is headless and the single BoyConsole below never
  // unmounts: swapping the console subtree on cartridge change blanked it
  // for a frame (visible flicker on Android) while the fresh mount
  // re-measured its layout. Gating `live` on the active path keeps a
  // stopping player out of VideoView during eject/swap.
  const [live, setLive] = useState<LiveGame | null>(null);
  const activeLive =
    activeBroadcast && live?.path === activeBroadcast.path ? live : null;

  return (
    <View style={styles.container}>
      {activeBroadcast && (
        <BoyGameSession
          key={activeBroadcast.path}
          broadcast={activeBroadcast}
          session={session}
          latency={latency}
          onLiveChange={setLive}
        />
      )}
      <BoyConsole
        isConnected={isConnected}
        isConnecting={isConnecting}
        canStop={canStop}
        onPower={onPower}
        selectedGameName={selectedGameName}
        placeholder={placeholder}
        games={games}
        selectedGamePath={selectedGamePath}
        onSelectGame={onSelectGame}
        latency={latency}
        onLatencyChange={setLatency}
        showsBack={showsBack}
        onToggleFlip={toggleFlip}
        onFlipSettled={onFlipSettled}
        player={activeLive?.player ?? null}
        controlsEnabled={activeLive != null}
        onButton={activeLive?.onButton ?? noopButton}
        lastError={activeLive?.lastError ?? null}
      />
    </View>
  );
}

// Mounted only while a cartridge is inserted (keyed on broadcast path). Owns
// the video player and the controller publisher for the selected game;
// renders nothing itself and reports its wiring via onLiveChange.
function BoyGameSession({
  broadcast,
  session,
  latency,
  onLiveChange,
}: {
  broadcast: BroadcastInfo;
  session: Session;
  latency: number;
  onLiveChange: (live: LiveGame | null) => void;
}) {
  const player = useVideoPlayer(broadcast, (p) => p.play());

  // Switch to the highest-resolution rendition, but only once playback started —
  // switching synchronously with play() races the subscription and can freeze.
  const { addListener, switchVideoTrack } = player;
  useEffect(() => {
    let switched = false;
    const sub = addListener('playingChange', ({ isPlaying }) => {
      if (!isPlaying || switched) return;
      switched = true;
      const best = sortVideoTracksByResolution(broadcast.videoTracks)[0];
      // Skip if the relay already started us on the best rendition.
      if (best && best.name !== broadcast.player.initialVideoTrackName) {
        switchVideoTrack(best.name);
      }
    });
    return () => sub.remove();
  }, [
    addListener,
    switchVideoTrack,
    broadcast.videoTracks,
    broadcast.player.initialVideoTrackName,
  ]);

  const publisher = usePublisher(session);
  const dataTrack = useDataTrack({ name: 'command' });

  // Publish the controller lazily on the first button press: announcing it is
  // what makes the relay close the transport on some setups, so browsing
  // cartridges must not publish. The first press may drop while connecting; the
  // repeat loop re-sends. Use the stable publish/stop callbacks, not the fresh
  // `publisher` object, or teardown would re-run stop() on every state change.
  const { publish: publishController, stop: stopController } = publisher;
  const viewerPath = useMemo(
    () => `${VIEWER_PREFIX}/${lastComponent(broadcast.path)}/${makeViewerId()}`,
    [broadcast.path]
  );
  const published = useRef(false);
  const ensurePublished = useCallback(() => {
    if (published.current) return;
    published.current = true;
    publishController({ path: viewerPath, tracks: [dataTrack] });
  }, [publishController, viewerPath, dataTrack]);

  // Stop the controller on unmount (cartridge ejected / swapped / powered off).
  useEffect(() => () => stopController(), [stopController]);

  const { updateTargetLatency, stop: stopPlayer } = player;
  useEffect(() => {
    updateTargetLatency(latency);
  }, [latency, updateTargetLatency]);

  // Tear the player down on eject/swap, freeing the native subscription.
  useEffect(() => stopPlayer, [stopPlayer]);

  const { setButton } = useBoyCommands(dataTrack, true);
  const onButton = useCallback(
    (control: BoyControl, isPressed: boolean) => {
      if (isPressed) ensurePublished();
      setButton(control, isPressed);
    },
    [ensurePublished, setButton]
  );

  // `player` is a fresh object every render (its reactive snapshot), so it
  // stays out of the deps; the ref hands the latest one to the rare syncs.
  const playerRef = useRef(player);
  playerRef.current = player;
  const { lastError } = publisher;
  useEffect(() => {
    onLiveChange({
      path: broadcast.path,
      player: playerRef.current,
      onButton,
      lastError,
    });
  }, [onLiveChange, broadcast.path, onButton, lastError]);
  useEffect(() => () => onLiveChange(null), [onLiveChange]);

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
});
