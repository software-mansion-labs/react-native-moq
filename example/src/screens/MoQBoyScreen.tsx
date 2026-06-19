import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  useBroadcasts,
  useDataTrack,
  usePublisher,
  useSession,
  useVideoPlayer,
  type BroadcastInfo,
  type Session,
} from 'react-native-moq';
import { BoyConsole, type BoyConsoleProps } from '../boy/BoyConsole';
import { useBoyCommands } from '../boy/useBoyCommands';
import type { BoyGame } from '../boy/types';

// Props shared by both the idle console and the live game session — everything
// except the player/controller wiring that only exists while a game is running.
type SharedConsoleProps = Omit<
  BoyConsoleProps,
  'player' | 'controlsEnabled' | 'onButton' | 'lastError'
>;

// MoQBoy — a cloud-gaming client ported from moq-kit's iOS demo
// (MoQDemo/Features/Boy). Discovers game broadcasts under the `boy` prefix,
// plays the selected game's video/audio as the console screen, and publishes a
// `command` data track to `viewer/boy/<game>/<viewerId>` carrying button input.
const SUBSCRIBE_PREFIX = 'boy';
const VIEWER_PREFIX = 'viewer/boy';
// Dedicated Boy relay, hardcoded like MoQDemo's MoQDemoRelayURLs.boyDemoURL.
const BOY_RELAY_URL = 'https://cdn.moq.dev/demo';

function lastComponent(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path;
}

function makeViewerId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function MoQBoyScreen() {
  const session = useSession(BOY_RELAY_URL);
  const isConnected = session.state === 'connected';
  const isConnecting = session.state === 'connecting';
  const canStop = isConnected || isConnecting;

  const broadcasts = useBroadcasts(session, SUBSCRIBE_PREFIX);
  const games = useMemo<BoyGame[]>(
    () =>
      broadcasts
        .map((b) => {
          const component = lastComponent(b.path);
          return { name: component, broadcastPath: b.path, component };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    [broadcasts]
  );

  // `selectedGamePath` tracks the user's choice (drives the flip + cartridge
  // highlight immediately); `activeGamePath` is the game actually mounted and
  // playing — it only updates once the console settles facing front, so a
  // VideoView never initializes behind a hidden / 3D-rotated face (the
  // AVSampleBufferDisplayLayer freezes on a stale frame if it does).
  const [selectedGamePath, setSelectedGamePath] = useState<string | null>(null);
  const [activeGamePath, setActiveGamePath] = useState<string | null>(null);
  const [latency, setLatency] = useState(200);
  const [showsBack, setShowsBack] = useState(false);
  const toggleFlip = useCallback(() => setShowsBack((b) => !b), []);

  // Insert: flip to the front; the game mounts when the flip lands (below).
  // Eject (null): drop the game immediately and stay on the back to pick again.
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
        subtitle: 'Slide the switch at the top to connect this console.',
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

  const common: SharedConsoleProps = {
    isConnected,
    isConnecting,
    canStop,
    onPower,
    selectedGameName,
    placeholder,
    games,
    selectedGamePath,
    onSelectGame,
    latency,
    onLatencyChange: setLatency,
    showsBack,
    onToggleFlip: toggleFlip,
    onFlipSettled,
  };

  return (
    <View style={styles.container}>
      {activeBroadcast ? (
        <BoyGameSession
          key={activeBroadcast.path}
          broadcast={activeBroadcast}
          session={session}
          latency={latency}
          common={common}
        />
      ) : (
        <BoyConsole
          {...common}
          player={null}
          controlsEnabled={false}
          onButton={() => {}}
          lastError={null}
        />
      )}
    </View>
  );
}

// Mounted only while a cartridge is inserted (keyed on broadcast path). Owns the
// video player and the controller publisher for the selected game — mirrors
// moq-kit's startSelectedGame / startCommandPublishing.
function BoyGameSession({
  broadcast,
  session,
  latency,
  common,
}: {
  broadcast: BroadcastInfo;
  session: Session;
  latency: number;
  common: SharedConsoleProps;
}) {
  const player = useVideoPlayer(broadcast, (p) => p.play());

  // Prefer the highest-resolution rendition (moq-kit's preferredTracks), but
  // only once playback has actually started — switching synchronously with
  // play() races the initial subscription and can freeze the stream.
  const { addListener, switchVideoTrack } = player;
  useEffect(() => {
    let switched = false;
    const sub = addListener('playingChange', ({ isPlaying }) => {
      if (!isPlaying || switched) return;
      switched = true;
      const best = [...broadcast.videoTracks].sort(
        (a, b) =>
          (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0)
      )[0];
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

  // Publish the controller as a single-data-track broadcast to a per-viewer
  // path. Stops when the cartridge is ejected or the console powers off.
  useEffect(() => {
    const viewerPath = `${VIEWER_PREFIX}/${lastComponent(broadcast.path)}/${makeViewerId()}`;
    publisher.publish({ path: viewerPath, tracks: [dataTrack] });
    return () => publisher.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [broadcast.path]);

  // Apply the screen's latency control to the live player.
  const { updateTargetLatency, stop: stopPlayer } = player;
  useEffect(() => {
    updateTargetLatency(latency);
  }, [latency, updateTargetLatency]);

  // Tear the player down when the cartridge is ejected or swapped, freeing the
  // native subscription (mirrors moq-kit's BroadcastEntry.stop()).
  useEffect(() => stopPlayer, [stopPlayer]);

  const controlsEnabled = publisher.state === 'publishing';
  const { setButton } = useBoyCommands(dataTrack, controlsEnabled);

  return (
    <BoyConsole
      {...common}
      player={player}
      controlsEnabled={controlsEnabled}
      onButton={setButton}
      lastError={publisher.lastError}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
});
