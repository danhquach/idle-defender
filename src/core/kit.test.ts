// ID-284: the starting pick. A researched ammo card or throwable picked before the horde is held
// at Lv 1 as if it had been the first pick, follows the slot rules, and costs nothing when unset.
import { describe, expect, it } from 'vitest';
import { squadAt } from './balance/shared.ts';
import { chooseCard } from './cards.ts';
import { CARD, STEP, type TechId } from './data.ts';
import type { GameState } from './game.ts';
import { tick, type HordeState, type UpgradeId } from './horde.ts';
import { kitCards, kitOf, pickKit, startSquadHorde } from './hordeonly.ts';
import { playSquadHorde } from './sim.ts';
import { enemy } from './testing.ts';

const ALL_UNLOCKS: TechId[] = [
  'incendiary-rounds',
  'shock-rounds',
  'toxin-rounds',
  'frag-grenades',
  'flashbang',
  'molotov',
];
const game = (tech: TechId[] = ALL_UNLOCKS, kit?: GameState['kit']): GameState => ({
  ...squadAt(5, 5),
  ...(tech.length > 0 ? { tech } : {}),
  ...(kit ? { kit } : {}),
});
const fightOf = (g: GameState): HordeState => startSquadHorde(g, 1, 0);

/** `s` with card `id` offered and taken. */
function pick(s: HordeState, id: UpgradeId): HordeState {
  const t = chooseCard({ ...s, offer: [{ kind: 'upgrade', id }] }, 0);
  t.offer = null;
  return t;
}

describe('the starting pick holds at Lv 1 (ID-284)', () => {
  it('starts the fight holding the picked ammo card and throwable at Lv 1', () => {
    const s = fightOf(game(ALL_UNLOCKS, { ammo: 'incendiary-rounds', throwable: 'frag-grenades' }));
    expect(s.taken).toEqual(['incendiary-rounds', 'frag-grenades']);
    expect(s.cardLevels['incendiary-rounds']).toBe(1);
    expect(s.cardLevels['frag-grenades']).toBe(1);
    // A throwable's timer is set, so the first throw is as soon as an enemy is in reach.
    expect(s.nextThrowAt).toBe(s.time);
    expect(s.offer).toBeNull();
  });

  it('one slot alone, and the other left empty', () => {
    const a = fightOf(game(ALL_UNLOCKS, { ammo: 'shock-rounds' }));
    expect(a.taken).toEqual(['shock-rounds']);
    expect(a.nextThrowAt).toBeUndefined();
    const t = fightOf(game(ALL_UNLOCKS, { throwable: 'molotov' }));
    expect(t.taken).toEqual(['molotov']);
    expect(t.cardLevels.molotov).toBe(1);
  });

  it('Toxin Rounds starts at Lv 1 like the other ammo cards, and refuses without its unlock (ID-285)', () => {
    const s = fightOf(game(ALL_UNLOCKS, { ammo: 'toxin-rounds' }));
    expect(s.taken).toEqual(['toxin-rounds']);
    expect(s.cardLevels['toxin-rounds']).toBe(1);
    expect(pickKit(game(['incendiary-rounds']), 'ammo', 'toxin-rounds')).toEqual({
      ok: false,
      code: 'kit-locked',
    });
    expect(pickKit(game(), 'throwable', 'toxin-rounds')).toEqual({ ok: false, code: 'kit-slot' });
    const swapped = pick(s, 'incendiary-rounds');
    expect(swapped.taken).toEqual(['incendiary-rounds']);
  });

  it('the same card from an offer makes it Lv 2', () => {
    let s = fightOf(game(ALL_UNLOCKS, { ammo: 'incendiary-rounds', throwable: 'flashbang' }));
    s = pick(s, 'incendiary-rounds');
    expect(s.cardLevels['incendiary-rounds']).toBe(2);
    s = pick(s, 'flashbang');
    expect(s.cardLevels.flashbang).toBe(2);
    expect(s.taken.filter((id) => id === 'flashbang')).toHaveLength(1);
  });

  it('the slot’s other card replaces it and its levels are lost', () => {
    let s = fightOf(game(ALL_UNLOCKS, { ammo: 'incendiary-rounds', throwable: 'frag-grenades' }));
    s = pick(s, 'incendiary-rounds');
    s = pick(s, 'shock-rounds');
    expect(s.taken).toContain('shock-rounds');
    expect(s.taken).not.toContain('incendiary-rounds');
    expect(s.cardLevels['incendiary-rounds']).toBeUndefined();
    expect(s.cardLevels['shock-rounds']).toBe(1);
    s = pick(s, 'molotov');
    expect(s.taken).not.toContain('frag-grenades');
    expect(s.cardLevels['frag-grenades']).toBeUndefined();
    expect(s.cardLevels.molotov).toBe(1);
  });

  it('a starting throwable throws at the first enemy in reach', () => {
    const s = fightOf(game(ALL_UNLOCKS, { throwable: 'frag-grenades' }));
    s.toSpawn = 0;
    const d = s.defenders[0]!;
    enemy(s, { hp: 1e6, maxHp: 1e6, x: d.x + CARD.frag.range + 60, y: d.y });
    // Out of reach: nothing thrown.
    expect(tick(s, STEP).grenades).toHaveLength(0);
    s.enemies[0]!.x = d.x + CARD.frag.range - 20;
    expect(tick(s, STEP).grenades).toHaveLength(1);
  });

  it('the pick skips the offer’s own gate: Flashbang needs a crowd to be offered, not to start', () => {
    const s = fightOf(game(ALL_UNLOCKS, { throwable: 'flashbang' }));
    expect(s.enemies.length).toBeLessThan(CARD.crowd);
    expect(s.taken).toContain('flashbang');
  });

  it('mode, horde number and replay make no difference', () => {
    const g = game(ALL_UNLOCKS, { ammo: 'shock-rounds' });
    expect(startSquadHorde(g, 1, 0, 3).taken).toEqual(['shock-rounds']);
    expect(startSquadHorde({ ...g, hordeNumber: 9 }, 2, 0, 9).taken).toEqual(['shock-rounds']);
    const hard: GameState = { ...g, modes: { nightmare: g.hordeNumber, hell: 0 } as never };
    expect(startSquadHorde(hard, 1, 0).taken).toEqual(['shock-rounds']);
  });

  it('draws no RNG and spends no offer: the fight’s first level-up offers what it would have', () => {
    const plain = fightOf(game());
    const kit = fightOf(
      game(ALL_UNLOCKS, { ammo: 'incendiary-rounds', throwable: 'frag-grenades' }),
    );
    expect(kit.rng).toEqual(plain.rng);
    expect(kit.level).toBe(plain.level);
    expect(kit.xp).toBe(plain.xp);
  });
});

