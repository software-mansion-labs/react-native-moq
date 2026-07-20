import { describe, expect, it } from '@jest/globals';
import { base64Encode, base64ToArrayBuffer } from '../base64';

// Node's Buffer is the reference codec; declared locally to avoid @types/node.
declare const Buffer: {
  from(data: Uint8Array | number[]): { toString(encoding: 'base64'): string };
};

// Deterministic PRNG so failures reproduce.
/* eslint-disable no-bitwise */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* eslint-enable no-bitwise */

function randomBytes(length: number, rand: () => number): Uint8Array {
  return Uint8Array.from({ length }, () => Math.floor(rand() * 256));
}

describe('base64Encode', () => {
  it('matches Buffer for every length 0..64', () => {
    const rand = mulberry32(1);
    for (let len = 0; len <= 64; len++) {
      const bytes = randomBytes(len, rand);
      expect(base64Encode(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    }
  });

  it('respects Uint8Array views with a byteOffset', () => {
    const backing = Uint8Array.from([1, 2, 3, 4, 5, 6]);
    const view = backing.subarray(2, 5);
    expect(base64Encode(view)).toBe(Buffer.from([3, 4, 5]).toString('base64'));
  });
});

describe('base64ToArrayBuffer', () => {
  it('matches Buffer for every length 0..64', () => {
    const rand = mulberry32(2);
    for (let len = 0; len <= 64; len++) {
      const bytes = randomBytes(len, rand);
      const decoded = base64ToArrayBuffer(
        Buffer.from(bytes).toString('base64')
      );
      expect(new Uint8Array(decoded)).toEqual(bytes);
    }
  });

  it('handles the padding variants', () => {
    expect(new Uint8Array(base64ToArrayBuffer('QQ=='))).toEqual(
      Uint8Array.from([0x41])
    );
    expect(new Uint8Array(base64ToArrayBuffer('QUI='))).toEqual(
      Uint8Array.from([0x41, 0x42])
    );
    expect(new Uint8Array(base64ToArrayBuffer('QUJD'))).toEqual(
      Uint8Array.from([0x41, 0x42, 0x43])
    );
    expect(base64ToArrayBuffer('').byteLength).toBe(0);
  });

  it('round-trips large random payloads', () => {
    const rand = mulberry32(3);
    const bytes = randomBytes(4096 + 1, rand);
    expect(new Uint8Array(base64ToArrayBuffer(base64Encode(bytes)))).toEqual(
      bytes
    );
  });
});
