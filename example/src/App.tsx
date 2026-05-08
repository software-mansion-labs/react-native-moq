import { useEffect, useRef, useState } from 'react';
import {
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  useBroadcasts,
  useEventListener,
  useSession,
  type Session,
} from 'react-native-moq';
import { BroadcastPlayer } from './BroadcastPlayer';
import { EventLog, useEventLog, type AddEntry } from './EventLog';
import { StateIndicator } from './StateIndicator';

type Mode = 'video' | 'audio';
type ActivePlayer = { path: string; initialMode: Mode };

export default function App() {
  const [url, setUrl] = useState('http://192.168.1.48:4443');
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
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.container}>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            placeholder="Relay URL"
            autoCapitalize="none"
            autoCorrect={false}
            editable={canConnect}
          />

          <Button
            title={canConnect ? 'Connect' : 'Disconnect'}
            onPress={canConnect ? () => session.connect() : session.disconnect}
          />

          <StateIndicator state={session.state} />

          {isConnected && (
            <Button
              title={isSubscribed ? 'Unsubscribe' : 'Subscribe'}
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

          <EventLog entries={log} />

          {isConnected && !isSubscribed && (
            <Text style={styles.noBroadcasts}>
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
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// Mounting this component ref-counts a `useBroadcasts(session, '')` subscription
// — the underlying native subscription is created on mount and torn down on
// unmount.  Multiple instances with the same prefix would share one native sub.
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

  // Diff the broadcasts array against the previous render to mirror the old
  // broadcastAvailable / broadcastUnavailable session events into the event log.
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
    return <Text style={styles.noBroadcasts}>No broadcasts available</Text>;
  }

  return (
    <>
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
          <View key={broadcast.path} style={styles.availableCard}>
            <Text style={styles.broadcastPath}>{broadcast.path}</Text>
            <View style={styles.availableButtons}>
              <Button
                title="Video"
                onPress={() => addPlayer(broadcast.path, 'video')}
              />
              <Button
                title="Audio only"
                onPress={() => addPlayer(broadcast.path, 'audio')}
              />
            </View>
          </View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    padding: 16,
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  noBroadcasts: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    paddingVertical: 8,
  },
  availableCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  availableButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  broadcastPath: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
});
