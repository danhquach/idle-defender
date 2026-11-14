// The Roster's gun picker, as data (ID-108): the tiles a survivor can swap to (the free
// pistol and every stash gun but the one held, strongest first by dmg/s in their hands,
// ID-152), each with its change against the held gun, and the Now / New / Change comparison
// for one of them. Pure: no DOM, so the wording is testable.
import {
  affixLines,
  baseOf,
  gunLevel,
  heldName,
  isOwned,
  roleOf,
  statsOf,
  type Held,
} from '../core/armoury.ts';
import { RARITIES, WEAPONS, type Rarity } from '../core/data.ts';
import type { GameState, RosterDefender } from '../core/game.ts';
import { squadSpec } from '../core/hordeonly.ts';
import { isGun } from '../core/loadout.ts';
import { survivorDps, type Statted } from '../core/stats.ts';

/** The gun `d` fights with: a primary that is no gun fights as the pistol (as squadGear). */
export const heldGunOf = (d: RosterDefender): Held =>
  isGun(d.loadout.primary) ? d.loadout.primary : 'pistol';

const MINUS = '−';
const f1 = (n: number): string => n.toFixed(1);
const f2 = (n: number): string => n.toFixed(2);

/** The rarity a held gun is framed in. */
export const rarityOf = (h: Held): Rarity => (isOwned(h) ? h.rarity : 'common');

/** "Lv 3 Military Rifle" for a stash gun; the free pistol is just "Pistol". */
export const gunName = (h: Held): string =>
  isOwned(h) ? `Lv ${gunLevel(h)} ${heldName(h)}` : heldName(h);

export type DeltaKind = 'up' | 'down' | 'same';

/** A gun's dmg/s against the held gun's: the symbol and number, and the same in words. */
export interface Delta {
  kind: DeltaKind;
  /** "▲ +4.2", "▼ 1.1" or "= same". */
  text: string;
  /** "4.2 more dmg/s", "1.1 less dmg/s" or "same dmg/s" (screen readers). */
  words: string;
}

/** Under this many dmg/s apart, two guns count as the same. */
const SAME = 0.05;

/** A gun's dmg/s in survivor `who`'s hands (level and profession, ID-152). */
const dpsOf = (h: Held, who: Statted): number => survivorDps(who, h);

export function deltaOf(held: Held, other: Held, who: Statted): Delta {
  const d = dpsOf(other, who) - dpsOf(held, who);
  if (Math.abs(d) < SAME) return { kind: 'same', text: '= same', words: 'same dmg/s' };
  return d > 0
    ? { kind: 'up', text: `▲ +${f1(d)}`, words: `${f1(d)} more dmg/s` }
    : { kind: 'down', text: `▼ ${f1(-d)}`, words: `${f1(-d)} less dmg/s` };
}

/** One tile of the picker. */
export interface GunTile {
  /** What `equipGun` takes: 'pistol', or the stash gun's uid. */
  choice: string;
  held: Held;
  /** The base gun: "SMG", "Sniper rifle". */
  type: string;
  free: boolean;
  rarity: Rarity;
  power: number;
  /** "12.4" */
  dps: string;
  delta: Delta;
  /** The screen-reader name: gun, rarity, dmg/s and the change. */
  label: string;
}

/**
 * The guns survivor `id` can swap to (ID-108): the free pistol and every stash gun except
 * the one held, strongest first by dmg/s in their hands (`survivorDps`: their level and
 * profession, ID-152; a stable sort: equal guns keep stash order).
 */
export function gunTiles(game: Pick<GameState, 'roster' | 'armoury'>, id: string): GunTile[] {
  const d = game.roster.find((r) => r.id === id);
  if (!d) return [];
  const who = squadSpec(d);
  const held = heldGunOf(d);
  const options: Held[] = [
    ...(isOwned(held) ? ['pistol' as Held] : []),
    ...game.armoury.filter((w) => isGun(w) && !(isOwned(held) && w.uid === held.uid)),
  ];
  return options
    .map((h) => ({ h, power: dpsOf(h, who) }))
    .sort((a, b) => b.power - a.power)
    .map(({ h, power }) => {
      const delta = deltaOf(held, h, who);
      const free = !isOwned(h);
      return {
        choice: isOwned(h) ? h.uid : 'pistol',
        held: h,
        type: WEAPONS[baseOf(h)].name,
        free,
        rarity: rarityOf(h),
        power,
        dps: f1(power),
        delta,
        label: `${gunName(h)}, ${RARITIES[rarityOf(h)].name} rarity, ${f1(power)} dmg/s, ${delta.words} than ${gunName(held)}${free ? ', free' : ''}`,
      };
    });
}

/** The choice the picker opens on: the best gun that beats the held one, else null. */
export const bestUpgrade = (tiles: readonly GunTile[]): string | null =>
  tiles[0] && tiles[0].delta.kind === 'up' ? tiles[0].choice : null;

/** One row of the comparison. */
export interface CompareRow {
  label: string;
  now: string;
  next: string;
  /** The change in words: "1.50 s slower", "80 px shorter", "same". */
  change: string;
  tone: 'better' | 'worse' | '';
}

