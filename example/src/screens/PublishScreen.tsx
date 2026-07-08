import { useEffect, useMemo, useState } from 'react';
import {
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
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
import MaterialIcons from '@react-native-vector-icons/material-icons';
import { TtsAudioSection } from '../components/TtsAudioSection';
import { CustomVideoSection } from '../components/CustomVideoSection';
import { StateIndicator } from '../components/StateIndicator';
import {
  Button,
  Card,
  IconButton,
  Input,
  Pill,
  ScreenTitle,
  SectionHeader,
  Segmented,
  TwoColumn,
} from '../components/ui';
import { useTheme } from '../theme';

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
  const { dark, colors } = useTheme();
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

  // Connected manually, like the other tabs — publish() and the screen
  // broadcast need the session up, so Go live stays disabled until then.
  const canConnect = session.state === 'idle' || session.state === 'closed';
  const isConnected = session.state === 'connected';

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
    isConnected &&
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
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="automatic"
    >
      <ScreenTitle title="Publish" />

      <TwoColumn
        left={
          <>
            <Card>
              <SectionHeader title="Connection" />
              <Input
                value={url}
                onChangeText={setUrl}
                placeholder="Relay URL"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isPublishing}
              />
              <Input
                value={path}
                onChangeText={setPath}
                placeholder="Broadcast path (e.g. live/test)"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isPublishing && !screenBroadcasting}
              />
              <View style={styles.connectRow}>
                <StateIndicator state={session.state} />
                <Button
                  title={canConnect ? 'Connect' : 'Disconnect'}
                  icon={canConnect ? 'link' : 'link-off'}
                  variant={canConnect ? 'filled' : 'tonal'}
                  destructive={!canConnect}
                  disabled={isPublishing || screenBroadcasting}
                  onPress={
                    canConnect ? () => session.connect() : session.disconnect
                  }
                />
              </View>
            </Card>

            <Card>
              <SectionHeader title="Broadcast" />
              <View style={styles.connectRow}>
                <StateIndicator state={publisher.state} />
                <Button
                  title={
                    isPublishing
                      ? publisher.state === 'connecting'
                        ? 'Starting…'
                        : 'Stop'
                      : 'Go live'
                  }
                  icon={isPublishing ? 'stop' : 'sensors'}
                  destructive={isPublishing}
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
              </View>
              {publisher.lastError && <ErrorText text={publisher.lastError} />}
              {Object.entries(publisher.trackStates).map(([name, state]) => (
                <StatusRow key={name} label={name} value={state} />
              ))}
              {!dualCamera && camera.lastError && (
                <ErrorText text={`Camera: ${camera.lastError}`} />
              )}
              {dualCamera && multiCamera.lastError && (
                <ErrorText text={`Dual camera: ${multiCamera.lastError}`} />
              )}
              {microphone.lastError && (
                <ErrorText text={`Mic: ${microphone.lastError}`} />
              )}
            </Card>

            <Card>
              <SectionHeader title="Capture" />
              <View style={styles.previewRow}>
                {!cameraEnabled ? (
                  <View
                    style={[styles.preview, { backgroundColor: colors.fill }]}
                    accessibilityLabel="Camera off"
                  >
                    <View style={styles.previewOff}>
                      <MaterialIcons
                        name="videocam-off"
                        size={32}
                        color={colors.tertiaryLabel}
                      />
                    </View>
                  </View>
                ) : dualCamera ? (
                  <>
                    <View style={styles.preview}>
                      <PublisherView
                        style={StyleSheet.absoluteFill}
                        camera={multiCamera.front}
                      />
                      <PreviewBadge label="FRONT" />
                    </View>
                    <View style={styles.preview}>
                      <PublisherView
                        style={StyleSheet.absoluteFill}
                        camera={multiCamera.back}
                      />
                      <PreviewBadge label="BACK" />
                    </View>
                  </>
                ) : (
                  <View style={styles.preview}>
                    <PublisherView
                      style={StyleSheet.absoluteFill}
                      camera={camera}
                    />
                  </View>
                )}
                <View style={styles.previewSide}>
                  {cameraEnabled && (
                    <>
                      <Pill text={videoCodec === 'h265' ? 'H.265' : 'H.264'} />
                      <Pill text={RESOLUTIONS[videoResolution].label} />
                      <Pill text={`${frameRate} fps`} />
                    </>
                  )}
                  {micEnabled && (
                    <Pill
                      text={`${audioCodec === 'opus' ? 'Opus' : 'AAC'} · ${
                        audioSampleRate === 44100 ? '44.1' : '48'
                      } kHz`}
                    />
                  )}
                </View>
              </View>
              <View style={styles.captureControls}>
                <CaptureToggle
                  icon={cameraEnabled ? 'videocam' : 'videocam-off'}
                  label="Camera"
                  active={cameraEnabled}
                  disabled={isPublishing}
                  onPress={() => setCameraEnabled((on) => !on)}
                />
                <CaptureToggle
                  icon={micEnabled ? 'mic' : 'mic-off'}
                  label="Mic"
                  active={micEnabled}
                  disabled={isPublishing}
                  onPress={() => setMicEnabled((on) => !on)}
                />
                {multiSupported && (
                  <CaptureToggle
                    icon="splitscreen"
                    label="Dual"
                    active={dualCamera}
                    disabled={isPublishing || !cameraEnabled}
                    onPress={() => setDualCamera((on) => !on)}
                  />
                )}
                <CaptureToggle
                  icon="cameraswitch"
                  label="Flip"
                  disabled={!cameraEnabled || dualCamera}
                  onPress={camera.flip}
                />
              </View>
            </Card>
          </>
        }
        right={
          <>
            {!isPublishing && (
              <Card>
                <SectionHeader title="Encoder" />
                <ParamRow label="Video codec">
                  <Segmented
                    compact
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
                </ParamRow>
                <ParamRow label="Resolution">
                  <Segmented
                    compact
                    value={videoResolution}
                    options={(
                      Object.keys(RESOLUTIONS) as VideoResolution[]
                    ).map((r) => ({
                      value: r,
                      label: `${RESOLUTIONS[r].width}p`,
                    }))}
                    onChange={setVideoResolution}
                  />
                </ParamRow>
                <ParamRow label="Frame rate">
                  <Segmented
                    compact
                    value={frameRate}
                    options={FRAME_RATES.map((r) => ({
                      value: r,
                      label: String(r),
                    }))}
                    onChange={setFrameRate}
                  />
                </ParamRow>
                <ParamRow label="Audio codec">
                  <Segmented
                    compact
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
                </ParamRow>
                <ParamRow label="Sample rate">
                  <Segmented
                    compact
                    value={audioSampleRate}
                    options={SAMPLE_RATES.map((r) => ({
                      value: r,
                      label: r === 44100 ? '44.1 kHz' : '48 kHz',
                    }))}
                    onChange={setAudioSampleRate}
                    disabled={audioCodec === 'opus'}
                  />
                </ParamRow>
              </Card>
            )}

            <SourceCard
              title="Text to speech"
              control={
                <IconButton
                  icon="record-voice-over"
                  variant={ttsEnabled ? 'filled' : 'tonal'}
                  accessibilityLabel="Text to speech"
                  disabled={isPublishing}
                  onPress={() => setTtsEnabled((on) => !on)}
                />
              }
            >
              {ttsEnabled && (
                <TtsAudioSection
                  audioSource={ttsAudio}
                  enabled={ttsEnabled}
                  publishing={isPublishing}
                  trackState={publisher.trackStates.tts}
                />
              )}
            </SourceCard>

            <SourceCard
              title="Test video pattern"
              control={
                <IconButton
                  icon="texture"
                  variant={customVideoEnabled ? 'filled' : 'tonal'}
                  accessibilityLabel="Test video pattern"
                  disabled={isPublishing}
                  onPress={() => setCustomVideoEnabled((on) => !on)}
                />
              }
            >
              {customVideoEnabled && (
                <CustomVideoSection
                  videoSource={customVideo}
                  enabled={customVideoEnabled}
                  publishing={isPublishing}
                  trackState={publisher.trackStates.custom}
                  sourceHeight={RESOLUTIONS[videoResolution].height}
                />
              )}
            </SourceCard>

            <SourceCard
              title="Screen share"
              control={
                Platform.OS === 'ios' ? (
                  // On iOS the system picker itself must be the tap target; dress it
                  // up as one of the circular toggles.
                  <View
                    style={[
                      styles.pickerCircle,
                      {
                        backgroundColor: screenBroadcasting
                          ? colors.tint
                          : colors.fill,
                      },
                    ]}
                  >
                    <BroadcastPickerView
                      preferredExtension={SCREEN_PREFERRED_EXT}
                      tintColor={
                        screenBroadcasting
                          ? '#ffffff'
                          : dark
                            ? '#0A84FF'
                            : '#007AFF'
                      }
                      style={styles.broadcastPicker}
                    />
                  </View>
                ) : (
                  <IconButton
                    icon={screenEnabled ? 'screen-share' : 'stop-screen-share'}
                    variant={screenEnabled ? 'filled' : 'tonal'}
                    accessibilityLabel="Screen share"
                    onPress={() => onToggleScreen(!screenEnabled)}
                  />
                )
              }
            >
              <View style={styles.connectRow}>
                {/* The full message renders below, so the state chip stays short. */}
                <StateIndicator
                  state={
                    screen.state.startsWith('error:') ? 'error' : screen.state
                  }
                />
                <Text
                  style={[styles.statusValue, { color: colors.secondaryLabel }]}
                  numberOfLines={1}
                >
                  {screenPath}
                </Text>
              </View>
              {screen.lastError && <ErrorText text={screen.lastError} />}
            </SourceCard>
          </>
        }
      />
    </ScrollView>
  );
}

