import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import {
  useBroadcasts,
  useEventListener,
  useSession,
  type Session,
} from 'react-native-moq';
import { BroadcastPlayer } from '../components/BroadcastPlayer';
import { BroadcastRow } from '../components/BroadcastRow';
import { ConnectionCard, sessionFlags } from '../components/ConnectionCard';
import { EventLog, useEventLog, type AddEntry } from '../components/EventLog';
import {
  Button,
  Hint,
  IconButton,
  ScreenScroll,
  SectionHeader,
  TwoColumn,
} from '../components/ui';

type Mode = 'video' | 'audio';
type ActivePlayer = { path: string; initialMode: Mode };

export function SubscribeScreen({
  url,
  setUrl,
}: {
  url: string;
  setUrl: (url: string) => void;
}) {
  const [activePlayers, setActivePlayers] = useState<ActivePlayer[]>([]);
  const [isSubscribed, setIsSubscribed] = useState(false);

  const session = useSession(url);
  const { canConnect, isConnected } = sessionFlags(session);

  useEffect(() => {
    if (canConnect) {
      setActivePlayers([]);
      setIsSubscribed(false);
    }
  }, [canConnect]);

  const addPlayer = (path: string, initialMode: Mode) =>
    setActivePlayers((prev) =>
      prev.some((p) => p.path === path)
        ? prev
        : [...prev, { path, initialMode }]
    );
  const removePlayer = (path: string) =>
    setActivePlayers((prev) => prev.filter((p) => p.path !== path));

  const [log, addEntry] = useEventLog();

  useEventListener(session, 'stateChange', ({ state }) => {
    addEntry('stateChange', state);
  });

  return (
    <ScreenScroll>
      <TwoColumn
        left={
          <>
            <ConnectionCard
              session={session}
              url={url}
              setUrl={setUrl}
              urlEditable={canConnect}
              footer={
                isConnected && (
                  <Button
                    title={isSubscribed ? 'Unsubscribe' : 'Subscribe'}
                    icon={isSubscribed ? 'visibility-off' : 'visibility'}
                    variant="tonal"
                    onPress={() => {
                      if (isSubscribed) {
                        setIsSubscribed(false);
                        setActivePlayers([]);
                      } else {
                        setIsSubscribed(true);
                      }
                    }}
                  />
                )
              }
            />

            <EventLog entries={log} />
          </>
        }
        right={
          <>
            {isConnected && !isSubscribed && (
              <Hint tone="tertiary" style={styles.empty}>
                Subscribe to discover broadcasts
              </Hint>
            )}

            {isConnected && isSubscribed && (
              <BroadcastsList
                session={session}
                activePlayers={activePlayers}
                addPlayer={addPlayer}
                removePlayer={removePlayer}
                addEntry={addEntry}
              />
            )}
          </>
        }
      />
    </ScreenScroll>
  );
}

function BroadcastsList({
  session,
  activePlayers,
  addPlayer,
  removePlayer,
  addEntry,
}: {
  session: Session;
  activePlayers: ActivePlayer[];
  addPlayer: (path: string, mode: Mode) => void;
  removePlayer: (path: string) => void;
  addEntry: AddEntry;
}) {
  const broadcasts = useBroadcasts(session, '');

  const seenPaths = useRef<Set<string>>(new Set());
  useEffect(() => {
    const current = new Set(broadcasts.map((b) => b.path));
    current.forEach((path) => {
      if (!seenPaths.current.has(path)) addEntry('broadcastAvailable', path);
    });
    seenPaths.current.forEach((path) => {
      if (!current.has(path)) addEntry('broadcastUnavailable', path);
    });
    seenPaths.current = current;
  }, [broadcasts, addEntry]);

  if (broadcasts.length === 0) {
    return (
      <Hint tone="tertiary" style={styles.empty}>
        No broadcasts available
      </Hint>
    );
  }

  return (
    <>
      <SectionHeader title="Broadcasts" />
      {broadcasts.map((broadcast) => {
        const active = activePlayers.find((p) => p.path === broadcast.path);
        if (active) {
          return (
            <BroadcastPlayer
              key={broadcast.path}
              broadcast={broadcast}
              initialMode={active.initialMode}
              onRemove={() => removePlayer(broadcast.path)}
              addEntry={addEntry}
            />
          );
        }
        return (
          <BroadcastRow
            key={broadcast.path}
            path={broadcast.path}
            actions={
              <>
                <IconButton
                  icon="play-arrow"
                  accessibilityLabel={`Watch ${broadcast.path}`}
                  variant="filled"
                  onPress={() => addPlayer(broadcast.path, 'video')}
                />
                <IconButton
                  icon="headphones"
                  accessibilityLabel={`Listen to ${broadcast.path} (audio only)`}
                  onPress={() => addPlayer(broadcast.path, 'audio')}
                />
              </>
            }
          />
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  empty: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 8,
  },
});
