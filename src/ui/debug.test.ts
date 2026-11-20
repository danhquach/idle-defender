// Debug mode's typed fields (ID-197): digits only, within the field's range; anything else
// is refused, never clamped or read past.
import { describe, expect, it } from 'vitest';
import { DEBUG_LIMITS } from '../core/debug.ts';
import { parseWhole } from './debug.ts';

describe('a typed debug number (ID-197)', () => {
  it('takes plain digits within the range, ends included', () => {
    expect(parseWhole('1', DEBUG_LIMITS.horde)).toBe(1);
    expect(parseWhole('999', DEBUG_LIMITS.horde)).toBe(999);
    expect(parseWhole('007', DEBUG_LIMITS.horde)).toBe(7);
    expect(parseWhole('0', DEBUG_LIMITS.seed)).toBe(0);
    expect(parseWhole('4294967295', DEBUG_LIMITS.seed)).toBe(4294967295);
  });

  it.each([
    '',
    ' ',
    '0',
    '1000',
    ' 5',
    '5 ',
    '+5',
    '-1',
    '1.0',
    '1e3',
    '0x10',
    '0b1',
    '1_000',
    'NaN',
    'Infinity',
    '__proto__',
    'constructor',
    '5\u200b',
    '\u202e5',
    '\u0665',
    '\uff15',
    '5\n',
    '<img src=x onerror=alert(1)>',
    '9'.repeat(11),
    '1'.repeat(10_000),
  ])('refuses %j for a horde', (raw) => {
    expect(parseWhole(raw, DEBUG_LIMITS.horde)).toBeNull();
  });

  it('refuses a seed past 32 bits and anything that is not a string', () => {
    expect(parseWhole('4294967296', DEBUG_LIMITS.seed)).toBeNull();
    expect(parseWhole(5 as never, DEBUG_LIMITS.horde)).toBeNull();
    expect(parseWhole(null as never, DEBUG_LIMITS.horde)).toBeNull();
  });
});
