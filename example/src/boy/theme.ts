/* eslint-disable no-bitwise -- djb2 hash + HSV math, ported verbatim */
// Color palette + cartridge-color hashing ported from moq-kit's iOS demo
// (MoQDemo/Features/Boy/Models/BoyModels.swift). SwiftUI Color(red:green:blue:)
// values are 0…1; converted to hex here.
export const boyColors = {
  shellTop: '#E6E0C9',
  shellBottom: '#D1CCB5',
  shellEdge: '#ABA391',
  screenBezel: '#3D404F',
  screenFill: '#9EB578',
  screenInk: '#26361A',
  brand: '#423873',
  label: '#333345',
  subLabel: '#636173',
  metal: '#9199A8',
  flipButton: '#756994',
  buttonTop: '#40454F',
  buttonBottom: '#14171C',
  buttonPressedTop: '#2B2E36',
  buttonPressedBottom: '#0A0B11',
  actionTop: '#852E4F',
  actionBottom: '#4F142B',
  actionPressedTop: '#631A38',
  actionDisabledTop: '#63424C',
  actionDisabledBottom: '#3D2933',
  actionLabel: '#3B3057',
  indicator: '#BF1A36',
  batteryOff: '#8F9499',
  batteryOn: '#4FCC5C',
  slot: '#6B6673',
  cartridge: '#7D7D87',
  cartridgeDark: '#4D4D57',
  backPanel: '#BDB8A3',
} as const;

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const hp = (h % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = v - c;
  const to = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

// Mirrors BoyCartridgePalette.colors(for:) — a stable djb2 hash of the game
// name maps to a hue, giving every cartridge a distinct two-tone color.
export function cartridgeColors(name: string | null): {
  top: string;
  bottom: string;
} {
  if (!name) {
    return { top: boyColors.cartridge, bottom: boyColors.cartridgeDark };
  }
  let hash = 5381;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) + hash + name.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  const saturation = 0.42 + ((hash >>> 7) % 20) / 100;
  const brightness = 0.56 + ((hash >>> 13) % 16) / 100;
  return {
    top: hsvToHex(hue, Math.min(0.82, saturation), Math.min(0.86, brightness)),
    bottom: hsvToHex(
      hue,
      Math.min(0.92, saturation + 0.14),
      Math.max(0.24, brightness - 0.28)
    ),
  };
}
