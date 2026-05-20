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
  BroadcastPickerView,
  PublisherView,
  usePublisher,
  type CameraPosition,
} from 'react-native-moq';

// Must match the App Group in MoQBroadcastUpload.entitlements +
// MoQExample.entitlements. iOS-only.
const SCREEN_APP_GROUP = 'group.moq.example.screenbroadcast';
// Must match the Broadcast Upload Extension's bundle identifier in pbxproj.
const SCREEN_PREFERRED_EXT = 'moq.example.MoQBroadcastUpload';
// Appended to the main broadcast path to derive the screen-share broadcast's
// path. Matches moq-kit's iOS demo convention.
const SCREEN_PATH_SUFFIX = '/screenshare';

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
  const [screenEnabled, setScreenEnabled] = useState(false);

  const publisher = usePublisher(url);

  useEffect(() => {
    requestCapturePermissions();
  }, []);

  const screenPath = path + SCREEN_PATH_SUFFIX;

  // Keep the native side's screen-broadcast descriptor in sync with the
  // current relay URL and derived screen path. On iOS this writes the App
  // Group descriptor the Broadcast Upload Extension reads at launch; on
  // Android it caches config for the next startScreenBroadcast() call.
  useEffect(() => {
    publisher.configureScreenBroadcast({
      path: screenPath,
      appGroupIdentifier: SCREEN_APP_GROUP,
      appAudio: true,
      mic: true,
    });
  }, [publisher, screenPath, url]);

  const screenBroadcasting =
    publisher.screenBroadcastState === 'broadcasting' ||
    publisher.screenBroadcastState === 'connecting';

  const isPublishing =
    publisher.state === 'publishing' || publisher.state === 'connecting';
  const canPublish =
    !isPublishing && (cameraEnabled || micEnabled) && path.length > 0;

  // On Android the toggle drives the foreground service directly (the system
  // consent dialog is part of startScreenBroadcast). On iOS the toggle only
  // expresses intent — the user must tap the system broadcast picker, and the
  // extension reports back its real state via screenBroadcastState.
  const onToggleScreen = (next: boolean) => {
    setScreenEnabled(next);
    if (Platform.OS === 'android') {
      if (next) {
        publisher.startScreenBroadcast().catch(() => setScreenEnabled(false));
      } else {
        publisher.stopScreenBroadcast();
      }
    } else if (!next && screenBroadcasting) {
      publisher.stopScreenBroadcast();
    }
  };

  // Reflect native screen state back into the toggle so iOS users see the
  // switch flip on when the system picker actually starts the broadcast, and
  // off when it stops.
  useEffect(() => {
    if (screenBroadcasting) setScreenEnabled(true);
    else if (
      publisher.screenBroadcastState === 'idle' ||
      publisher.screenBroadcastState === 'stopped'
    ) {
      setScreenEnabled(false);
    }
  }, [publisher.screenBroadcastState, screenBroadcasting]);

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
        editable={!isPublishing && !screenBroadcasting}
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
      <Row label="Screen">
        {Platform.OS === 'ios' ? (
          // RPSystemBroadcastPickerView IS the toggle on iOS — tapping it
          // opens the system sheet that starts/stops the extension.
          <BroadcastPickerView
            preferredExtension={SCREEN_PREFERRED_EXT}
            tintColor="#2563eb"
            style={styles.broadcastPicker}
          />
        ) : (
          <Switch value={screenEnabled} onValueChange={onToggleScreen} />
        )}
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

      <Text style={styles.stateLabel}>
        Screen: {publisher.screenBroadcastState} ({screenPath})
      </Text>
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
  broadcastPicker: { width: 44, height: 44 },
});
