import { StyleSheet, Text, View } from 'react-native';
import {
  getSupportedAudioCodecs,
  getSupportedVideoCodecs,
  type AudioCodec,
  type VideoCodec,
} from 'react-native-moq';
import { Card, SectionHeader, Segmented } from './ui';
import { useTheme } from '../theme';

export const SUPPORTED_VIDEO = getSupportedVideoCodecs();
export const SUPPORTED_AUDIO = getSupportedAudioCodecs();

// Landscape dimensions: forcing portrait made the Publisher self-stop on Android.
export type VideoResolution = 'HD' | 'FHD';
export const RESOLUTIONS: Record<
  VideoResolution,
  { width: number; height: number; label: string }
> = {
  HD: { width: 720, height: 1280, label: 'HD (720p)' },
  FHD: { width: 1080, height: 1920, label: 'FHD (1080p)' },
};

export const FRAME_RATES = [24, 30, 60] as const;
export type FrameRate = (typeof FRAME_RATES)[number];

export const SAMPLE_RATES = [44100, 48000] as const;
export type SampleRate = (typeof SAMPLE_RATES)[number];

export interface EncoderSettings {
  videoCodec: VideoCodec;
  resolution: VideoResolution;
  frameRate: FrameRate;
  audioCodec: AudioCodec;
  sampleRate: SampleRate;
}

// Prefer H.265/Opus when supported, else fall back to H.264/AAC.
export function defaultEncoderSettings(): EncoderSettings {
  return {
    videoCodec: SUPPORTED_VIDEO.includes('h265') ? 'h265' : 'h264',
    resolution: 'HD',
    frameRate: 30,
    audioCodec: SUPPORTED_AUDIO.includes('opus') ? 'opus' : 'aac',
    sampleRate: 48000,
  };
}

export function EncoderCard({
  settings,
  onChange,
}: {
  settings: EncoderSettings;
  onChange: (patch: Partial<EncoderSettings>) => void;
}) {
  return (
    <Card>
      <SectionHeader title="Encoder" />
      <ParamRow label="Video codec">
        <Segmented
          compact
          value={settings.videoCodec}
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
          onChange={(videoCodec) => onChange({ videoCodec })}
        />
      </ParamRow>
      <ParamRow label="Resolution">
        <Segmented
          compact
          value={settings.resolution}
          options={(Object.keys(RESOLUTIONS) as VideoResolution[]).map((r) => ({
            value: r,
            label: `${RESOLUTIONS[r].width}p`,
          }))}
          onChange={(resolution) => onChange({ resolution })}
        />
      </ParamRow>
      <ParamRow label="Frame rate">
        <Segmented
          compact
          value={settings.frameRate}
          options={FRAME_RATES.map((r) => ({ value: r, label: String(r) }))}
          onChange={(frameRate) => onChange({ frameRate })}
        />
      </ParamRow>
      <ParamRow label="Audio codec">
        <Segmented
          compact
          value={settings.audioCodec}
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
          onChange={(audioCodec) => onChange({ audioCodec })}
        />
      </ParamRow>
      <ParamRow label="Sample rate">
        <Segmented
          compact
          value={settings.sampleRate}
          options={SAMPLE_RATES.map((r) => ({
            value: r,
            label: r === 44100 ? '44.1 kHz' : '48 kHz',
          }))}
          onChange={(sampleRate) => onChange({ sampleRate })}
          disabled={settings.audioCodec === 'opus'}
        />
      </ParamRow>
    </Card>
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

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 32,
  },
  paramLabel: { fontSize: 15, flexShrink: 1 },
});
