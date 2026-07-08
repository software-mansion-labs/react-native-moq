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
  PublisherView,
  getSupportedAudioCodecs,
  getSupportedVideoCodecs,
  isMultiCameraSupported,
  useAudioSource,
  useCamera,
  useMicrophone,
  useMultiCamera,
  usePublisher,
  useScreenBroadcast,
  useSession,
  useVideoSource,
  type AudioCodec,
  type PublishTrack,
  type VideoCodec,
} from 'react-native-moq';
import { TtsAudioSection } from '../components/TtsAudioSection';
import { CustomVideoSection } from '../components/CustomVideoSection';

const SUPPORTED_VIDEO = getSupportedVideoCodecs();
const SUPPORTED_AUDIO = getSupportedAudioCodecs();

// Landscape dimensions: forcing portrait made the Publisher self-stop on Android.
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

// Must match the App Group in the entitlements files (iOS-only).
const SCREEN_APP_GROUP = 'group.moq.example.screenbroadcast';
// Must match the Broadcast Upload Extension's bundle identifier in pbxproj.
const SCREEN_PREFERRED_EXT = 'moq.example.MoQBroadcastUpload';
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
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [customVideoEnabled, setCustomVideoEnabled] = useState(false);
  const [screenEnabled, setScreenEnabled] = useState(false);

  // Dual-camera is device-dependent; probe support before offering the mode.
  const [multiSupported, setMultiSupported] = useState(false);
  const [dualCamera, setDualCamera] = useState(false);
  useEffect(() => {
    isMultiCameraSupported()
      .then(setMultiSupported)
      .catch(() => {});
  }, []);

  // Prefer H.265 when supported, else fall back to H.264.
  const [videoCodec, setVideoCodec] = useState<VideoCodec>(
    SUPPORTED_VIDEO.includes('h265') ? 'h265' : 'h264'
  );
  const [videoResolution, setVideoResolution] = useState<VideoResolution>('HD');
  const [frameRate, setFrameRate] = useState<FrameRate>(30);
  const [audioCodec, setAudioCodec] = useState<AudioCodec>(
    SUPPORTED_AUDIO.includes('opus') ? 'opus' : 'aac'
  );
  const [audioSampleRate, setAudioSampleRate] = useState<SampleRate>(48000);

  // Opus is fixed at 48 kHz.
  useEffect(() => {
    if (audioCodec === 'opus' && audioSampleRate !== 48000) {
      setAudioSampleRate(48000);
    }
  }, [audioCodec, audioSampleRate]);

  useEffect(() => {
    requestCapturePermissions();
  }, []);

  // Both camera hooks stay mounted; `enabled` runs hardware only for the active
  // mode, since concurrent single + multi capture would conflict.
  const cameraConfig = {
    videoCodec,
    width: RESOLUTIONS[videoResolution].width,
    height: RESOLUTIONS[videoResolution].height,
    framerate: frameRate,
  };
  const camera = useCamera({ ...cameraConfig, enabled: !dualCamera });
  const multiCamera = useMultiCamera({ ...cameraConfig, enabled: dualCamera });
  const microphone = useMicrophone({ audioCodec, audioSampleRate });
  // Custom audio track fed by synthesized speech. Always 48 kHz mono; TTS output
  // is resampled to match in TtsAudioSection.
  const ttsAudio = useAudioSource({
    name: 'tts',
    audioCodec,
    sampleRate: 48000,
    channels: 1,
  });
  // Custom video track fed by an app-rendered frame source. Here the example
  // drives a native test pattern (see CustomVideoSection); a real app would
  // render into the pool's buffers with its own GPU engine. 24 fps matches
  // CustomVideoSection's push cadence.
  const customVideo = useVideoSource({
    name: 'custom',
    videoCodec,
    width: RESOLUTIONS[videoResolution].width,
    height: RESOLUTIONS[videoResolution].height,
    framerate: 24,
    poolSize: 3,
  });

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

  const session = useSession(url);
  const publisher = usePublisher(session);

  // Open the session on mount so publish() has a connection to reuse (it errors
  // if the session isn't connected).
  useEffect(() => {
    if (session.state === 'idle' || session.state === 'closed') {
      session.connect();
    }
  }, [session]);

  const screenPath = path + SCREEN_PATH_SUFFIX;

  const screen = useScreenBroadcast(session, {
    path: screenPath,
    appGroupIdentifier: SCREEN_APP_GROUP,
    appAudio: true,
    mic: true,
    ...encoderOpts,
  });

  const screenBroadcasting =
    screen.state === 'broadcasting' || screen.state === 'connecting';

  const isPublishing =
    publisher.state === 'publishing' || publisher.state === 'connecting';
  const canPublish =
    !isPublishing &&
    (cameraEnabled || micEnabled || ttsEnabled || customVideoEnabled) &&
    path.length > 0;

  // Android: the toggle drives the foreground service directly. iOS: the toggle
  // is only intent — the user taps the system picker, which reports state back.
  const onToggleScreen = (next: boolean) => {
    setScreenEnabled(next);
    if (Platform.OS === 'android') {
      if (next) {
        screen.start().catch(() => setScreenEnabled(false));
      } else {
        screen.stop();
      }
    } else if (!next && screenBroadcasting) {
      screen.stop();
    }
  };

  // Reflect native screen state into the toggle so the iOS switch follows the
  // system picker.
  useEffect(() => {
    if (screenBroadcasting) setScreenEnabled(true);
    else if (screen.state === 'idle' || screen.state === 'stopped') {
      setScreenEnabled(false);
    }
  }, [screen.state, screenBroadcasting]);

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

      {dualCamera ? (
        <View style={styles.dualPreview}>
          <View style={[styles.preview, styles.dualPreviewItem]}>
            <PublisherView
              style={StyleSheet.absoluteFill}
              camera={multiCamera.front}
            />
            <Text style={styles.previewBadge}>FRONT</Text>
          </View>
          <View style={[styles.preview, styles.dualPreviewItem]}>
            <PublisherView
              style={StyleSheet.absoluteFill}
              camera={multiCamera.back}
            />
            <Text style={styles.previewBadge}>BACK</Text>
          </View>
        </View>
      ) : (
        <View style={styles.preview}>
          <PublisherView style={StyleSheet.absoluteFill} camera={camera} />
          <View style={styles.previewControls}>
            <Button title="Flip" onPress={camera.flip} />
          </View>
        </View>
      )}

      <Row label="Camera">
        <Switch
          value={cameraEnabled}
          onValueChange={setCameraEnabled}
          disabled={isPublishing}
        />
      </Row>
      <Row label="Dual camera (front + back)">
        <Switch
          value={dualCamera}
          onValueChange={setDualCamera}
          disabled={isPublishing || !cameraEnabled || !multiSupported}
        />
      </Row>
      <Row label="Microphone">
        <Switch
          value={micEnabled}
          onValueChange={setMicEnabled}
          disabled={isPublishing}
        />
      </Row>
      <Row label="Text-to-speech audio">
        <Switch
          value={ttsEnabled}
          onValueChange={setTtsEnabled}
          disabled={isPublishing}
        />
      </Row>

      {ttsEnabled && (
        <TtsAudioSection
          audioSource={ttsAudio}
          enabled={ttsEnabled}
          publishing={isPublishing}
          trackState={publisher.trackStates.tts}
        />
      )}

      <Row label="Custom video (test pattern)">
        <Switch
          value={customVideoEnabled}
          onValueChange={setCustomVideoEnabled}
          disabled={isPublishing}
        />
      </Row>

      {customVideoEnabled && (
        <CustomVideoSection
          videoSource={customVideo}
          enabled={customVideoEnabled}
          publishing={isPublishing}
          trackState={publisher.trackStates.custom}
        />
      )}

      <Row label="Screen">
        {Platform.OS === 'ios' ? (
          // On iOS the picker itself is the toggle.
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
                disabled: !SUPPORTED_VIDEO.includes('h264'),
              },
              {
                value: 'h265',
                label: 'H.265',
                disabled: !SUPPORTED_VIDEO.includes('h265'),
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
                disabled: !SUPPORTED_AUDIO.includes('opus'),
              },
              {
                value: 'aac',
                label: 'AAC',
                disabled: !SUPPORTED_AUDIO.includes('aac'),
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
            const tracks: PublishTrack[] = [];
            if (cameraEnabled) {
              if (dualCamera) {
                tracks.push(multiCamera.front, multiCamera.back);
              } else {
                tracks.push(camera);
              }
            }
            if (micEnabled) tracks.push(microphone);
            if (ttsEnabled) tracks.push(ttsAudio);
            if (customVideoEnabled) tracks.push(customVideo);
            publisher.publish({ path, tracks });
          }
        }}
        disabled={!isPublishing && !canPublish}
      />

      <Text style={styles.stateLabel}>State: {publisher.state}</Text>
      {publisher.lastError && (
        <Text style={styles.error}>{publisher.lastError}</Text>
      )}
      {!dualCamera && camera.lastError && (
        <Text style={styles.error}>Camera: {camera.lastError}</Text>
      )}
      {dualCamera && multiCamera.lastError && (
        <Text style={styles.error}>Dual camera: {multiCamera.lastError}</Text>
      )}
      {microphone.lastError && (
        <Text style={styles.error}>Mic: {microphone.lastError}</Text>
      )}

      {Object.entries(publisher.trackStates).map(([name, state]) => (
        <Text key={name} style={styles.trackState}>
          {name}: {state}
        </Text>
      ))}

      <Text style={styles.stateLabel}>
        Screen: {screen.state} ({screenPath})
      </Text>
      {screen.lastError && (
        <Text style={styles.error}>Screen: {screen.lastError}</Text>
      )}
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
  dualPreview: {
    flexDirection: 'row',
    gap: 8,
  },
  dualPreviewItem: {
    flex: 1,
  },
  previewControls: {
    position: 'absolute',
    bottom: 8,
    right: 8,
  },
  previewBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
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
