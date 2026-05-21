import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  BroadcastPickerView,
  getSupportedCodecs,
  PublisherView,
  usePublisher,
  type AudioCodec,
  type CameraPosition,
  type VideoCodec,
} from 'react-native-moq';

const SUPPORTED_CODECS = getSupportedCodecs();

// Landscape dimensions — Android's camera capture produces landscape frames
// and the native default is 1280x720. Forcing portrait here caused the
// Publisher to self-stop immediately on Android.
type VideoResolution = 'HD' | 'FHD';
const RESOLUTIONS: Record<
  VideoResolution,
  { width: number; height: number; label: string }
> = {
  HD: { width: 720, height: 1280, label: 'HD (720p)' },
  FHD: { width: 1080, height: 1920, label: 'FHD (1080p)' },
};

const FRAME_RATES = [24, 30, 60] as const;
type FrameRate = (typeof FRAME_RATES)[number];

const SAMPLE_RATES = [44100, 48000] as const;
type SampleRate = (typeof SAMPLE_RATES)[number];

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

  // Prefer H.265 when the device can actually initialize it, else fall back
  // to H.264. Mirrors moq-kit's iOS demo CodecConfigView gating.
  const [videoCodec, setVideoCodec] = useState<VideoCodec>(
    SUPPORTED_CODECS.video.includes('h265') ? 'h265' : 'h264'
  );
  const [videoResolution, setVideoResolution] = useState<VideoResolution>('HD');
  const [frameRate, setFrameRate] = useState<FrameRate>(30);
  const [audioCodec, setAudioCodec] = useState<AudioCodec>(
    SUPPORTED_CODECS.audio.includes('opus') ? 'opus' : 'aac'
  );
  const [audioSampleRate, setAudioSampleRate] = useState<SampleRate>(48000);

  // Opus is fixed at 48 kHz — mirror moq-kit demo's behaviour.
  useEffect(() => {
    if (audioCodec === 'opus' && audioSampleRate !== 48000) {
      setAudioSampleRate(48000);
    }
  }, [audioCodec, audioSampleRate]);

  const encoderOpts = useMemo(
    () => ({
      videoCodec,
      width: RESOLUTIONS[videoResolution].width,
      height: RESOLUTIONS[videoResolution].height,
      framerate: frameRate,
      audioCodec,
      audioSampleRate,
    }),
    [videoCodec, videoResolution, frameRate, audioCodec, audioSampleRate]
  );

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
      ...encoderOpts,
    });
  }, [publisher, screenPath, url, encoderOpts]);

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

      {!isPublishing && (
        <View style={styles.settingsCard}>
          <Text style={styles.sectionLabel}>VIDEO CODEC</Text>
          <Segmented
            value={videoCodec}
            options={[
              {
                value: 'h264',
                label: 'H.264',
                disabled: !SUPPORTED_CODECS.video.includes('h264'),
              },
              {
                value: 'h265',
                label: 'H.265',
                disabled: !SUPPORTED_CODECS.video.includes('h265'),
              },
            ]}
            onChange={setVideoCodec}
          />

          <Text style={styles.sectionLabel}>RESOLUTION</Text>
          <Segmented
            value={videoResolution}
            options={(Object.keys(RESOLUTIONS) as VideoResolution[]).map(
              (r) => ({ value: r, label: RESOLUTIONS[r].label })
            )}
            onChange={setVideoResolution}
          />

          <Text style={styles.sectionLabel}>FRAME RATE</Text>
          <Segmented
            value={frameRate}
            options={FRAME_RATES.map((r) => ({
              value: r,
              label: `${r} fps`,
            }))}
            onChange={setFrameRate}
          />

          <Text style={styles.sectionLabel}>AUDIO CODEC</Text>
          <Segmented
            value={audioCodec}
            options={[
              {
                value: 'opus',
                label: 'Opus',
                disabled: !SUPPORTED_CODECS.audio.includes('opus'),
              },
              {
                value: 'aac',
                label: 'AAC',
                disabled: !SUPPORTED_CODECS.audio.includes('aac'),
              },
            ]}
            onChange={setAudioCodec}
          />

          <Text style={styles.sectionLabel}>SAMPLE RATE</Text>
          <Segmented
            value={audioSampleRate}
            options={SAMPLE_RATES.map((r) => ({
              value: r,
              label: r === 44100 ? '44.1 kHz' : '48 kHz',
            }))}
            onChange={setAudioSampleRate}
            disabled={audioCodec === 'opus'}
          />
        </View>
      )}

      <Button
        title={isPublishing ? 'Stop' : 'Publish'}
        onPress={() => {
          if (isPublishing) {
            publisher.stop();
          } else if (canPublish) {
            publisher.publish({
              path,
              cameraEnabled,
              micEnabled,
              ...encoderOpts,
            });
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

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (next: T) => void;
  disabled?: boolean;
}) {
  return (
    <View style={[styles.segmented, disabled && styles.segmentedDisabled]}>
      {options.map((opt) => {
        const selected = opt.value === value;
        const optDisabled = disabled || opt.disabled;
        return (
          <Pressable
            key={String(opt.value)}
            onPress={() => !optDisabled && onChange(opt.value)}
            style={[
              styles.segment,
              selected && styles.segmentSelected,
              opt.disabled && !disabled && styles.segmentItemDisabled,
            ]}
          >
            <Text
              style={[
                styles.segmentLabel,
                selected && styles.segmentLabelSelected,
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
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
  settingsCard: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    gap: 6,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 6,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
    padding: 2,
  },
  segmentedDisabled: { opacity: 0.4 },
  segmentItemDisabled: { opacity: 0.35 },
  segment: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 6,
  },
  segmentSelected: { backgroundColor: '#fff' },
  segmentLabel: { fontSize: 13, color: '#6b7280' },
  segmentLabelSelected: { color: '#111827', fontWeight: '600' },
});
