import { useEffect, useState } from 'react';
import {
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  isMultiCameraSupported,
  useAudioSource,
  useCamera,
  useDataTrack,
  useMicrophone,
  useMultiCamera,
  usePublisher,
  useScreenBroadcast,
  useSession,
  useVideoSource,
  type PublishTrack,
} from 'react-native-moq';
import { CaptureCard } from '../components/CaptureCard';
import { ConnectionCard, sessionFlags } from '../components/ConnectionCard';
import { CustomVideoSection } from '../components/CustomVideoSection';
import {
  EncoderCard,
  RESOLUTIONS,
  defaultEncoderSettings,
  type EncoderSettings,
} from '../components/EncoderCard';
import {
  ScreenShareSection,
  screenBroadcasting,
} from '../components/ScreenShareSection';
import { StateIndicator } from '../components/StateIndicator';
import { SubtitlesSection } from '../components/SubtitlesSection';
import { TtsAudioSection } from '../components/TtsAudioSection';
import {
  Button,
  Card,
  ErrorText,
  IconButton,
  Input,
  ScreenScroll,
  SectionHeader,
  SourceCard,
  SplitRow,
  TwoColumn,
} from '../components/ui';
import { useTheme } from '../theme';

// Must match the App Group in the entitlements files (iOS-only).
const SCREEN_APP_GROUP = 'group.moq.example.screenbroadcast';
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
  isActive,
}: {
  url: string;
  setUrl: (url: string) => void;
  isActive: boolean;
}) {
  const [path, setPath] = useState('live/test');
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);
  const [customVideoEnabled, setCustomVideoEnabled] = useState(false);

  // Dual-camera is device-dependent; probe support before offering the mode.
  const [multiSupported, setMultiSupported] = useState(false);
  const [dualCamera, setDualCamera] = useState(false);
  useEffect(() => {
    isMultiCameraSupported()
      .then(setMultiSupported)
      .catch(() => {});
  }, []);

  const [encoder, setEncoder] = useState(defaultEncoderSettings);
  const updateEncoder = (patch: Partial<EncoderSettings>) =>
    setEncoder((prev) => {
      const next = { ...prev, ...patch };
      // Opus is fixed at 48 kHz.
      if (next.audioCodec === 'opus') next.sampleRate = 48000;
      return next;
    });

  useEffect(() => {
    requestCapturePermissions();
  }, []);

  const session = useSession(url);
  const publisher = usePublisher(session);
  const isPublishing =
    publisher.state === 'publishing' || publisher.state === 'connecting';

  const { width, height } = RESOLUTIONS[encoder.resolution];
  // Both camera hooks stay mounted; `enabled` runs hardware only for the active
  // mode, since concurrent single + multi capture would conflict.
  const cameraConfig = {
    videoCodec: encoder.videoCodec,
    width,
    height,
    framerate: encoder.frameRate,
  };
  const camera = useCamera({ ...cameraConfig, enabled: !dualCamera });
  const multiCamera = useMultiCamera({ ...cameraConfig, enabled: dualCamera });
  // Run the mic hardware only while this tab is up or a broadcast is live.
  // Every tab stays mounted, and an idle mic capture holds the iOS audio
  // session in playAndRecord, which blocks other tabs from reconfiguring it
  // for playback (setCategory fails with insufficientPriority).
  const microphone = useMicrophone({
    audioCodec: encoder.audioCodec,
    audioSampleRate: encoder.sampleRate,
    enabled: micEnabled && (isActive || isPublishing),
  });
  // Custom audio track fed by synthesized speech. Always 48 kHz mono; TTS output
  // is resampled to match in TtsAudioSection.
  const ttsAudio = useAudioSource({
    name: 'tts',
    audioCodec: encoder.audioCodec,
    sampleRate: 48000,
    channels: 1,
  });
  // Custom video track fed by an app-rendered frame source. Here the example
  // drives a native test pattern (see CustomVideoSection); a real app would
  // render into the pool's buffers with its own GPU engine. 24 fps matches
  // CustomVideoSection's push cadence.
  const customVideo = useVideoSource({
    name: 'custom',
    videoCodec: encoder.videoCodec,
    width,
    height,
    framerate: 24,
    poolSize: 3,
  });
  // Live captions generated on-device from the mic audio (see SubtitlesSection).
  const subtitlesTrack = useDataTrack({ name: 'subtitles' });

  // Connected manually, like the other tabs — publish() and the screen
  // broadcast need the session up, so Go live stays disabled until then.
  const { isConnected } = sessionFlags(session);

  const screenPath = path + SCREEN_PATH_SUFFIX;

  const screen = useScreenBroadcast(session, {
    path: screenPath,
    appGroupIdentifier: SCREEN_APP_GROUP,
    appAudio: true,
    mic: true,
    videoCodec: encoder.videoCodec,
    width,
    height,
    framerate: encoder.frameRate,
    audioCodec: encoder.audioCodec,
    audioSampleRate: encoder.sampleRate,
  });
  const screenBusy = screenBroadcasting(screen);

  const canPublish =
    isConnected &&
    !isPublishing &&
    (cameraEnabled || micEnabled || ttsEnabled || customVideoEnabled) &&
    path.length > 0;

  const goLive = () => {
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
    if (subtitlesEnabled && micEnabled) tracks.push(subtitlesTrack);
    if (customVideoEnabled) tracks.push(customVideo);
    publisher.publish({ path, tracks });
  };

  return (
    <ScreenScroll>
      <TwoColumn
        left={
          <>
            <ConnectionCard
              session={session}
              url={url}
              setUrl={setUrl}
              urlEditable={!isPublishing}
              connectDisabled={isPublishing || screenBusy}
            >
              <Input
                value={path}
                onChangeText={setPath}
                placeholder="Broadcast path (e.g. live/test)"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isPublishing && !screenBusy}
              />
            </ConnectionCard>

            <Card>
              <SectionHeader title="Broadcast" />
              <SplitRow>
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
                    if (isPublishing) publisher.stop();
                    else if (canPublish) goLive();
                  }}
                  disabled={!isPublishing && !canPublish}
                />
              </SplitRow>
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

            <CaptureCard
              camera={camera}
              multiCamera={multiCamera}
              cameraEnabled={cameraEnabled}
              micEnabled={micEnabled}
              dualCamera={dualCamera}
              multiSupported={multiSupported}
              isPublishing={isPublishing}
              encoder={encoder}
              onToggleCamera={() => setCameraEnabled((on) => !on)}
              onToggleMic={() => setMicEnabled((on) => !on)}
              onToggleDual={() => setDualCamera((on) => !on)}
            />
          </>
        }
        right={
          <>
            {!isPublishing && (
              <EncoderCard settings={encoder} onChange={updateEncoder} />
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
                  publishing={isPublishing}
                  trackState={publisher.trackStates.tts}
                />
              )}
            </SourceCard>

            <SourceCard
              title="Live subtitles"
              control={
                <IconButton
                  icon="closed-caption"
                  variant={subtitlesEnabled ? 'filled' : 'tonal'}
                  accessibilityLabel="Live subtitles"
                  disabled={isPublishing}
                  onPress={() => setSubtitlesEnabled((on) => !on)}
                />
              }
            >
              {subtitlesEnabled && (
                <SubtitlesSection
                  url={url}
                  path={path}
                  publishing={isPublishing}
                  micEnabled={micEnabled}
                  dataTrack={subtitlesTrack}
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
                  publishing={isPublishing}
                  trackState={publisher.trackStates.custom}
                  sourceHeight={height}
                />
              )}
            </SourceCard>

            <ScreenShareSection screen={screen} screenPath={screenPath} />
          </>
        }
      />
    </ScreenScroll>
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

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 32,
  },
  statusLabel: { fontSize: 13 },
  statusValue: {
    flexShrink: 1,
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
