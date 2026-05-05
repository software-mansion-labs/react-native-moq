import { useEffect, useState } from 'react';
import {
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useEventListener, useSession } from 'react-native-moq';
import { BroadcastPlayer } from './BroadcastPlayer';
import { EventLog, useEventLog } from './EventLog';
import { StateIndicator } from './StateIndicator';

export default function App() {
  const [url, setUrl] = useState('http://192.168.1.48:4443');
  const [activePaths, setActivePaths] = useState<string[]>([]);

  const session = useSession(url);

  const canConnect =
    session.sessionState === 'idle' || session.sessionState === 'closed';

  useEffect(() => {
    if (canConnect) {
      setActivePaths([]);
    }
  }, [canConnect]);

  const addPlayer = (path: string) => setActivePaths((prev) => [...prev, path]);
  const removePlayer = (path: string) =>
    setActivePaths((prev) => prev.filter((p) => p !== path));

  const [log, addEntry] = useEventLog();

  useEventListener(session, 'stateChange', ({ state }) => {
    addEntry('stateChange', state);
  });

  useEventListener(session, 'broadcastAvailable', ({ path }) => {
    addEntry('broadcastAvailable', path);
  });

  useEventListener(session, 'broadcastUnavailable', ({ path }) => {
    addEntry('broadcastUnavailable', path);
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

          <StateIndicator state={session.sessionState} />

          <EventLog entries={log} />

          {session.sessionState === 'connected' &&
            session.broadcasts.length === 0 && (
              <Text style={styles.noBroadcasts}>No broadcasts available</Text>
            )}

          {session.broadcasts.map((broadcast) =>
            activePaths.includes(broadcast.path) ? (
              <BroadcastPlayer
                key={broadcast.path}
                broadcast={broadcast}
                onRemove={() => removePlayer(broadcast.path)}
                addEntry={addEntry}
              />
            ) : (
              <View key={broadcast.path} style={styles.availableCard}>
                <Text style={styles.broadcastPath}>{broadcast.path}</Text>
                <Button
                  title="Show player"
                  onPress={() => addPlayer(broadcast.path)}
                />
              </View>
            )
          )}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
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
  },
  broadcastPath: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
});
