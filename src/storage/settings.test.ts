// ID-039: the Reduce motion setting is stored on its own and read back through an allow-list.
import { describe, expect, it } from 'vitest';
import { MOTION_KEY, readReduceMotion, writeReduceMotion } from './settings.ts';

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
