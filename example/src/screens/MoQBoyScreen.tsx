import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
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
import { CartridgeTray } from '../boy/CartridgeTray';
import { useBoyCommands } from '../boy/useBoyCommands';
import type { BoyGame } from '../boy/types';

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

  const [selectedGamePath, setSelectedGamePath] = useState<string | null>(null);
  const [latency, setLatency] = useState(200);

  // Clear the inserted cartridge whenever the console powers down.
  useEffect(() => {
    if (!canStop) setSelectedGamePath(null);
  }, [canStop]);

  const onPower = () => {
    if (canStop) {
      setSelectedGamePath(null);
      session.disconnect();
    } else {
      session.connect(latency);
    }
  };

  const activeBroadcast =
    isConnected && selectedGamePath
      ? broadcasts.find((b) => b.path === selectedGamePath)
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

  const common: Omit<
    BoyConsoleProps,
    'player' | 'controlsEnabled' | 'onButton' | 'lastError'
  > = {
    isConnected,
    isConnecting,
    canStop,
    onPower,
    selectedGameName,
    placeholder,
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
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

      <CartridgeTray
        games={games}
        selectedGamePath={selectedGamePath}
        isConnected={isConnected}
        onSelectGame={setSelectedGamePath}
        latency={latency}
        onLatencyChange={setLatency}
      />

      <View style={styles.bottomSpacer} />
    </ScrollView>
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
  common: Omit<
    BoyConsoleProps,
    'player' | 'controlsEnabled' | 'onButton' | 'lastError'
  >;
}) {
  const player = useVideoPlayer(broadcast, (p) => {
    p.play();
    // Prefer the highest-resolution rendition, like moq-kit's preferredTracks.
    const best = [...broadcast.videoTracks].sort(
      (a, b) =>
        (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0)
    )[0];
    if (best) p.switchVideoTrack(best.name);
  });

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
  container: { flexGrow: 1, padding: 16, gap: 16 },
  bottomSpacer: { height: 24 },
});
