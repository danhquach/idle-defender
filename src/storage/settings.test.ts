// ID-039, ID-062, ID-080, ID-085, ID-106: Reduce motion, the fight speed, sound, chatter and the how-to card are stored on their own
// and read back through an allow-list.
import { describe, expect, it } from 'vitest';
import {
  CHATTER_KEY,
  clampVolume,
  HOW_TO_SEEN_KEY,
  MOTION_KEY,
  MUTE_KEY,
  readChatter,
  readHowToSeen,
  readReduceMotion,
  readSound,
  readSpeed,
  SPEED_KEY,
  VOLUME_DEFAULTS,
  VOLUME_KEYS,
  writeChatter,
  writeHowToSeen,
  writeMute,
  writeReduceMotion,
  writeSpeed,
  writeVolume,
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

describe('Sound settings (ID-080)', () => {
  const defaults = { volumes: { ...VOLUME_DEFAULTS }, muted: false };

  it('starts at the defaults, unmuted, until the player chooses', () => {
    expect(readSound(memory())).toEqual(defaults);
    expect(readSound(null)).toEqual(defaults);
    expect(VOLUME_DEFAULTS).toEqual({ master: 80, music: 60, effects: 80 });
  });

  it('round-trips every volume and the mute through storage', () => {
    const s = memory();
    for (const [which, level] of [
      ['master', 0],
      ['music', 100],
      ['effects', 45],
    ] as const) {
      writeVolume(s, which, level);
      expect(s.data.get(VOLUME_KEYS[which])).toBe(String(level));
    }
    writeMute(s, true);
    expect(s.data.get(MUTE_KEY)).toBe('1');
    expect(readSound(s)).toEqual({ volumes: { master: 0, music: 100, effects: 45 }, muted: true });
    writeMute(s, false);
    expect(readSound(s).muted).toBe(false);
  });

  it('writes only 0–100 in steps of 5', () => {
    const s = memory();
    for (const [level, stored] of [
      [-5, '0'],
      [150, '100'],
      [33.6, '35'],
      [62, '60'],
      [Number.NaN, '0'],
      [Number.POSITIVE_INFINITY, '0'],
    ] as const) {
      writeVolume(s, 'music', level);
      expect(s.data.get(VOLUME_KEYS.music)).toBe(stored);
    }
    expect(clampVolume(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it('anything but the exact stored strings falls back to the default', () => {
    const hostile = [
      '-1',
      '101',
      '1000',
      '007',
      '62',
      '3',
      '99',
      '00',
      '5.5',
      '50.0',
      ' 50',
      '50 ',
      '+50',
      '5e1',
      '0x32',
      'Infinity',
      'NaN',
      '５０',
      '٥٠',
      '50\u200b',
      '\u202e50',
      '"50"',
      '[50]',
      '{"__proto__":{"volume":50}}',
      'constructor',
      'null',
      '',
      '5'.repeat(100_000),
    ];
    for (const v of hostile) {
      const s = memory({
        [VOLUME_KEYS.master]: v,
        [VOLUME_KEYS.music]: v,
        [VOLUME_KEYS.effects]: v,
        [MUTE_KEY]: v,
      });
      expect(readSound(s)).toEqual(defaults);
    }
    for (const v of ['true', ' 1', '1 ', '01', '１', '1\u200b', 'yes']) {
      expect(readSound(memory({ [MUTE_KEY]: v })).muted).toBe(false);
    }
    expect(({} as Record<string, unknown>).volume).toBeUndefined();
  });

  it('a bad value spoils only its own setting', () => {
    const s = memory({ [VOLUME_KEYS.master]: 'x', [VOLUME_KEYS.music]: '15', [MUTE_KEY]: '1' });
    expect(readSound(s)).toEqual({
      volumes: { master: 80, music: 15, effects: 80 },
      muted: true,
    });
  });

  it('storage that throws or is missing never breaks it', () => {
    expect(readSound(throwing)).toEqual(defaults);
    expect(() => writeVolume(throwing, 'master', 10)).not.toThrow();
    expect(() => writeMute(throwing, true)).not.toThrow();
    expect(() => writeVolume(null, 'master', 10)).not.toThrow();
    expect(() => writeMute(null, true)).not.toThrow();
  });
});

describe('Chatter setting (ID-085)', () => {
  it('starts at Full and reads back what was written', () => {
    const store = memory();
    expect(readChatter(store)).toBe('full');
    for (const level of ['off', 'low', 'full'] as const) {
      writeChatter(store, level);
      expect(store.data.get(CHATTER_KEY)).toBe(level);
      expect(readChatter(store)).toBe(level);
    }
  });

  it('reads anything but the exact strings it writes as Full', () => {
    const hostile = [
      '',
      'OFF',
      ' off',
      'off ',
      'of​f',
      '‮off',
      'оff', // Cyrillic о
      'low\0',
      '"off"',
      '{"__proto__":{"polluted":1}}',
      '<img src=x onerror=alert(1)>',
      'off'.repeat(100_000),
      'constructor',
      '__proto__',
      'toString',
    ];
    for (const raw of hostile) {
      expect(readChatter(memory({ [CHATTER_KEY]: raw }))).toBe('full');
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('plays on where storage is blocked or full', () => {
    expect(readChatter(throwing)).toBe('full');
    expect(readChatter(null)).toBe('full');
    expect(() => writeChatter(throwing, 'off')).not.toThrow();
    expect(() => writeChatter(null, 'low')).not.toThrow();
  });
});

describe('How-to-play card seen (ID-106)', () => {
  it('starts unseen and reads back as seen once written', () => {
    const store = memory();
    expect(readHowToSeen(store)).toBe(false);
    writeHowToSeen(store);
    expect(store.data.get(HOW_TO_SEEN_KEY)).toBe('1');
    expect(readHowToSeen(store)).toBe(true);
  });

  it('reads anything but the exact "1" as unseen', () => {
    const hostile = [
      '',
      '0',
      'true',
      ' 1',
      '1 ',
      '1​',
      '‮1',
      '١', // Arabic-Indic one
      '"1"',
      '{"__proto__":{"polluted":1}}',
      '<img src=x onerror=alert(1)>',
      '1'.repeat(100_000),
      '__proto__',
    ];
    for (const raw of hostile) {
      expect(readHowToSeen(memory({ [HOW_TO_SEEN_KEY]: raw }))).toBe(false);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('plays on where storage is blocked or full', () => {
    expect(readHowToSeen(throwing)).toBe(false);
    expect(readHowToSeen(null)).toBe(false);
    expect(() => writeHowToSeen(throwing)).not.toThrow();
    expect(() => writeHowToSeen(null)).not.toThrow();
  });
});
