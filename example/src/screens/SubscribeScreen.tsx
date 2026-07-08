import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  useBroadcasts,
  useEventListener,
  useSession,
  type Session,
} from 'react-native-moq';
import { BroadcastPlayer } from '../components/BroadcastPlayer';
import { EventLog, useEventLog, type AddEntry } from '../components/EventLog';
import { StateIndicator } from '../components/StateIndicator';
import {
  Button,
  Card,
  IconButton,
  Input,
  ScreenTitle,
  SectionHeader,
} from '../components/ui';
import { useTheme } from '../theme';

type Mode = 'video' | 'audio';
type ActivePlayer = { path: string; initialMode: Mode };

export function SubscribeScreen({
  url,
  setUrl,
}: {
  url: string;
  setUrl: (url: string) => void;
}) {
  const { colors } = useTheme();
  const [activePlayers, setActivePlayers] = useState<ActivePlayer[]>([]);
  const [isSubscribed, setIsSubscribed] = useState(false);

  const session = useSession(url);

  const canConnect = session.state === 'idle' || session.state === 'closed';
  const isConnected = session.state === 'connected';

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
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="automatic"
    >
      <ScreenTitle title="Subscribe" />

      <Card>
        <SectionHeader title="Connection" />
        <Input
          value={url}
          onChangeText={setUrl}
          placeholder="Relay URL"
          autoCapitalize="none"
          autoCorrect={false}
          editable={canConnect}
        />
        <View style={styles.connectRow}>
          <StateIndicator state={session.state} />
          <Button
            title={canConnect ? 'Connect' : 'Disconnect'}
            icon={canConnect ? 'link' : 'link-off'}
            variant={canConnect ? 'filled' : 'tonal'}
            destructive={!canConnect}
            onPress={canConnect ? () => session.connect() : session.disconnect}
          />
        </View>
        {isConnected && (
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
        )}
      </Card>

      <EventLog entries={log} />

      {isConnected && !isSubscribed && (
        <Text style={[styles.emptyText, { color: colors.tertiaryLabel }]}>
          Subscribe to discover broadcasts
        </Text>
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
    </ScrollView>
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
  const { colors } = useTheme();
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
      <Text style={[styles.emptyText, { color: colors.tertiaryLabel }]}>
        No broadcasts available
      </Text>
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
          <Card key={broadcast.path} style={styles.availableCard}>
            <Text
              style={[styles.broadcastPath, { color: colors.label }]}
              numberOfLines={1}
            >
              {broadcast.path}
            </Text>
            <View style={styles.availableButtons}>
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
            </View>
          </Card>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 16, gap: 12 },
  connectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 8,
  },
  availableCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  broadcastPath: { flex: 1, fontSize: 14, fontWeight: '600' },
  availableButtons: { flexDirection: 'row', gap: 8 },
});
