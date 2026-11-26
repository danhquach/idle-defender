// The Roster's gun picker, as data (ID-108): the tiles a survivor can swap to (the free
// pistol and every stash gun but the one held, strongest first by their Power with it,
// ID-152, ID-248), each with its change against the held gun, and the Now / New / Change
// comparison for one of them. Pure: no DOM, so the wording is testable.
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
import { handWorth, squadSpec, type GunWorthGame } from '../core/hordeonly.ts';
import { isGun } from '../core/loadout.ts';
import { survivorDps } from '../core/stats.ts';
import type { DefenderSpec } from '../core/horde.ts';
import { dpsCaption } from './hud.ts';
import { powerText } from './mapview.ts';
import { classLine } from './statlines.ts';

/** The gun `d` fights with: a primary that is no gun fights as the pistol (as `squadSpec`). */
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

/**
 * A gun's Power against the held gun's (ID-248): the symbol and number, and the same in words.
 * Power is what Squad Power and Best gun count (`powerOf`: paper dmg/s times the gun's factor,
 * reach and reload), so the picker never marks the gun Best gun hands out as weaker.
 */
export interface Delta {
  kind: DeltaKind;
  /** "▲ +42", "▼ 11" or "= same". */
  text: string;
  /** "42 more Power", "11 less Power" or "same Power" (screen readers). */
  words: string;
}

/** A gun's dmg/s in survivor `who`'s hands (level and profession, ID-152): what the tile shows. */
const dpsOf = (h: Held, who: DefenderSpec): number => survivorDps(who, h);

/**
 * Survivor `d`'s worth with each gun (ID-248): what the picker ranks and compares by, the one
 * `handWorth` Best gun scores with. Their Power with it; in Nightmare and Hell, for a squad
 * survivor, what it adds to the squad's Power against the next horde's traits.
 */
export type Worth = (h: Held) => number;

/** Power as it prints: whole numbers, as on the World map (`powerText`, which floors). */
const p0 = powerText;

export function deltaOf(held: Held, other: Held, worth: Worth): Delta {
  // Whole Power as printed (floored), so the change is exactly the two printed numbers' difference.
  const d = Math.floor(worth(other)) - Math.floor(worth(held));
  if (d === 0) return { kind: 'same', text: '= same', words: 'same Power' };
  return d > 0
    ? { kind: 'up', text: `▲ +${p0(d)}`, words: `${p0(d)} more Power` }
    : { kind: 'down', text: `▼ ${p0(-d)}`, words: `${p0(-d)} less Power` };
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
  /** Their Power with it (ID-248): what the tiles are sorted by. */
  power: number;
  /** "1,234": that Power as printed (whole, grouped like the World map). */
  powerText: string;
  /** "12.4": paper dmg/s in their hands. */
  dps: string;
  delta: Delta;
  /** The screen-reader name: gun, rarity, Power, dmg/s and the change. */
  label: string;
}

/**
 * The guns survivor `id` can swap to (ID-108): the free pistol and every stash gun except
 * the one held, strongest first by their Power with it (`powerOf`: their level and
 * profession, ID-152, and the gun's factor, ID-248; a stable sort: equal guns keep stash order).
 */
export function gunTiles(
  game: Pick<GameState, 'armoury'> & GunWorthGame & { reserve?: readonly RosterDefender[] },
  id: string,
): GunTile[] {
  // A bench survivor's gun can change too (ID-147), so a gun is never stuck with them.
  const d = [...game.roster, ...(game.reserve ?? [])].find((r) => r.id === id);
  if (!d) return [];
  const who = squadSpec(d);
  const worth = handWorth(game, d);
  const held = heldGunOf(d);
  const options: Held[] = [
    ...(isOwned(held) ? ['pistol' as Held] : []),
    ...game.armoury.filter((w) => isGun(w) && !(isOwned(held) && w.uid === held.uid)),
  ];
  return options
    .map((h) => ({ h, power: worth(h) }))
    .sort((a, b) => b.power - a.power)
    .map(({ h, power }) => {
      const dps = dpsOf(h, who);
      const delta = deltaOf(held, h, worth);
      const free = !isOwned(h);
      return {
        choice: isOwned(h) ? h.uid : 'pistol',
        held: h,
        type: WEAPONS[baseOf(h)].name,
        free,
        rarity: rarityOf(h),
        power,
        powerText: p0(power),
        dps: f1(dps),
        delta,
        label: `${gunName(h)}, ${RARITIES[rarityOf(h)].name} rarity, ${p0(power)} Power, ${f1(dps)} ${dpsCaption(d.name)}, ${delta.words} than ${gunName(held)}${free ? ', free' : ''}`,
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
  /** "▲ Stronger: +89 Power (+72%)", "▼ Weaker: −11 Power (−9%)" or "= Same Power" (ID-248). */
  verdict: string;
  kind: DeltaKind;
  nowName: string;
  newName: string;
  rows: CompareRow[];
}

/** A gun's numbers as the table reads them: Power and dmg/s in `who`'s hands, the rest the gun's own. */
function numbers(h: Held, who: DefenderSpec, worth: Worth) {
  const w = statsOf(h);
  if (w.kind !== 'gun' && w.kind !== 'sidearm') throw new RangeError('gunCompare: no gun');
  return {
    worth: worth(h),
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
 * The verdict, the Power row and the dmg/s row are in survivor `who`'s hands (ID-152); the
 * verdict goes by Power (ID-248), as Best gun does; the rest is the gun's.
 */
export function gunCompare(held: Held, other: Held, who: DefenderSpec, worth: Worth): GunCompare {
  const a = numbers(held, who, worth);
  const b = numbers(other, who, worth);
  const delta = deltaOf(held, other, worth);
  const d = Math.floor(b.worth) - Math.floor(a.worth);
  const pct = Math.round((Math.abs(b.worth - a.worth) / a.worth) * 100);
  const verdict =
    delta.kind === 'same'
      ? '= Same Power'
      : delta.kind === 'up'
        ? `▲ Stronger: +${p0(d)} Power (+${pct}%)`
        : `▼ Weaker: ${MINUS}${p0(-d)} Power (${MINUS}${pct}%)`;
  const roleA = roleOf(baseOf(held))?.role ?? '';
  const roleB = roleOf(baseOf(other))?.role ?? '';
  const affA = affixLines(held);
  const affB = affixLines(other);
  const rows: CompareRow[] = [
    // What Squad Power counts (ID-248): dmg/s with the gun's reach and reload weighed in.
    numRow('Power', [Math.floor(a.worth), Math.floor(b.worth)], 0, [p0(a.worth), p0(b.worth)], {
      more: '',
      less: '',
      signed: true,
    }),
    numRow('DPS', [a.power, b.power], 1, [f1(a.power), f1(b.power)], {
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
    // The class (ID-237): its name only here; the matchups are on the gun's card.
    {
      label: 'Class',
      now: classLine(held, false) ?? '',
      next: classLine(other, false) ?? '',
      change: classLine(held, false) === classLine(other, false) ? 'same' : 'new class',
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