describe('pickKit (ID-284)', () => {
  it('sets a slot and clears it with null; the game has no kit key with none', () => {
    const g = game();
    expect('kit' in g).toBe(false);
    const a = pickKit(g, 'ammo', 'shock-rounds');
    expect(a.ok && a.game.kit).toEqual({ ammo: 'shock-rounds' });
    const b = pickKit(a.ok ? a.game : g, 'throwable', 'molotov');
    expect(b.ok && b.game.kit).toEqual({ ammo: 'shock-rounds', throwable: 'molotov' });
    const c = pickKit(b.ok ? b.game : g, 'ammo', null);
    expect(c.ok && c.game.kit).toEqual({ throwable: 'molotov' });
    const d = pickKit(c.ok ? c.game : g, 'throwable', null);
    expect(d.ok && 'kit' in d.game).toBe(false);
    // Changing a pick swaps it.
    const e = pickKit(b.ok ? b.game : g, 'ammo', 'incendiary-rounds');
    expect(e.ok && e.game.kit).toEqual({ ammo: 'incendiary-rounds', throwable: 'molotov' });
  });

  it('refuses a locked card, a card of the other slot and an unknown id', () => {
    const g = game(['incendiary-rounds']);
    expect(pickKit(g, 'ammo', 'shock-rounds')).toEqual({ ok: false, code: 'kit-locked' });
    expect(pickKit(g, 'throwable', 'molotov')).toEqual({ ok: false, code: 'kit-locked' });
    // The other slot's card, even unlocked.
    expect(pickKit(g, 'throwable', 'incendiary-rounds')).toEqual({ ok: false, code: 'kit-slot' });
    expect(pickKit(game(), 'ammo', 'frag-grenades')).toEqual({ ok: false, code: 'kit-slot' });
    expect(pickKit(game(), 'ammo', 'sharpshooter')).toEqual({ ok: false, code: 'kit-slot' });
    expect(pickKit(game(), 'ammo', 'nope' as UpgradeId)).toEqual({ ok: false, code: 'kit-slot' });
    expect(pickKit(game(), 'ammo', '__proto__' as UpgradeId)).toEqual({
      ok: false,
      code: 'kit-slot',
    });
    expect(pickKit(game(), 'constructor' as never, 'shock-rounds')).toEqual({
      ok: false,
      code: 'kit-slot',
    });
    // A Mk is not a card.
    expect(
      pickKit(game([...ALL_UNLOCKS, 'shock-rounds-mk2']), 'ammo', 'shock-rounds-mk2' as never),
    ).toEqual({
      ok: false,
      code: 'kit-slot',
    });
  });

  it('does not change the game it was given', () => {
    const g = game();
    const before = JSON.stringify(g);
    pickKit(g, 'ammo', 'shock-rounds');
    expect(JSON.stringify(g)).toBe(before);
  });

  it('kitCards lists the unlocked cards of a slot, in the slot’s order', () => {
    expect(kitCards(game([]), 'ammo')).toEqual([]);
    expect(kitCards(game(), 'ammo')).toEqual(['incendiary-rounds', 'shock-rounds', 'toxin-rounds']);
    expect(kitCards(game(['toxin-rounds']), 'ammo')).toEqual(['toxin-rounds']);
    expect(kitCards(game(), 'throwable')).toEqual(['frag-grenades', 'flashbang', 'molotov']);
    expect(kitCards(game(['molotov']), 'throwable')).toEqual(['molotov']);
    // A Mk alone unlocks nothing.
    expect(kitCards(game(['incendiary-rounds-mk2' as TechId]), 'ammo')).toEqual([]);
  });
});

