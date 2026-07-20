import { StyleSheet, Text, View } from 'react-native';
import {
  PublisherView,
  type CameraTrack,
  type MultiCameraTrack,
} from 'react-native-moq';
import MaterialIcons from '@react-native-vector-icons/material-icons';
import { RESOLUTIONS, type EncoderSettings } from './EncoderCard';
import { PreviewFrame, PreviewRow } from './PreviewFrame';
import { Card, IconButton, Pill, SectionHeader } from './ui';
import { useTheme } from '../theme';

export function CaptureCard({
  camera,
  multiCamera,
  cameraEnabled,
  micEnabled,
  dualCamera,
  multiSupported,
  isPublishing,
  encoder,
  onToggleCamera,
  onToggleMic,
  onToggleDual,
}: {
  camera: CameraTrack;
  multiCamera: MultiCameraTrack;
  cameraEnabled: boolean;
  micEnabled: boolean;
  dualCamera: boolean;
  multiSupported: boolean;
  isPublishing: boolean;
  encoder: EncoderSettings;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onToggleDual: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Card>
      <SectionHeader title="Capture" />
      <PreviewRow
        side={
          <>
            {cameraEnabled && (
              <>
                <Pill
                  text={encoder.videoCodec === 'h265' ? 'H.265' : 'H.264'}
                />
                <Pill text={RESOLUTIONS[encoder.resolution].label} />
                <Pill text={`${encoder.frameRate} fps`} />
              </>
            )}
            {micEnabled && (
              <Pill
                text={`${encoder.audioCodec === 'opus' ? 'Opus' : 'AAC'} · ${
                  encoder.sampleRate === 44100 ? '44.1' : '48'
                } kHz`}
              />
            )}
          </>
        }
      >
        {!cameraEnabled ? (
          <PreviewFrame
            style={{ backgroundColor: colors.fill }}
            accessibilityLabel="Camera off"
          >
            <View style={styles.previewOff}>
              <MaterialIcons
                name="videocam-off"
                size={32}
                color={colors.tertiaryLabel}
              />
            </View>
          </PreviewFrame>
        ) : dualCamera ? (
          <>
            <PreviewFrame badge="FRONT">
              <PublisherView
                style={StyleSheet.absoluteFill}
                camera={multiCamera.front}
              />
            </PreviewFrame>
            <PreviewFrame badge="BACK">
              <PublisherView
                style={StyleSheet.absoluteFill}
                camera={multiCamera.back}
              />
            </PreviewFrame>
          </>
        ) : (
          <PreviewFrame>
            <PublisherView style={StyleSheet.absoluteFill} camera={camera} />
          </PreviewFrame>
        )}
      </PreviewRow>
      <View style={styles.captureControls}>
        <CaptureToggle
          icon={cameraEnabled ? 'videocam' : 'videocam-off'}
          label="Camera"
          active={cameraEnabled}
          disabled={isPublishing}
          onPress={onToggleCamera}
        />
        <CaptureToggle
          icon={micEnabled ? 'mic' : 'mic-off'}
          label="Mic"
          active={micEnabled}
          disabled={isPublishing}
          onPress={onToggleMic}
        />
        {multiSupported && (
          <CaptureToggle
            icon="splitscreen"
            label="Dual"
            active={dualCamera}
            disabled={isPublishing || !cameraEnabled}
            onPress={onToggleDual}
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

const styles = StyleSheet.create({
  previewOff: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
});
