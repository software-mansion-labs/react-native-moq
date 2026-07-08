import {
  Platform,
  PlatformColor,
  useColorScheme,
  type ColorValue,
} from 'react-native';

export interface Theme {
  dark: boolean;
  colors: {
    /** Screen background. */
    background: ColorValue;
    /** Card / grouped cell background. */
    card: ColorValue;
    /** Secondary fill: inputs, segmented tracks, chips. */
    fill: ColorValue;
    label: ColorValue;
    secondaryLabel: ColorValue;
    tertiaryLabel: ColorValue;
    separator: ColorValue;
    /** Accent color for primary actions and selection. */
    tint: ColorValue;
    /** Content drawn on top of `tint`. */
    onTint: ColorValue;
    /** Subtle tint-colored fill (tonal buttons, active chips). */
    tintFill: ColorValue;
    destructive: ColorValue;
    success: ColorValue;
    warning: ColorValue;
  };
  radius: {
    card: number;
    control: number;
  };
}

// iOS: system dynamic colors resolve natively, so they track light/dark (and
// increased-contrast) without any JS involvement. Built once — PlatformColor
// objects must keep a stable identity across renders, or every re-render
// pushes "changed" color props to native views (visible as flicker during
// native-driver animations, e.g. the MoQBoy flip).
const iosColors = (dark: boolean): Theme['colors'] => ({
  background: PlatformColor('systemGroupedBackground'),
  card: PlatformColor('secondarySystemGroupedBackground'),
  fill: PlatformColor('tertiarySystemFill'),
  label: PlatformColor('label'),
  secondaryLabel: PlatformColor('secondaryLabel'),
  tertiaryLabel: PlatformColor('tertiaryLabel'),
  separator: PlatformColor('separator'),
  tint: PlatformColor('systemBlue'),
  onTint: '#ffffff',
  tintFill: dark ? 'rgba(10,132,255,0.24)' : 'rgba(0,122,255,0.14)',
  destructive: PlatformColor('systemRed'),
  success: PlatformColor('systemGreen'),
  warning: PlatformColor('systemOrange'),
});

// Android: Material 3 baseline color scheme.
const androidLight: Theme['colors'] = {
  background: '#FEF7FF',
  card: '#F3EDF7',
  fill: '#ECE6F0',
  label: '#1D1B20',
  secondaryLabel: '#49454F',
  tertiaryLabel: '#79747E',
  separator: '#CAC4D0',
  tint: '#6750A4',
  onTint: '#FFFFFF',
  tintFill: '#E8DEF8',
  destructive: '#B3261E',
  success: '#2E7D32',
  warning: '#B26A00',
};

const androidDark: Theme['colors'] = {
  background: '#141218',
  card: '#211F26',
  fill: '#2B2930',
  label: '#E6E0E9',
  secondaryLabel: '#CAC4D0',
  tertiaryLabel: '#938F99',
  separator: '#49454F',
  tint: '#D0BCFF',
  onTint: '#381E72',
  tintFill: '#4F378B',
  destructive: '#F2B8B5',
  success: '#81C784',
  warning: '#FFB74D',
};

const radius: Theme['radius'] = { card: 16, control: 12 };

const lightTheme: Theme = {
  dark: false,
  colors: Platform.OS === 'ios' ? iosColors(false) : androidLight,
  radius,
};
const darkTheme: Theme = {
  dark: true,
  colors: Platform.OS === 'ios' ? iosColors(true) : androidDark,
  radius,
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme;
}
