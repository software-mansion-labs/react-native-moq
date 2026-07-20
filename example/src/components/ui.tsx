import type { ComponentProps, ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ColorValue,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import MaterialIcons from '@react-native-vector-icons/material-icons';
import { useTheme } from '../theme';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

export function Button({
  title,
  icon,
  onPress,
  variant = 'filled',
  destructive = false,
  disabled = false,
  style,
}: {
  title: string;
  icon?: IconName;
  onPress?: () => void;
  /** filled = primary action, tonal = secondary, plain = borderless text. */
  variant?: 'filled' | 'tonal' | 'plain';
  destructive?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();

  const accent = destructive ? colors.destructive : colors.tint;
  const background =
    variant === 'filled'
      ? accent
      : variant === 'tonal'
        ? destructive
          ? colors.fill
          : colors.tintFill
        : 'transparent';
  const content = variant === 'filled' ? colors.onTint : accent;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background },
        variant === 'plain' && styles.buttonPlain,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {icon && <MaterialIcons name={icon} size={18} color={content} />}
      <Text style={[styles.buttonLabel, { color: content }]}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  variant = 'tonal',
  size = 40,
  accessibilityLabel,
  disabled = false,
  style,
}: {
  icon: IconName;
  onPress?: () => void;
  /** tonal = subtle fill, filled = accent, overlay = translucent scrim on video. */
  variant?: 'tonal' | 'filled' | 'overlay';
  size?: number;
  accessibilityLabel: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();

  const background: ColorValue =
    variant === 'filled'
      ? colors.tint
      : variant === 'overlay'
        ? 'rgba(0,0,0,0.4)'
        : colors.fill;
  const content: ColorValue =
    variant === 'filled'
      ? colors.onTint
      : variant === 'overlay'
        ? '#ffffff'
        : colors.tint;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: background,
        },
        styles.iconButton,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <MaterialIcons
        name={icon}
        size={Math.round(size * 0.55)}
        color={content}
      />
    </Pressable>
  );
}

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderRadius: radius.card },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionHeader({ title }: { title: string }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.sectionHeader, { color: colors.secondaryLabel }]}>
      {title.toUpperCase()}
    </Text>
  );
}

export function Input(props: TextInputProps) {
  const { colors, radius } = useTheme();
  return (
    <TextInput
      placeholderTextColor={colors.tertiaryLabel}
      {...props}
      style={[
        styles.input,
        {
          backgroundColor: colors.fill,
          borderRadius: radius.control,
          color: colors.label,
        },
        props.style,
      ]}
    />
  );
}

export function Pill({
  text,
  tinted = false,
}: {
  text: string;
  tinted?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: tinted ? colors.tintFill : colors.fill },
      ]}
    >
      <Text
        style={[
          styles.pillText,
          { color: tinted ? colors.tint : colors.secondaryLabel },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
  compact = false,
}: {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (next: T) => void;
  disabled?: boolean;
  /** Hug content instead of stretching — fits on one line beside a label. */
  compact?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.segmented,
        { backgroundColor: colors.fill },
        disabled && styles.disabled,
      ]}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        const optDisabled = disabled || opt.disabled;
        return (
          <Pressable
            key={String(opt.value)}
            onPress={() => !optDisabled && onChange(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled: !!optDisabled }}
            style={[
              styles.segment,
              compact && styles.segmentCompact,
              selected && [
                styles.segmentSelected,
                {
                  backgroundColor:
                    Platform.OS === 'ios' ? colors.card : colors.tintFill,
                },
              ],
              opt.disabled && !disabled && styles.disabled,
            ]}
          >
            <Text
              style={[
                styles.segmentLabel,
                { color: colors.secondaryLabel },
                selected && [
                  styles.segmentLabelSelected,
                  {
                    color: Platform.OS === 'ios' ? colors.label : colors.tint,
                  },
                ],
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

/** Scrolling screen body with the shared padding / max-width scaffold. */
export function ScreenScroll({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.screenScroll}
      contentInsetAdjustmentBehavior="automatic"
    >
      {children}
    </ScrollView>
  );
}

/** Row with content pushed to the edges — state chip left, control right. */
export function SplitRow({ children }: { children: ReactNode }) {
  return <View style={styles.splitRow}>{children}</View>;
}

/** Card with a control beside its header; extra content renders below. */
export function SourceCard({
  title,
  control,
  children,
}: {
  title: string;
  control: ReactNode;
  children?: ReactNode;
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

/** Muted helper text. */
export function Hint({
  children,
  tone = 'secondary',
  style,
}: {
  children: ReactNode;
  tone?: 'secondary' | 'tertiary';
  style?: StyleProp<TextStyle>;
}) {
  const { colors } = useTheme();
  const color =
    tone === 'tertiary' ? colors.tertiaryLabel : colors.secondaryLabel;
  return <Text style={[styles.hint, { color }, style]}>{children}</Text>;
}

export function ErrorText({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.errorText, { color: colors.destructive }]}>
      {text}
    </Text>
  );
}

/** True when the window is wide enough for side-by-side layouts. */
function useWide(): boolean {
  return useWindowDimensions().width >= 700;
}

/** Two columns on wide windows, a single stack otherwise. */
export function TwoColumn({
  left,
  right,
}: {
  left: ReactNode;
  right: ReactNode;
}) {
  const wide = useWide();
  return (
    // Keyed remount: restyling the same native views when the fold/unfold
    // display switch flips the mode leaves stale widths that overflow the
    // screen.
    <View
      key={wide ? 'wide' : 'narrow'}
      style={[styles.columns, wide && styles.columnsWide]}
    >
      <View style={[styles.column, wide && styles.columnWide]}>{left}</View>
      <View style={[styles.column, wide && styles.columnWide]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 22,
  },
  buttonPlain: {
    minHeight: 32,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.55 },
  disabled: { opacity: 0.4 },
  card: {
    padding: 14,
    gap: 10,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  input: {
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 16,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '500',
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 2,
  },
  segment: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentCompact: {
    flex: 0,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  segmentSelected:
    Platform.OS === 'ios'
      ? {
          shadowColor: '#000',
          shadowOpacity: 0.12,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 },
        }
      : {},
  segmentLabel: { fontSize: 13 },
  segmentLabelSelected: { fontWeight: '600' },
  columns: { gap: 12 },
  columnsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  column: { gap: 12 },
  columnWide: { flex: 1 },
  screenScroll: {
    padding: 16,
    gap: 12,
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sourceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hint: { fontSize: 13, lineHeight: 18 },
  errorText: { fontSize: 13 },
});
