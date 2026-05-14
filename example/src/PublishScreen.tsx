import { useEffect, useState } from 'react';
import {
  Button,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  PublisherView,
  usePublisher,
  type CameraPosition,
} from 'react-native-moq';

async function requestCapturePermissions() {
  if (Platform.OS !== 'android') return;
  await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.CAMERA,
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  ]);
}

export function PublishScreen({
  url,
  setUrl,
}: {
  url: string;
  setUrl: (url: string) => void;
}) {
  const [path, setPath] = useState('live/test');
  const [cameraPosition, setCameraPosition] = useState<CameraPosition>('front');
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);

  const publisher = usePublisher(url);

  useEffect(() => {
    requestCapturePermissions();
  }, []);

  const isPublishing =
    publisher.state === 'publishing' || publisher.state === 'connecting';
  const canPublish =
    !isPublishing && (cameraEnabled || micEnabled) && path.length > 0;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TextInput
        style={styles.input}
        value={url}
        onChangeText={setUrl}
        placeholder="Relay URL"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!isPublishing}
      />
      <TextInput
        style={styles.input}
        value={path}
        onChangeText={setPath}
        placeholder="Broadcast path (e.g. live/test)"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!isPublishing}
      />

      <View style={styles.preview}>
        <PublisherView
          style={StyleSheet.absoluteFill}
          cameraPosition={cameraPosition}
        />
        <View style={styles.previewControls}>
          <Button
            title="Flip"
            onPress={() => {
              setCameraPosition((p) => (p === 'front' ? 'back' : 'front'));
            }}
          />
        </View>
      </View>

      <Row label="Camera">
        <Switch
          value={cameraEnabled}
          onValueChange={setCameraEnabled}
          disabled={isPublishing}
        />
      </Row>
      <Row label="Microphone">
        <Switch
          value={micEnabled}
          onValueChange={setMicEnabled}
          disabled={isPublishing}
        />
      </Row>

      <Button
        title={isPublishing ? 'Stop' : 'Publish'}
        onPress={() => {
          if (isPublishing) {
            publisher.stop();
          } else if (canPublish) {
            publisher.publish({ path, cameraEnabled, micEnabled });
          }
        }}
        disabled={!isPublishing && !canPublish}
      />

      <Text style={styles.stateLabel}>State: {publisher.state}</Text>
      {publisher.lastError && (
        <Text style={styles.error}>{publisher.lastError}</Text>
      )}

      {Object.entries(publisher.trackStates).map(([name, state]) => (
        <Text key={name} style={styles.trackState}>
          {name}: {state}
        </Text>
      ))}
    </ScrollView>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 16, gap: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  preview: {
    aspectRatio: 9 / 16,
    backgroundColor: '#000',
    borderRadius: 8,
    overflow: 'hidden',
  },
  previewControls: {
    position: 'absolute',
    bottom: 8,
    right: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  rowLabel: { fontSize: 14, color: '#374151' },
  stateLabel: { fontSize: 13, color: '#6b7280' },
  error: { fontSize: 13, color: '#dc2626' },
  trackState: { fontSize: 12, color: '#6b7280' },
});