describe('a pick whose unlock is gone drops to none (ID-284)', () => {
  it('kitOf reads each pick only while its unlock is researched', () => {
    expect(kitOf(game(ALL_UNLOCKS, { ammo: 'shock-rounds', throwable: 'molotov' }))).toEqual({
      ammo: 'shock-rounds',
      throwable: 'molotov',
    });
    expect(kitOf(game(['molotov'], { ammo: 'shock-rounds', throwable: 'molotov' }))).toEqual({
      throwable: 'molotov',
    });
    expect(kitOf(game([], { ammo: 'shock-rounds' }))).toEqual({});
    expect(kitOf(game())).toEqual({});
    // A card of the wrong slot in the pick is never read.
    expect(kitOf(game(ALL_UNLOCKS, { ammo: 'molotov' }))).toEqual({});
  });

  it('the fight with such a pick is the unpicked fight, digest for digest', () => {
    const none = game(['reinforced-wall']);
    const gone = game(['reinforced-wall'], {
      ammo: 'incendiary-rounds',
      throwable: 'frag-grenades',
    });
    expect(JSON.stringify(fightOf(gone))).toBe(JSON.stringify(fightOf(none)));
    expect(JSON.stringify(playSquadHorde(gone, 7, undefined, undefined, 5))).toBe(
      JSON.stringify(playSquadHorde(none, 7, undefined, undefined, 5)),
    );
  });
});

describe('with nothing picked the game is what it was (ID-284)', () => {
  it('has no kit key, and unlocks alone change nothing in the fight', () => {
    const bare = squadAt(5, 5);
    expect('kit' in bare).toBe(false);
    const unlocked = game();
    // Against the bare game: the same fight but for the researched list itself.
    const strip = (s: HordeState) => JSON.stringify({ ...s, tech: undefined });
    expect(strip(fightOf(unlocked))).toBe(strip(fightOf(bare)));
    expect(strip(playSquadHorde(unlocked, 7, undefined, undefined, 5))).toBe(
      strip(playSquadHorde(bare, 7, undefined, undefined, 5)),
    );
    expect('kit' in fightOf(unlocked)).toBe(false);
    expect(fightOf(unlocked).taken).toEqual([]);
  });
});
