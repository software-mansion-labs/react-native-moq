import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { boyColors } from './theme';
import type { BoyControl } from './types';

type PressHandler = (control: BoyControl, isPressed: boolean) => void;

interface PadProps {
  enabled: boolean;
  onPressChange: PressHandler;
}

// Directional pad: four chevron keys around a recessed hub, matching
// BoyDirectionPad in moq-kit's BoyControlPadView.
export function BoyDirectionPad({ enabled, onPressChange }: PadProps) {
  return (
    <View style={styles.dpad}>
      <View style={styles.dpadHub} />
      <View style={[styles.dpadSlot, styles.dpadUp]}>
        <RectButton
          glyph="▲"
          control="up"
          enabled={enabled}
          onPressChange={onPressChange}
        />
      </View>
      <View style={[styles.dpadSlot, styles.dpadDown]}>
        <RectButton
          glyph="▼"
          control="down"
          enabled={enabled}
          onPressChange={onPressChange}
        />
      </View>
      <View style={[styles.dpadSlot, styles.dpadLeft]}>
        <RectButton
          glyph="◀"
          control="left"
          enabled={enabled}
          onPressChange={onPressChange}
        />
      </View>
      <View style={[styles.dpadSlot, styles.dpadRight]}>
        <RectButton
          glyph="▶"
          control="right"
          enabled={enabled}
          onPressChange={onPressChange}
        />
      </View>
    </View>
  );
}

// A / B action cluster, rotated like the real console (BoyActionCluster).
export function BoyActionCluster({ enabled, onPressChange }: PadProps) {
  return (
    <View style={styles.actionCluster}>
      <View style={styles.actionItemLow}>
        <CircleButton
          title="B"
          control="b"
          enabled={enabled}
          onPressChange={onPressChange}
        />
        <Text style={styles.actionLabel}>B</Text>
      </View>
      <View style={styles.actionItemHigh}>
        <CircleButton
          title="A"
          control="a"
          enabled={enabled}
          onPressChange={onPressChange}
        />
        <Text style={styles.actionLabel}>A</Text>
      </View>
    </View>
  );
}

// SELECT / START capsules (BoyStartSelectCluster).
export function BoyStartSelectCluster({ enabled, onPressChange }: PadProps) {
  return (
    <View style={styles.startSelect}>
      <View style={styles.capsuleRow}>
        <CapsuleButton
          control="select"
          enabled={enabled}
          onPressChange={onPressChange}
        />
        <CapsuleButton
          control="start"
          enabled={enabled}
          onPressChange={onPressChange}
        />
      </View>
      <View style={styles.capsuleLabels}>
        <Text style={[styles.capsuleLabel, !enabled && styles.capsuleLabelOff]}>
          SELECT
        </Text>
        <Text style={[styles.capsuleLabel, !enabled && styles.capsuleLabelOff]}>
          START
        </Text>
      </View>
    </View>
  );
}

function usePress(
  control: BoyControl,
  enabled: boolean,
  onPressChange: PressHandler
) {
  const [pressed, setPressed] = useState(false);
  const onPressIn = () => {
    if (!enabled) return;
    setPressed(true);
    onPressChange(control, true);
  };
  const onPressOut = () => {
    if (!pressed) return;
    setPressed(false);
    onPressChange(control, false);
  };
  return { pressed, onPressIn, onPressOut };
}

function RectButton({
  glyph,
  control,
  enabled,
  onPressChange,
}: {
  glyph: string;
  control: BoyControl;
  enabled: boolean;
  onPressChange: PressHandler;
}) {
  const { pressed, onPressIn, onPressOut } = usePress(
    control,
    enabled,
    onPressChange
  );
  return (
    <Pressable
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[
        styles.rect,
        !enabled
          ? styles.rectDisabled
          : pressed
            ? styles.rectPressed
            : styles.rectNormal,
        pressed && styles.scaled,
      ]}
    >
      <Text
        style={[
          styles.rectGlyph,
          enabled
            ? pressed
              ? styles.glyphOnPressed
              : styles.glyphOn
            : styles.glyphOff,
        ]}
      >
        {glyph}
      </Text>
    </Pressable>
  );
}

function CircleButton({
  title,
  control,
  enabled,
  onPressChange,
}: {
  title: string;
  control: BoyControl;
  enabled: boolean;
  onPressChange: PressHandler;
}) {
  const { pressed, onPressIn, onPressOut } = usePress(
    control,
    enabled,
    onPressChange
  );
  return (
    <Pressable
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[
        styles.circle,
        !enabled
          ? styles.circleDisabled
          : pressed
            ? styles.circlePressed
            : styles.circleNormal,
        pressed && styles.scaled,
      ]}
    >
      <Text
        style={[
          styles.circleLabel,
          enabled
            ? pressed
              ? styles.glyphOnPressed
              : styles.glyphOn
            : styles.glyphOff,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

function CapsuleButton({
  control,
  enabled,
  onPressChange,
}: {
  control: BoyControl;
  enabled: boolean;
  onPressChange: PressHandler;
}) {
  const { pressed, onPressIn, onPressOut } = usePress(
    control,
    enabled,
    onPressChange
  );
  return (
    <Pressable
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[
        styles.capsule,
        pressed ? styles.capsulePressed : styles.capsuleNormal,
        pressed && styles.scaled,
        !enabled && styles.capsuleDisabled,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  dpad: {
    width: 150,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dpadHub: {
    position: 'absolute',
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  dpadSlot: { position: 'absolute' },
  dpadUp: { top: 0 },
  dpadDown: { bottom: 0 },
  dpadLeft: { left: 0 },
  dpadRight: { right: 0 },
  rect: {
    width: 50,
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  rectNormal: { backgroundColor: boyColors.buttonTop },
  rectPressed: { backgroundColor: boyColors.buttonPressedTop },
  rectDisabled: { backgroundColor: 'rgba(0,0,0,0.22)' },
  rectGlyph: { color: '#fff', fontSize: 16, fontWeight: '900' },
  scaled: { transform: [{ scale: 0.95 }] },
  glyphOn: { opacity: 0.95 },
  glyphOnPressed: { opacity: 1 },
  glyphOff: { opacity: 0.55 },
  actionCluster: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    transform: [{ rotate: '-18deg' }],
  },
  actionItemHigh: { alignItems: 'center', gap: 6 },
  actionItemLow: { alignItems: 'center', gap: 6, marginTop: 26 },
  circle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  circleNormal: { backgroundColor: boyColors.actionTop },
  circlePressed: { backgroundColor: boyColors.actionPressedTop },
  circleDisabled: { backgroundColor: boyColors.actionDisabledTop },
  circleLabel: { color: '#fff', fontSize: 19, fontWeight: '800' },
  actionLabel: {
    color: boyColors.actionLabel,
    fontSize: 12,
    fontWeight: '700',
  },
  startSelect: {
    alignItems: 'center',
    gap: 6,
    transform: [{ rotate: '-24deg' }],
  },
  capsuleRow: { flexDirection: 'row', gap: 12 },
  capsule: {
    width: 52,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.18)',
  },
  capsuleNormal: { backgroundColor: boyColors.metal },
  capsulePressed: { backgroundColor: '#33353C' },
  capsuleDisabled: { opacity: 0.7 },
  capsuleLabels: { flexDirection: 'row', gap: 16 },
  capsuleLabel: {
    color: boyColors.label,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  capsuleLabelOff: { opacity: 0.48 },
});
