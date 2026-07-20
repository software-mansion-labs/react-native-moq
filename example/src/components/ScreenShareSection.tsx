import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { BroadcastPickerView, type ScreenBroadcast } from 'react-native-moq';
import { StateIndicator } from './StateIndicator';
import { ErrorText, IconButton, SourceCard, SplitRow } from './ui';
import { useTheme } from '../theme';

// Must match the Broadcast Upload Extension's bundle identifier in pbxproj.
const SCREEN_PREFERRED_EXT = 'moq.example.MoQBroadcastUpload';

export function screenBroadcasting(screen: ScreenBroadcast): boolean {
  return screen.state === 'broadcasting' || screen.state === 'connecting';
}

export function ScreenShareSection({
  screen,
  screenPath,
}: {
  screen: ScreenBroadcast;
  screenPath: string;
}) {
  const { dark, colors } = useTheme();
  const [screenEnabled, setScreenEnabled] = useState(false);
  const broadcasting = screenBroadcasting(screen);

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
    } else if (!next && broadcasting) {
      screen.stop();
    }
  };

  // Reflect native screen state into the toggle so the iOS switch follows the
  // system picker.
  useEffect(() => {
    if (broadcasting) setScreenEnabled(true);
    else if (screen.state === 'idle' || screen.state === 'stopped') {
      setScreenEnabled(false);
    }
  }, [screen.state, broadcasting]);

  return (
    <SourceCard
      title="Screen share"
      control={
        Platform.OS === 'ios' ? (
          // On iOS the system picker itself must be the tap target; dress it
          // up as one of the circular toggles.
          <View
            style={[
              styles.pickerCircle,
              { backgroundColor: broadcasting ? colors.tint : colors.fill },
            ]}
          >
            <BroadcastPickerView
              preferredExtension={SCREEN_PREFERRED_EXT}
              tintColor={
                broadcasting ? '#ffffff' : dark ? '#0A84FF' : '#007AFF'
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
      <SplitRow>
        {/* The full message renders below, so the state chip stays short. */}
        <StateIndicator
          state={screen.state.startsWith('error:') ? 'error' : screen.state}
        />
        <Text
          style={[styles.path, { color: colors.secondaryLabel }]}
          numberOfLines={1}
        >
          {screenPath}
        </Text>
      </SplitRow>
      {screen.lastError && <ErrorText text={screen.lastError} />}
    </SourceCard>
  );
}

const styles = StyleSheet.create({
  path: {
    flexShrink: 1,
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  broadcastPicker: { width: 44, height: 44 },
  pickerCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
