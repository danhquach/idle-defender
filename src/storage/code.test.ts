import { describe, expect, it } from 'vitest';
import { newGame } from '../core/game.ts';
import { CODE_TAG, exportCode, importCode, MAX_CODE_CHARS, MAX_PASTE_CHARS } from './code.ts';
import { encodeSave } from './save.ts';
import { NOW, played } from './testing.ts';
const code = (): string => exportCode(encodeSave(played(), NOW));

describe('backup code', () => {
  it('is one line behind the tag and loads back the same game', () => {
    const c = code();
    expect(c.startsWith(CODE_TAG)).toBe(true);
    expect(c).toMatch(/^ID1:[A-Za-z0-9+/]+={0,2}$/);
    expect(importCode(c)).toEqual({ ok: true, save: { game: played(), savedAt: NOW } });
    expect(importCode(exportCode(encodeSave(newGame(), 0)))).toMatchObject({ ok: true });
  });

  it('ignores ASCII spaces and line breaks a mail or notes app adds', () => {
    const c = code();
    const wrapped = `  ${c.slice(0, 40)}\r\n${c.slice(40, 90)}\n\t${c.slice(90)}  `;
    expect(importCode(wrapped)).toMatchObject({ ok: true });
  });

  it('says why a paste is refused', () => {
    expect(importCode('')).toEqual({ ok: false, why: 'empty' });
    expect(importCode(' \n\t ')).toEqual({ ok: false, why: 'empty' });
    expect(importCode(undefined)).toEqual({ ok: false, why: 'bad' });
    expect(importCode(42)).toEqual({ ok: false, why: 'bad' });
    expect(importCode('hello')).toEqual({ ok: false, why: 'bad' });
    expect(importCode(code().replace(CODE_TAG, 'OI1:'))).toEqual({ ok: false, why: 'bad' });
  });

  it('refuses an oversized paste before any work', () => {
    expect(importCode('A'.repeat(MAX_PASTE_CHARS + 1))).toEqual({ ok: false, why: 'tooBig' });
    expect(importCode(CODE_TAG + 'A'.repeat(MAX_CODE_CHARS))).toEqual({ ok: false, why: 'tooBig' });
  });

  it('refuses hidden marks and look-alikes in the code', () => {
    const c = code();
    const mid = Math.floor(c.length / 2);
    for (const mark of ['​', '‮', '﻿', ' ', ' ']) {
      expect(importCode(c.slice(0, mid) + mark + c.slice(mid))).toEqual({ ok: false, why: 'bad' });
    }
    expect(importCode(c.replace('ID1:', 'IД1:'))).toEqual({ ok: false, why: 'bad' });
  });

  it('refuses broken base64, bad UTF-8 and a hostile save inside', () => {
    const c = code();
    expect(importCode(c.slice(0, -1))).toEqual({ ok: false, why: 'bad' }); // length not a multiple of 4
    expect(importCode(CODE_TAG + 'ab=c')).toEqual({ ok: false, why: 'bad' });
    expect(importCode(CODE_TAG + btoa('\xff\xfe\xfd'))).toEqual({ ok: false, why: 'bad' });
    const evil = encodeSave(played(), NOW).replace('"Bob"', '"<img src=x onerror=alert(1)>"');
    expect(importCode(exportCode(evil))).toEqual({ ok: false, why: 'bad' });
    const proto = encodeSave(played(), NOW).replace(
      '"hordeNumber"',
      '"__proto__":{"x":1},"hordeNumber"',
    );
    expect(importCode(exportCode(proto))).toEqual({ ok: false, why: 'bad' });
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it('checks a long paste in linear time (no ReDoS)', () => {
    const started = performance.now();
    importCode(CODE_TAG + 'A'.repeat(MAX_CODE_CHARS - CODE_TAG.length - 1) + '!');
    importCode(' '.repeat(MAX_PASTE_CHARS));
    expect(performance.now() - started).toBeLessThan(500);
  });
});
