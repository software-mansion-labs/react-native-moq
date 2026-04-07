import { useState } from 'react';
import { Button, Text, View, StyleSheet } from 'react-native';
import { getSessionState, setSessionState } from 'react-native-moq';

const SESSION_STATES = [
  'idle',
  'connecting',
  'connected',
  'closed',
  'error:connection failed',
];

export default function App() {
  const [state, setState] = useState(() => getSessionState());

  function onSetRandomState() {
    const next =
      SESSION_STATES[Math.floor(Math.random() * SESSION_STATES.length)]!;
    setSessionState(next);
    setState(getSessionState());
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Session state:</Text>
      <Text style={styles.state}>{state}</Text>
      <Button title="Set random state" onPress={onSetRandomState} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  label: {
    fontSize: 16,
    color: '#666',
  },
  state: {
    fontSize: 20,
    fontWeight: 'bold',
  },
});
