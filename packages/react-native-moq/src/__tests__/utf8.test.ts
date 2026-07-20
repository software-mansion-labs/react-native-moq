import { describe, expect, it } from '@jest/globals';
import { utf8Decode } from '../utf8';

// Node's global TextEncoder is the reference; declared to avoid @types/node.
declare const TextEncoder: new () => { encode(input: string): Uint8Array };

const R = '�';

describe('utf8Decode', () => {
  it('round-trips valid UTF-8 across all sequence widths', () => {
    const samples = [
      '',
      'hello world',
      'zażółć gęślą jaźń',
      '日本語のテキスト',
      '\u{1F468}‍\u{1F469}‍\u{1F467} \u{1F3A5} live',
      String.fromCodePoint(0x0000, 0x007f), // 1-byte boundaries
      String.fromCodePoint(0x0080, 0x07ff), // 2-byte boundaries
      String.fromCodePoint(0x0800, 0xffff), // 3-byte boundaries
      String.fromCodePoint(0x10000, 0x10ffff), // 4-byte boundaries
    ];
    for (const s of samples) {
      expect(utf8Decode(new TextEncoder().encode(s))).toBe(s);
    }
  });

  it('replaces invalid lead and continuation bytes', () => {
    expect(utf8Decode(Uint8Array.from([0x61, 0xff, 0x62]))).toBe(`a${R}b`);
    // 0xc1 is never a valid lead byte.
    expect(utf8Decode(Uint8Array.from([0xc1, 0xbf]))).toBe(`${R}${R}`);
    // Lead byte followed by a non-continuation byte.
    expect(utf8Decode(Uint8Array.from([0xc3, 0x41]))).toBe(`${R}A`);
  });

  it('replaces truncated sequences at end of input', () => {
    expect(utf8Decode(Uint8Array.from([0xc3]))).toBe(R);
    expect(utf8Decode(Uint8Array.from([0xe2, 0x82]))).toBe(R);
    expect(utf8Decode(Uint8Array.from([0xf0, 0x9f, 0x8e]))).toBe(R);
  });

  it('rejects overlong encodings', () => {
    // 3-byte encoding of U+0000.
    expect(utf8Decode(Uint8Array.from([0xe0, 0x80, 0x80]))).toBe(R);
    // 4-byte encoding of '/' (0x2f).
    expect(utf8Decode(Uint8Array.from([0xf0, 0x80, 0x80, 0xaf]))).toBe(R);
  });

  it('rejects encoded surrogates instead of emitting lone surrogates', () => {
    expect(utf8Decode(Uint8Array.from([0xed, 0xa0, 0x80]))).toBe(R);
    expect(utf8Decode(Uint8Array.from([0xed, 0xbf, 0xbf]))).toBe(R);
  });

  it('keeps decoding after a replacement', () => {
    const bytes = Uint8Array.from([
      ...new TextEncoder().encode('ok:'),
      0xff,
      ...new TextEncoder().encode('\u{1F44D}'),
    ]);
    expect(utf8Decode(bytes)).toBe(`ok:${R}\u{1F44D}`);
  });
});