// Call-style capture toggle: filled = live, tonal with a slashed icon = off.
function CaptureToggle({
  icon,
  label,
  active = false,
  disabled = false,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.captureItem}>
      <IconButton
        icon={icon}
        size={48}
        variant={active ? 'filled' : 'tonal'}
        accessibilityLabel={label}
        disabled={disabled}
        onPress={onPress}
      />
      <Text
        style={[styles.captureLabel, { color: colors.secondaryLabel }]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </View>
  );
}

// Single-line encoder parameter: label left, compact segmented control right.
function ParamRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.paramLabel, { color: colors.label }]}>{label}</Text>
      {children}
    </View>
  );
}

// Card with a symbol toggle in its header; extra content renders only while on.
function SourceCard({
  title,
  control,
  children,
}: {
  title: string;
  control: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <View style={styles.sourceHeader}>
        <SectionHeader title={title} />
        {control}
      </View>
      {children}
    </Card>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.statusLabel, { color: colors.secondaryLabel }]}>
        {label}
      </Text>
      <Text
        style={[styles.statusValue, { color: colors.label }]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function ErrorText({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.error, { color: colors.destructive }]}>{text}</Text>
  );
}

function PreviewBadge({ label }: { label: string }) {
  return <Text style={styles.previewBadge}>{label}</Text>;
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 16,
    gap: 12,
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
  },
  connectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  previewRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  preview: {
    height: 200,
    aspectRatio: 9 / 16,
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
  },
  previewOff: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewSide: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  captureControls: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginTop: 4,
  },
  captureItem: {
    width: 72,
    alignItems: 'center',
    gap: 4,
  },
  captureLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
  sourceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    gap: 12,
    minHeight: 32,
  },
  paramLabel: { fontSize: 15, flexShrink: 1 },
  statusLabel: { fontSize: 13 },
  statusValue: {
    flexShrink: 1,
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  error: { fontSize: 13 },
  broadcastPicker: { width: 44, height: 44 },
  pickerCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
