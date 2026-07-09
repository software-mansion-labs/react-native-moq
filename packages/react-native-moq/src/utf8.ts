/* eslint-disable no-bitwise */
// Data payloads cross the bridge as base64-wrapped UTF-8; Hermes has no
// TextDecoder, so the receive path decodes here. Malformed sequences produce
// U+FFFD like TextDecoder would.
export function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  const len = bytes.length;
  while (i < len) {
    const b0 = bytes[i++]!;
    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
      continue;
    }
    let needed: number;
    let cp: number;
    if (b0 >= 0xc2 && b0 < 0xe0) {
      needed = 1;
      cp = b0 & 0x1f;
    } else if (b0 >= 0xe0 && b0 < 0xf0) {
      needed = 2;
      cp = b0 & 0x0f;
    } else if (b0 >= 0xf0 && b0 < 0xf5) {
      needed = 3;
      cp = b0 & 0x07;
    } else {
      out += '�';
      continue;
    }
    if (i + needed > len) {
      out += '�';
      break;
    }
    let ok = true;
    for (let k = 0; k < needed; k++) {
      const b = bytes[i + k]!;
      if ((b & 0xc0) !== 0x80) {
        ok = false;
        break;
      }
      cp = (cp << 6) | (b & 0x3f);
    }
    if (!ok) {
      out += '�';
      continue;
    }
    i += needed;
    if (cp >= 0x10000) {
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else {
      out += String.fromCharCode(cp);
    }
  }
  return out;
}
/* eslint-enable no-bitwise */
