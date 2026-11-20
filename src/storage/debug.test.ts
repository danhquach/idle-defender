// Debug mode (ID-197): only `?debug=1` turns it on, and its storage moves the save to a
// slot of its own, so the player's save is never read or written.
import { describe, expect, it } from 'vitest';
import { newGame } from '../core/game.ts';
import { DEBUG_REJECTED_KEY, DEBUG_SAVE_KEY, debugFlag, debugStorage } from './debug.ts';
import { loadSave, REJECTED_KEY, SAVE_KEY, writeSave } from './save.ts';
import { NOW } from './testing.ts';

/** A plain in-memory storage that records every key touched. */
function memory(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  const touched: string[] = [];
  return {
    data,
    touched,
    getItem: (k: string) => (touched.push(k), data.get(k) ?? null),
    setItem: (k: string, v: string) => void (touched.push(k), data.set(k, v)),
  };
}

describe('the debug flag (ID-197)', () => {
  it('is on for exactly one debug=1, wherever it stands in the query', () => {
    expect(debugFlag('?debug=1')).toBe(true);
    expect(debugFlag('debug=1')).toBe(true);
    expect(debugFlag('?mute=1&debug=1')).toBe(true);
  });

  it.each([
    '',
    '?',
    '?debug',
    '?debug=',
    '?debug=0',
    '?debug=true',
    '?debug=yes',
    '?debug=01',
    '?debug=1.0',
    '?debug=+1',
    '?debug=1 ',
    '?debug=%201',
    '?debug=1&debug=1',
    '?debug=1&debug=0',
    '?DEBUG=1',
    '?debug[]=1',
    '?__proto__=1',
    '?debug=1\u200b',
    '?debug=\u202e1',
    '?debug=\uff11',
    '?debug=<script>alert(1)</script>',
    '?debug=%E0%A4%A',
    `?x=${'a'.repeat(300)}&debug=1`,
  ])('is off for %j', (search) => {
    expect(debugFlag(search)).toBe(false);
  });

  it('is off for anything that is not a string', () => {
    expect(debugFlag(null as never)).toBe(false);
    expect(debugFlag({ toString: () => '?debug=1' } as never)).toBe(false);
  });
});

describe('the debug save slot (ID-197)', () => {
  it('writes and reads the camp under its own key; the real save is never touched', () => {
    const realRaw = 'the player’s own save';
    const store = memory({ [SAVE_KEY]: realRaw });
    const slot = debugStorage(store);
    expect(loadSave(slot).save).toBeNull();
    expect(writeSave(slot, newGame('horde', 1), NOW)).toBe(true);
    expect(loadSave(slot).save?.game.hordeNumber).toBe(1);
    expect(store.data.get(SAVE_KEY)).toBe(realRaw);
    expect(store.touched).not.toContain(SAVE_KEY);
    expect(store.touched).toContain(DEBUG_SAVE_KEY);
  });

  it('sets an unreadable debug save aside in its own rejected key', () => {
    const store = memory({ [DEBUG_SAVE_KEY]: '{"not":"a save"}', [REJECTED_KEY]: 'old' });
    expect(loadSave(debugStorage(store)).rejected).toBe(true);
    expect(store.data.get(DEBUG_REJECTED_KEY)).toBe('{"not":"a save"}');
    expect(store.data.get(REJECTED_KEY)).toBe('old');
  });

  it('passes every other key (settings) through as it is', () => {
    const store = memory({ 'idle-defender.mute': '1' });
    expect(debugStorage(store).getItem('idle-defender.mute')).toBe('1');
  });
});
