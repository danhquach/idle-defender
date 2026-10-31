// ID-039, ID-062: Reduce motion and the fight speed are stored on their own and read back
// through an allow-list.
import { describe, expect, it } from 'vitest';
import {
  MOTION_KEY,
  readReduceMotion,
  readSpeed,
  SPEED_KEY,
  writeReduceMotion,
  writeSpeed,
} from './settings.ts';

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

const throwing = {
  getItem: (): string | null => {
    throw new Error('blocked');
  },
  setItem: (): void => {
    throw new Error('full');
  },
};

describe('Reduce motion setting', () => {
  it('follows the system until the player chooses', () => {
    expect(readReduceMotion(memory(), true)).toBe(true);
    expect(readReduceMotion(memory(), false)).toBe(false);
    expect(readReduceMotion(null, true)).toBe(true);
  });

  it('a stored choice wins over the system', () => {
    expect(readReduceMotion(memory({ [MOTION_KEY]: '0' }), true)).toBe(false);
    expect(readReduceMotion(memory({ [MOTION_KEY]: '1' }), false)).toBe(true);
  });

  it('round-trips through storage', () => {
    const s = memory();
    writeReduceMotion(s, true);
    expect(s.data.get(MOTION_KEY)).toBe('1');
    expect(readReduceMotion(s, false)).toBe(true);
    writeReduceMotion(s, false);
    expect(readReduceMotion(s, true)).toBe(false);
  });

  it('anything but the exact stored strings falls back to the system', () => {
    const hostile = [
      'true',
      ' 1',
      '1 ',
      '01',
      '１',
      '1​',
      '‮1',
      '{"__proto__":{"x":1}}',
      'null',
      '',
      '1'.repeat(100_000),
    ];
    for (const v of hostile) {
      expect(readReduceMotion(memory({ [MOTION_KEY]: v }), true)).toBe(true);
      expect(readReduceMotion(memory({ [MOTION_KEY]: v }), false)).toBe(false);
    }
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it('storage that throws or is missing never breaks it', () => {
    expect(readReduceMotion(throwing, true)).toBe(true);
    expect(() => writeReduceMotion(throwing, true)).not.toThrow();
    expect(() => writeReduceMotion(null, true)).not.toThrow();
  });
});

describe('Game speed setting (ID-062)', () => {
  it('starts at 1× until the player chooses', () => {
    expect(readSpeed(memory())).toBe(1);
    expect(readSpeed(null)).toBe(1);
  });

  it('round-trips each speed through storage', () => {
    const s = memory();
    for (const speed of [3, 2, 1] as const) {
      writeSpeed(s, speed);
      expect(s.data.get(SPEED_KEY)).toBe(String(speed));
      expect(readSpeed(s)).toBe(speed);
    }
  });

  it('anything but the exact stored strings falls back to 1×', () => {
    const hostile = [
      '0',
      '4',
      '-3',
      '1.5',
      '3.0',
      ' 3',
      '3 ',
      '03',
      '3e0',
      '0x3',
      'Infinity',
      'NaN',
      '３',
      '٣',
      '3\u200b',
      '\u202e3',
      '"3"',
      '[3]',
      '{"__proto__":{"speed":3}}',
      'constructor',
      'null',
      '',
      '3'.repeat(100_000),
    ];
    for (const v of hostile) expect(readSpeed(memory({ [SPEED_KEY]: v }))).toBe(1);
    expect(({} as Record<string, unknown>).speed).toBeUndefined();
  });

  it('storage that throws or is missing never breaks it', () => {
    expect(readSpeed(throwing)).toBe(1);
    expect(() => writeSpeed(throwing, 3)).not.toThrow();
    expect(() => writeSpeed(null, 3)).not.toThrow();
  });
});