export interface GunCompare {
  /** "▲ Stronger: +8.9 dmg/s (+72%)", "▼ Weaker: −1.1 dmg/s (−9%)" or "= Same dmg/s". */
  verdict: string;
  kind: DeltaKind;
  nowName: string;
  newName: string;
  rows: CompareRow[];
}

/** A gun's numbers as the table reads them: dmg/s in `who`'s hands, the rest the gun's own. */
function numbers(h: Held, who: Statted) {
  const w = statsOf(h);
  if (w.kind !== 'gun' && w.kind !== 'sidearm') throw new RangeError('gunCompare: no gun');
  return {
    power: dpsOf(h, who),
    damage: w.damage,
    pellets: w.pellets,
    rate: 1 / w.fireInterval,
    reload: w.reload,
    range: w.range,
  };
}

/** How a numeric row reads its change: after the number, going up and going down. */
interface Say {
  more: string;
  less: string;
  /** Put a + or − in front of the number. */
  signed?: boolean;
  /** A lower number is the better one (reload). */
  lowIsGood?: boolean;
}

/** A numeric row: `a` now, `b` new, the change at `dp` decimals worded by `say`. */
function numRow(
  label: string,
  [a, b]: [number, number],
  dp: number,
  show: [string, string],
  say: Say,
): CompareRow {
  const d = Number((b - a).toFixed(dp));
  const row = { label, now: show[0], next: show[1] };
  if (d === 0) return { ...row, change: 'same', tone: '' };
  const better = say.lowIsGood ? d < 0 : d > 0;
  const sign = say.signed ? (d > 0 ? '+' : MINUS) : '';
  return {
    ...row,
    change: `${sign}${Math.abs(d).toFixed(dp)}${d > 0 ? say.more : say.less}`,
    tone: better ? 'better' : 'worse',
  };
}

/** The shot's damage as it prints: pellets shown like "5.0 × 5". */
const shot = (damage: number, pellets: number): string =>
  pellets > 1 ? `${f1(damage)} × ${pellets}` : f1(damage);

/**
 * Gun `other` against the gun held: the verdict, then Now / New / Change per number (ID-108).
 * The verdict and the dmg/s row are in survivor `who`'s hands (ID-152); the rest is the gun's.
 */
export function gunCompare(held: Held, other: Held, who: Statted): GunCompare {
  const a = numbers(held, who);
  const b = numbers(other, who);
  const delta = deltaOf(held, other, who);
  const d = b.power - a.power;
  const pct = Math.round((Math.abs(d) / a.power) * 100);
  const verdict =
    delta.kind === 'same'
      ? '= Same dmg/s'
      : delta.kind === 'up'
        ? `▲ Stronger: +${f1(d)} dmg/s (+${pct}%)`
        : `▼ Weaker: ${MINUS}${f1(-d)} dmg/s (${MINUS}${pct}%)`;
  const roleA = roleOf(baseOf(held))?.role ?? '';
  const roleB = roleOf(baseOf(other))?.role ?? '';
  const affA = affixLines(held);
  const affB = affixLines(other);
  const rows: CompareRow[] = [
    numRow('dmg/s', [a.power, b.power], 1, [f1(a.power), f1(b.power)], {
      more: '',
      less: '',
      signed: true,
    }),
    // Per shot, all pellets counted in the change.
    numRow(
      'Damage',
      [a.damage * a.pellets, b.damage * b.pellets],
      1,
      [shot(a.damage, a.pellets), shot(b.damage, b.pellets)],
      { more: ' a shot', less: ' a shot', signed: true },
    ),
    numRow('Fire rate', [a.rate, b.rate], 1, [`${f1(a.rate)}/s`, `${f1(b.rate)}/s`], {
      more: '/s faster',
      less: '/s slower',
    }),
    numRow('Reload', [a.reload, b.reload], 2, [`${f2(a.reload)} s`, `${f2(b.reload)} s`], {
      more: ' s slower',
      less: ' s faster',
      lowIsGood: true,
    }),
    numRow('Range', [a.range, b.range], 0, [`${a.range} px`, `${b.range} px`], {
      more: ' px longer',
      less: ' px shorter',
    }),
    {
      label: 'Role',
      now: roleA,
      next: roleB,
      change: roleA === roleB ? 'same' : 'new role',
      tone: '',
    },
  ];
  if (affA.length > 0 || affB.length > 0) {
    rows.push({
      label: 'Affixes',
      now: affA.length > 0 ? String(affA.length) : 'none',
      next: affB.length > 0 ? String(affB.length) : 'none',
      change:
        affA.join('|') === affB.join('|')
          ? 'same'
          : affB.length > 0
            ? affB.join(', ')
            : `loses ${affA.join(', ')}`,
      tone: affB.length > affA.length ? 'better' : affB.length < affA.length ? 'worse' : '',
    });
  }
  return { verdict, kind: delta.kind, nowName: gunName(held), newName: gunName(other), rows };
}
