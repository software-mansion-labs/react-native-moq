// Binary crosses the RN bridge as base64 (JSON can't carry binary); the encode/
// decode helpers live here so the audio send + receive paths share one alphabet.
const BASE64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const BASE64_LOOKUP = /* @__PURE__ */ (() => {
  const table = new Uint8Array(256);
  for (let i = 0; i < BASE64_CHARS.length; i++) {
    table[BASE64_CHARS.charCodeAt(i)] = i;
  }
  return table;
})();

/* eslint-disable no-bitwise */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const len = base64.length;
  let pad = 0;
  if (len > 0 && base64[len - 1] === '=') pad++;
  if (len > 1 && base64[len - 2] === '=') pad++;
  const byteLength = (len * 3) / 4 - pad;
  const bytes = new Uint8Array(byteLength);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const e1 = BASE64_LOOKUP[base64.charCodeAt(i)] ?? 0;
    const e2 = BASE64_LOOKUP[base64.charCodeAt(i + 1)] ?? 0;
    const e3 = BASE64_LOOKUP[base64.charCodeAt(i + 2)] ?? 0;
    const e4 = BASE64_LOOKUP[base64.charCodeAt(i + 3)] ?? 0;
    bytes[p++] = (e1 << 2) | (e2 >> 4);
    if (p < byteLength) bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (p < byteLength) bytes[p++] = ((e3 & 3) << 6) | e4;
  }
  return bytes.buffer;
}

// charAt (not []) so indexing stays typed `string`, never `string | undefined`.
export function base64Encode(bytes: Uint8Array): string {
  let out = '';
  const len = bytes.length;
  let i = 0;
  for (; i + 2 < len; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out +=
      BASE64_CHARS.charAt((n >> 18) & 63) +
      BASE64_CHARS.charAt((n >> 12) & 63) +
      BASE64_CHARS.charAt((n >> 6) & 63) +
      BASE64_CHARS.charAt(n & 63);
  }
  if (i < len) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < len ? bytes[i + 1]! : 0;
    out += BASE64_CHARS.charAt(b0 >> 2);
    out += BASE64_CHARS.charAt(((b0 & 3) << 4) | (b1 >> 4));
    out += i + 1 < len ? BASE64_CHARS.charAt((b1 & 15) << 2) : '=';
    out += '=';
  }
  return out;
}
/* eslint-enable no-bitwise */
