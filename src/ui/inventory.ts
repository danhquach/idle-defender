// The Inventory (ID-079, redrawn as a grid in ID-092): a top-bar button beside the Menu
// ("Weapons") opens the camp window (ID-183, campwindow.ts) on everything the camp holds
// now. Its Weapons tab shows the squad's guns in a row (each survivor's) over the stash: one
// square slot per place up to its cap, each gun as its icon framed in its rarity's colour, strongest
// first, the empty places shown empty. Selecting a slot (click, tap, arrow keys) or
// hovering it shows its details beside the grid: name, rarity, each affix and dmg/s.
// Between hordes a stash gun's details hold its set's Combine (ID-091): three of one kind
// and rarity make one of the next rarity, after a confirm. Like the Menu, the field goes
// inert behind it and an open Inventory holds a fight. Between hordes guns move by drag
// and drop (ID-095): a stash gun onto a survivor equips it, a
// survivor's gun into the stash takes it off them, and a stash gun onto one of its set
// opens that set's Combine; a gun's details have buttons that do the same. Text reaches
// the page only through textContent.
import {
  affixCount,
  affixLines,
  baseOf,
  gunLevel,
  gunPower,
  gunStep,
  heldName,
  isOwned,
  roleOf,
  type Held,
  type OwnedWeapon,
} from '../core/armoury.ts';
import {
  COMBINE_COUNT,
  RARITIES,
  RARITY_ORDER,
  STASH_SLOT,
  WEAPONS,
  type GunBase,
  type Rarity,
  type WeaponId,
} from '../core/data.ts';
import type { GameState } from '../core/game.ts';
import {
  combineKept,
  combineSets,
  nextRarity,
  squadOf,
  squadSpec,
  stashCap,
  type CombineSet,
  type GunChoice,
  type GunMove,
} from '../core/hordeonly.ts';
import { isGun } from '../core/loadout.ts';
import { recommendedPower, squadPower } from '../core/squadpower.ts';
import { survivorDps } from '../core/stats.ts';
import {
  BAND_WORD,
  BEST_GUNS_LEAD,
  BEST_GUNS_TAIL,
  bestGunsLine,
  dpsWith,
  el,
  gunDpsText,
  levelLabel,
  powerLine,
  salvageOffer,
  slotOffer,
  upgradeOffer,
  type PowerLine,
  type SalvageOffer,
  type SlotOffer,
  type UpgradeOffer,
} from './hud.ts';
import { createCampWindow, shortLabel, type CampWindow } from './campwindow.ts';
import type { Answer } from './confirm.ts';
import { ART_URLS, GUN_ICON, type ArtId, type GunId } from './sprites.ts';

/** One weapon as the Inventory shows it. */
export interface InventoryItem {
  /** Which slot it is, kept across redraws: `stash:<uid>` or `squad:<id>`. */
  key: string;
  /** "Military Rifle"; the free pistol is "Pistol". */
  name: string;
  base: WeaponId;
  rarity: Rarity;
  /** Each affix as a line: "+7% damage"; a role affix marked "(role)" (ID-101). */
  affixes: string[];
  /** The gun's role and built-in trait (ID-101); null for a weapon that is no gun. */
  role: { role: string; trait: string } | null;
  /** "17.2 DPS", the gun's own (ID-166); null for a weapon that is no gun (an older save's blade or tool). */
  power: string | null;
  /** The slot's badge: dmg/s rounded ("17"); null for no gun. */
  badge: string | null;
  /** Gun level (ID-098); the free pistol and older saves' guns are 1. */
  level: number;
  /** The slot's level badge (ID-098): "Lv 12"; null for no gun. */
  levelBadge: string | null;
  /** The slot's upgrade badge (ID-208): "+2"; null at +0 and for no gun. */
  stepBadge: string | null;
  /** The gun's icon; null for a weapon that is no gun. */
  icon: ArtId | null;
  /** Who fights with it ("Held by Ana") or "In the stash". */
  where: string;
  /** The survivor who fights with it; null in the stash and for the free pistol. */
  holder: string | null;
  /** "26.7 DPS with Ivan": its figure in its holder's hands (ID-166); null when nobody holds it. */
  powerWith: string | null;
  /** The stash gun itself, for its set's Combine; null for a gun in hand or the pistol. */
  owned: OwnedWeapon | null;
  /** The gun's Upgrade button (ID-208); null for the free pistol, a non-gun, or with no Scrap known. */
  upgrade: UpgradeOffer | null;
  /** The gun's Salvage button (ID-207); null for a gun in hand, the free pistol, or a non-gun. */
  salvage: SalvageOffer | null;
  /** True for the free pistol, wherever it is (a survivor's hands too); absent for an owned gun. */
  free?: boolean;
}

export interface InventoryView {
  /** "Stash 12/40"; "Stash 40/40 (full)" once the next drop would throw the weakest away. */
  stashHeading: string;
  /** The button that buys more stash slots (ID-179); null once every slot is bought. */
  buy: SlotOffer | null;
  /** The stash, strongest first; anything that is no gun after the guns. Every gun, whatever the pick. */
  stash: InventoryItem[];
  /** The stash as the grid shows it (ID-192): `stash` under `pick`'s filters, in `pick`'s sort. */
  shown: InventoryItem[];
  /** The sort and filters in force (always known values). */
  pick: StashPick;
  /** The two filters' choices (ID-192): the values the stash holds, and the picked one. */
  picks: { type: PickOption[]; rarity: PickOption[] };
  /** Empty places left under the cap (0 when full, or past it from an older save). */
  free: number;
  /**
   * Each survivor in the squad and the gun they fight with, in squad order; `uid` is the
   * stash gun they hold, null on the free pistol.
   */
  squad: { id: string; name: string; gun: InventoryItem; uid: string | null }[];
  /**
   * Squad Power against the Recommended Power of the horde the next fight is (ID-098);
   * null where there is no horde to compare with.
   */
  power: PowerLine | null;
  /** The horde `power` compares with; null with no power line. */
  powerHorde: number | null;
  /** Every stash set below Relic (ID-091): ready ones first, then by base weapon and rarity. */
  combine: CombineRow[];
}

/** How the stash is sorted and filtered while the Inventory is open (ID-192). */
export interface StashPick {
  sort: SortKey;
  type: 'all' | GunType;
  rarity: 'all' | Rarity;
}
export type SortKey = 'dps' | 'rarity' | 'newest';
export type GunType = 'pistol' | 'smg' | 'rifle' | 'sniper' | 'shotgun' | 'lmg';
export type PickKind = keyof StashPick;
/** One choice of a filter, its label counting the stash guns it would show. */
export interface PickOption {
  value: string;
  label: string;
}

export const DEFAULT_PICK: Readonly<StashPick> = { sort: 'dps', type: 'all', rarity: 'all' };
export const SORT_LABELS: Record<SortKey, string> = {
  dps: 'Sort: DPS',
  rarity: 'Sort: Rarity',
  newest: 'Sort: Newest',
};
/** The gun types the filter offers, in the order it lists them, with their plural names. */
export const GUN_TYPE_NAMES: Record<GunType, string> = {
  pistol: 'Pistols',
  smg: 'SMGs',
  rifle: 'Rifles',
  sniper: 'Snipers',
  shotgun: 'Shotguns',
  lmg: 'LMGs',
};
/** Every base gun in its type; blades and tools are in none (only "All types" shows them). */
const TYPE_OF: Record<GunBase, GunType> = {
  pistol: 'pistol',
  handcannon: 'pistol',
  machinepistol: 'pistol',
  smg: 'smg',
  rifle: 'rifle',
  assault: 'rifle',
  sniper: 'sniper',
  shotgun: 'shotgun',
  cartridge: 'shotgun',
  lmg: 'lmg',
};
const typeOf = (base: string): GunType | null =>
  Object.hasOwn(TYPE_OF, base) ? TYPE_OF[base as GunBase] : null;

const SORT_KEYS = Object.keys(SORT_LABELS) as SortKey[];
const TYPE_KEYS = Object.keys(GUN_TYPE_NAMES) as GunType[];
/** Rarities from the best down, as the filter lists them. */
const RARITY_DESC = [...RARITY_ORDER].reverse();

/**
 * `raw` (a select's value: page data) as a valid choice for `kind`: an allow-list, so
 * anything else (unknown, odd case, spaces, an inherited name) is the default.
 */
export function pickValue(kind: PickKind, raw: unknown): StashPick[PickKind] {
  const known: readonly string[] =
    kind === 'sort' ? SORT_KEYS : kind === 'type' ? ['all', ...TYPE_KEYS] : ['all', ...RARITY_DESC];
  return typeof raw === 'string' && known.includes(raw)
    ? (raw as StashPick[PickKind])
    : DEFAULT_PICK[kind];
}

/** `pick` with every field checked against the allow-list. */
const cleanPick = (pick: Partial<Record<PickKind, unknown>>): StashPick => ({
  sort: pickValue('sort', pick.sort) as SortKey,
  type: pickValue('type', pick.type) as StashPick['type'],
  rarity: pickValue('rarity', pick.rarity) as StashPick['rarity'],
});

const isFiltered = (p: StashPick): boolean => p.type !== 'all' || p.rarity !== 'all';

/** One base weapon at one rarity in the stash, as the Combine shows it (ID-091). */
export interface CombineRow {
  /** "Rusty SMG". */
  name: string;
  base: WeaponId;
  rarity: Rarity;
  /** "2/3" while short; "4 in stash" once it can combine. */
  count: string;
  /** "1 more for a Common SMG"; "3 make a Common SMG". */
  note: string;
  /** The guns a combine uses up, weakest first; null while short of `COMBINE_COUNT`. */
  uses: OwnedWeapon[] | null;
}

/** What the Combine confirm shows: the guns used up and what comes out. */
export interface CombinePreview {
  used: InventoryItem[];
  makes: InventoryItem;
}

export const STASH_EMPTY = 'Empty. Every horde won drops a gun here.';
export const IN_STASH = 'In the stash.';
export const INVENTORY_NOTE =
  'Pick each survivor’s gun in the Roster, or use Best gun for everyone.';
export const COMBINE_NOTE = `${COMBINE_COUNT} stash guns of one kind and rarity make 1 of the next rarity.`;
export const COMBINE_HELD = 'Only stash guns combine: put it back in the stash first.';
/** A survivor on the free pistol (ID-212): it never goes to the stash, so it never combines. */
export const COMBINE_PISTOL = 'The free pistol doesn’t combine.';
export const COMBINE_TOP = 'Relic is the top rarity: it combines no further.';
export const COMBINE_WAIT = 'Combine between hordes, on the start or result screen.';
export const NO_AFFIXES = 'No affixes';
export const COMBINE_NOT_GUN = 'Only guns combine.';
export const DRAG_NOTE =
  'Drag a gun onto a survivor to equip it, into the stash to take it off them, or onto a gun like it to combine.';
export const DRAG_NOTE_TOUCH =
  'Tap a gun for its buttons, or hold and drag it onto a survivor to equip, into the stash to unequip, or onto a gun like it to combine.';
export const GUNS_WAIT = 'Change guns between hordes, on the start or result screen.';
export const STASH_FULL = 'Stash full';

const powerOf = (h: Held): number => (isGun(h) ? gunPower(h) : -1);

/** `h` as a slot: `key` names the slot, `where` says who has it, `holder` fights with it. */
function item(h: Held, key: string, where: string, holder: string | null = null): InventoryItem {
  const base = baseOf(h);
  const gun = isGun(h);
  const power = gun ? gunPower(h) : 0;
  return {
    key,
    name: heldName(h),
    base,
    rarity: isOwned(h) ? h.rarity : 'common',
    affixes: affixLines(h),
    role: roleOf(base),
    power: gun ? gunDpsText(power) : null,
    badge: gun ? String(Math.round(power)) : null,
    level: gunLevel(h),
    levelBadge: gun ? `Lv ${gunLevel(h)}` : null,
    stepBadge: gun && gunStep(h) > 0 ? `+${gunStep(h)}` : null,
    icon: gun ? GUN_ICON[base as GunId] : null,
    where,
    holder,
    powerWith: null,
    owned: key.startsWith('stash:') && isOwned(h) ? h : null,
    upgrade: null,
    salvage: null,
    free: !isOwned(h),
  };
}

/**
 * What the Inventory shows for `game`; with `horde` (the horde the next fight is: the one
 * picked on the start screen, or the one under way) it also shows Squad Power against that
 * horde's Recommended Power (ID-098).
 */
export function inventoryView(
  game: Pick<GameState, 'armoury' | 'roster'> & Partial<Pick<GameState, 'slots' | 'stock'>>,
  horde: number | null = null,
  canBuy = false,
  pickIn: Partial<Record<PickKind, unknown>> = DEFAULT_PICK,
): InventoryView {
  const n = game.armoury.length;
  const cap = stashCap(game);
  const pick = cleanPick(pickIn);
  const rows = game.armoury.map((h, at) => ({ h, at, power: powerOf(h), gun: isGun(h) }));
  const scrap = game.stock?.scrap;
  // Upgrade (ID-208): a gun of the stash or in hand, priced against the Scrap there is.
  const upgradable = (it: InventoryItem, h: Held): InventoryItem =>
    scrap !== undefined && isOwned(h) && isGun(h) ? { ...it, upgrade: upgradeOffer(h, scrap) } : it;
  // Salvage (ID-207): a stash gun only; one in hand must go back first.
  const salvageable = (it: InventoryItem, h: Held): InventoryItem =>
    isOwned(h) && isGun(h) ? { ...it, salvage: salvageOffer(h, scrap) } : it;
  const toItem = ({ h }: (typeof rows)[number]): InventoryItem =>
    salvageable(upgradable(item(h, `stash:${h.uid}`, IN_STASH), h), h);
  const rarityAt = (h: Held): number => (isOwned(h) ? RARITY_ORDER.indexOf(h.rarity) : -1);
  // Guns first in every sort, a blade or tool (an older save's) after them; ties keep the
  // armoury's order. The armoury itself is never reordered (view only).
  const byDps = (a: (typeof rows)[number], b: (typeof rows)[number]): number =>
    Number(b.gun) - Number(a.gun) || b.power - a.power || a.at - b.at;
  const sorts: Record<SortKey, (a: (typeof rows)[number], b: (typeof rows)[number]) => number> = {
    dps: byDps,
    rarity: (a, b) =>
      Number(b.gun) - Number(a.gun) ||
      rarityAt(b.h) - rarityAt(a.h) ||
      b.power - a.power ||
      a.at - b.at,
    // The armoury appends: the later the place, the newer the gun.
    newest: (a, b) => Number(b.gun) - Number(a.gun) || b.at - a.at,
  };
  const count = (keep: (r: (typeof rows)[number]) => boolean): number => rows.filter(keep).length;
  const option = (value: string, name: string, c: number): PickOption => ({
    value,
    label: `${name} (${c})`,
  });
  const shown = rows
    .filter(
      (r) =>
        (pick.type === 'all' || typeOf(baseOf(r.h)) === pick.type) &&
        (pick.rarity === 'all' || (isOwned(r.h) && r.h.rarity === pick.rarity)),
    )
    .sort(sorts[pick.sort])
    .map(toItem);
  return {
    // An older save's stash past the cap is kept as it is (design §6), and is full too.
    stashHeading: `Stash ${n}/${cap}${n >= cap ? ' (full)' : ''}${
      isFiltered(pick) && n > 0 ? ` · ${shown.length} shown` : ''
    }`,
    buy: game.stock ? slotOffer({ slots: game.slots, stock: game.stock }, 'stash', canBuy) : null,
    // A stable sort: equal guns keep the stash's order.
    stash: [...rows].sort(byDps).map(toItem),
    shown,
    pick,
    picks: {
      type: [
        { value: 'all', label: 'All types' },
        ...TYPE_KEYS.flatMap((t) => {
          const c = count((r) => typeOf(baseOf(r.h)) === t);
          return c > 0 || pick.type === t ? [option(t, GUN_TYPE_NAMES[t], c)] : [];
        }),
      ],
      rarity: [
        { value: 'all', label: 'All rarities' },
        ...RARITY_DESC.flatMap((r) => {
          const c = count((x) => isOwned(x.h) && x.h.rarity === r);
          return c > 0 || pick.rarity === r ? [option(r, RARITIES[r].name, c)] : [];
        }),
      ],
    },
    free: Math.max(0, cap - n),
    squad: squadOf(game).map((d) => {
      // What they fight with: a primary that is no gun fights as the pistol (as `squadSpec`).
      const held = isGun(d.loadout.primary) ? d.loadout.primary : 'pistol';
      return {
        id: d.id,
        name: d.name,
        gun: {
          ...upgradable(item(held, `squad:${d.id}`, `Held by ${d.name}.`, d.name), held),
          // Both figures side by side (ID-166): the gun's own, and in their hands.
          powerWith: dpsWith(survivorDps(squadSpec(d), held), d.name),
        },
        uid: isOwned(held) ? held.uid : null,
      };
    }),
    power: horde === null ? null : powerLine(squadPower(game), recommendedPower(horde)),
    powerHorde: horde,
    combine: combineRows(game),
  };
}

/** "Common SMG": a base weapon's name at `rarity`. */
const kindName = (set: Pick<CombineSet, 'base'>, rarity: Rarity): string =>
  `${RARITIES[rarity].name} ${WEAPONS[set.base].name}`;

function combineRows(game: Pick<GameState, 'armoury'>): CombineRow[] {
  const rows = combineSets(game).flatMap((set): CombineRow[] => {
    if (!set.next) return [];
    const n = set.guns.length;
    const makes = kindName(set, set.next);
    const ready = n >= COMBINE_COUNT;
    return [
      {
        name: kindName(set, set.rarity),
        base: set.base,
        rarity: set.rarity,
        count: ready ? `${n} in stash` : `${n}/${COMBINE_COUNT}`,
        note: ready
          ? `${COMBINE_COUNT} make a ${makes}`
          : `${COMBINE_COUNT - n} more for a ${makes}`,
        uses: ready ? set.guns.slice(0, COMBINE_COUNT) : null,
      },
    ];
  });
  // A stable sort: the ready sets first, each part in combineSets' order.
  return rows.sort((a, b) => Number(!a.uses) - Number(!b.uses));
}

/** The set `w` belongs to, or null at Relic (no set: it combines no further). */
const rowOf = (rows: readonly CombineRow[], w: OwnedWeapon): CombineRow | null =>
  rows.find((r) => r.base === w.base && r.rarity === w.rarity) ?? null;

/** What dropping one slot on another does (ID-095); `refused` says why, `none` puts it back. */
export type Drop =
  | { kind: 'equip'; defender: string; choice: GunChoice }
  | { kind: 'combine'; uses: OwnedWeapon[] }
  | { kind: 'refused'; reason: string }
  | { kind: 'none' };

/** Whether slot `key` can be picked up: a stash gun, or a survivor's stash gun. */
export function canDrag(view: InventoryView, key: string): boolean {
  if (view.squad.some((s) => s.gun.key === key && s.uid !== null)) return true;
  return view.stash.some((it) => it.key === key && it.power !== null);
}

/**
 * Dropping slot `from` on `to`: a slot's key, `stash` (the stash grid itself, an empty
 * place or its heading) or null (nothing). A stash gun on a survivor
 * equips it; a survivor's gun anywhere in the stash takes it off them; a stash gun on
 * another of its set opens that set's Combine (the weakest 3, as its button does).
 */
export function dropAction(view: InventoryView, from: string, to: string | null): Drop {
  if (to === null || to === from || !canDrag(view, from)) return { kind: 'none' };
  const onto = view.squad.find((s) => s.gun.key === to);
  const mine = view.squad.find((s) => s.gun.key === from);
  if (mine) {
    // Into the stash, onto a stash gun too: a gun in hand never combines.
    if (to !== 'stash' && !to.startsWith('stash:')) return { kind: 'none' };
    if (view.free === 0) return { kind: 'refused', reason: STASH_FULL };
    return { kind: 'equip', defender: mine.id, choice: 'pistol' };
  }
  const gun = view.stash.find((it) => it.key === from)!.owned!;
  if (onto) return { kind: 'equip', defender: onto.id, choice: gun.uid };
  const other = view.stash.find((it) => it.key === to)?.owned;
  if (!other) return { kind: 'none' };
  if (!isGun(other)) return { kind: 'refused', reason: COMBINE_NOT_GUN };
  if (other.base !== gun.base || other.rarity !== gun.rarity) {
    const name = (k: string): string => view.stash.find((it) => it.key === k)!.name;
    return {
      kind: 'refused',
      reason: `${name(from)} and ${name(to)} don't combine.`,
    };
  }
  const row = rowOf(view.combine, other);
  if (!row) return { kind: 'refused', reason: COMBINE_TOP };
  if (!row.uses) return { kind: 'refused', reason: row.note };
  return { kind: 'combine', uses: row.uses };
}

/** The line read out after equip `d` from `view` (the camp before it): "Mara now holds …". */
export function equipMessage(view: InventoryView, d: Extract<Drop, { kind: 'equip' }>): string {
  const s = view.squad.find((x) => x.id === d.defender);
  if (!s) return '';
  const back = s.uid === null ? '' : `; ${s.gun.name} is back in the stash`;
  if (d.choice === 'pistol') return `${s.name} now holds the free pistol${back}`;
  const it = view.stash.find((x) => x.owned?.uid === d.choice);
  return `${s.name} now holds ${it?.name ?? 'it'}${back}`;
}

/**
 * The confirm for combining `uses` (ID-091): the guns used up, and what comes out — its
 * rarity, how many affixes it rolls, and its dmg/s before them (the exact figure with none).
 */
export function combinePreview(uses: readonly OwnedWeapon[]): CombinePreview {
  const first = uses[0]!;
  const next = nextRarity(first.rarity)!;
  const n = affixCount(first.base, next);
  // The result takes the highest level of the guns used (ID-098) and that gun's step (ID-208).
  const { level, step } = combineKept(uses);
  const made: OwnedWeapon = {
    uid: '',
    base: first.base,
    rarity: next,
    affixes: [],
    level,
    ...(step > 0 ? { step } : {}),
  };
  const bare = gunPower(made);
  return {
    used: uses.map((w) => item(w, `stash:${w.uid}`, IN_STASH)),
    makes: {
      ...item(made, 'makes', ''),
      affixes: [
        n === 0 ? NO_AFFIXES : `${n} random ${n === 1 ? 'affix' : 'affixes'}, rolled on combine`,
      ],
      // With affixes still to roll, the figure is the gun's base, before them.
      power: `${gunDpsText(bare)}${n === 0 ? '' : ' before affixes'}`,
    },
  };
}

/** The line after a combine: "Made: Common SMG, 14.2 DPS"; with its affixes in brackets. */
export const combineResult = (w: OwnedWeapon): string =>
  `Made: ${levelLabel(w)}, ${gunDpsText(gunPower(w))}`;

/** "Lv 12 Military Rifle" (ID-098): the level in front of the name, for a gun. */
const levelled = (it: InventoryItem): string =>
  it.levelBadge ? `${it.levelBadge} ${it.name}` : it.name;

/**
 * A slot's screen-reader name: "Military Rifle, Military rarity, Marksman: +10% crit chance,
 * 17.2 DPS, 2 affixes".
 */
export function slotLabel(it: InventoryItem, ready = false): string {
  const parts = [it.name, `${RARITIES[it.rarity].name} rarity`];
  if (it.role) parts.push(`${it.role.role}: ${it.role.trait}`);
  if (it.levelBadge) parts.push(`level ${it.level}`);
  if (it.power) parts.push(it.power);
  parts.push(
    it.affixes.length === 0
      ? 'no affixes'
      : `${it.affixes.length} ${it.affixes.length === 1 ? 'affix' : 'affixes'}`,
  );
  if (it.holder !== null) parts.push(`held by ${it.holder}`);
  if (ready) parts.push('can combine');
  return parts.join(', ');
}

/** The square art of a slot: the gun's icon (or its name, for no gun) and its badge. */
export function slotFace(it: InventoryItem): HTMLElement[] {
  const face: HTMLElement[] = [];
  const url = it.icon ? ART_URLS[it.icon] : undefined;
  if (url) {
    // Decoration only: the slot's label names the gun.
    const img = el('img', 'gun-icon');
    img.alt = '';
    img.dataset.gun = it.base;
    img.src = url;
    img.draggable = false;
    face.push(img);
  } else {
    face.push(el('span', 'inv-slot-text', WEAPONS[it.base].name));
  }
  if (it.badge) {
    // A bare number on the slot: its tooltip says it is the gun's own dmg/s (ID-166).
    const badge = el('span', 'inv-slot-badge', it.badge);
    if (it.power) badge.title = it.power;
    face.push(badge);
  }
  if (it.levelBadge) face.push(el('span', 'inv-slot-level', it.levelBadge));
  if (it.stepBadge) face.push(el('span', 'inv-slot-step', it.stepBadge));
  return face;
}

/** A slot's button: its face, framed in its rarity's colour; `caption` under it (a name). */
function slot(it: InventoryItem, ready: boolean, caption?: string): HTMLElement {
  const li = el('li', 'inv-cell');
  const b = el('button', 'inv-slot');
  b.type = 'button';
  b.dataset.key = it.key;
  b.dataset.rarity = it.rarity;
  b.setAttribute('aria-label', slotLabel(it, ready));
  b.setAttribute('aria-pressed', 'false');
  b.tabIndex = -1;
  b.append(...slotFace(it));
  if (ready) b.append(el('span', 'inv-slot-ready', '▲'));
  li.append(b);
  if (caption !== undefined) {
    // A long name is cut short with an ellipsis; the whole name shows on hover.
    const who = el('span', 'inv-who', caption);
    who.title = caption;
    who.setAttribute('aria-hidden', 'true');
    li.append(who);
  }
  return li;
}

/** "Power 1,240 · rec 1,400 short", coloured by its band; the words say it too (ID-098). */
function powerNote(p: PowerLine, horde: number | null): HTMLElement {
  const line = el(
    'p',
    'menu-note inv-power-line',
    horde === null ? p.text : `${p.text} (Horde ${horde})`,
  );
  line.dataset.band = p.band;
  line.append(' ', el('span', 'inv-power-band', BAND_WORD[p.band]));
  return line;
}

function list(label: string, className: string, cells: HTMLElement[]): HTMLElement {
  const ul = el('ul', className);
  // Some screen readers drop a list's role once its bullets are styled away.
  ul.setAttribute('role', 'list');
  ul.setAttribute('aria-label', label);
  ul.append(...cells);
  return ul;
}

const section = (...children: HTMLElement[]): HTMLElement => {
  const s = el('section', 'menu-section');
  s.append(...children);
  return s;
};

const button = (text: string, onClick: () => void, extra = ''): HTMLButtonElement => {
  const b = el('button', `build-option menu-action ${extra}`.trim(), text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
};

/** The line for a filter that hides every stash gun, with the button that lifts it. */
function noMatch(): HTMLElement {
  const box = el('div', 'inv-no-match');
  box.append(
    el('p', 'menu-note', NO_MATCH),
    button('Show all', () => {}, 'inv-show-all'),
  );
  return box;
}

/** The stash heading with its buy button beside it (ID-179); the button only while slots remain. */
function stashHead(view: InventoryView): HTMLElement {
  const heading = el('h3', 'menu-heading inv-stash-heading', view.stashHeading);
  if (!view.buy) return heading;
  const row = el('div', 'inv-stash-head');
  const b = button(view.buy.text, () => {}, 'inv-buy');
  b.dataset.buy = 'stash';
  b.disabled = view.buy.disabled;
  b.title = view.buy.title;
  b.setAttribute(
    'aria-label',
    `Buy ${STASH_SLOT.add} stash slots. ${view.buy.text}${view.buy.title ? `. ${view.buy.title}` : ''}`,
  );
  row.append(heading, b);
  return row;
}

export const NO_MATCH = 'No stash guns match.';

/** The stash's sort and filter row (ID-192): three selects that each name themselves. */
function stashTools(view: InventoryView): HTMLElement {
  const row = el('div', 'inv-stash-tools');
  const make = (
    kind: PickKind,
    label: string,
    options: readonly PickOption[],
  ): HTMLSelectElement => {
    const sel = el('select', 'inv-pick');
    sel.dataset.pick = kind;
    sel.setAttribute('aria-label', label);
    for (const o of options) {
      const opt = el('option', '', o.label);
      opt.value = o.value;
      sel.append(opt);
    }
    sel.value = view.pick[kind];
    return sel;
  };
  row.append(
    make(
      'sort',
      'Sort stash',
      SORT_KEYS.map((k) => ({ value: k, label: SORT_LABELS[k] })),
    ),
    make('type', 'Show gun type', view.picks.type),
    make('rarity', 'Show rarity', view.picks.rarity),
  );
  return row;
}

/**
 * The squad row and the stash grid for `view`, under `note`; with `canCombine` (between
 * hordes) slots in a set ready to combine are marked, and with `drag` too the slots that
 * can be picked up.
 */
export function inventoryGrid(
  view: InventoryView,
  canCombine = false,
  note = INVENTORY_NOTE,
  drag = false,
): HTMLElement[] {
  const ready = (it: InventoryItem): boolean =>
    canCombine && !!it.owned && !!rowOf(view.combine, it.owned)?.uses;
  const mark = (li: HTMLElement): HTMLElement => {
    const b = li.querySelector<HTMLElement>('.inv-slot')!;
    if (drag && canCombine && canDrag(view, b.dataset.key!)) b.dataset.drag = 'true';
    return li;
  };
  const filtered = isFiltered(view.pick);
  // A filter hides the empty places: they are the end of the whole stash, not of a part.
  const empty = Array.from({ length: filtered ? 0 : view.free }, () => {
    const li = el('li', 'inv-cell');
    li.setAttribute('aria-hidden', 'true');
    li.append(el('div', 'inv-slot inv-slot-empty'));
    return li;
  });
  // The whole stash section is one drop place for a survivor's gun.
  const stash = section(
    stashHead(view),
    ...(view.stash.length > 0 ? [stashTools(view)] : [el('p', 'menu-note', STASH_EMPTY)]),
    el('p', 'menu-note inv-note', note),
    ...(view.stash.length > 0 && view.shown.length === 0
      ? [noMatch()]
      : [
          list(
            filtered ? `Stash, ${view.shown.length} of ${view.stash.length} shown` : 'Stash',
            'inv-grid inv-stash',
            [...view.shown.map((it) => mark(slot(it, ready(it)))), ...empty],
          ),
        ]),
  );
  stash.classList.add('inv-stash-zone');
  return [
    section(
      el('h3', 'menu-heading', 'Squad'),
      ...(view.power ? [powerNote(view.power, view.powerHorde)] : []),
      list('Squad', 'inv-grid inv-squad', [
        ...view.squad.map((s) => mark(slot(s.gun, false, s.name))),
      ]),
    ),
    stash,
  ];
}

/** What the Combine part of the details is doing now, and what its buttons call (ID-091). */
export interface CombineUi {
  /** Between hordes only: in a fight the set's count shows, with no button. */
  canCombine: boolean;
  /** The guns a confirm is up for, or null. */
  confirming: readonly OwnedWeapon[] | null;
  /** The line after the last combine (or why it was refused), or null. */
  result: string | null;
  /**
   * The start of `result` that shows, for a combine made ("Made: Lv 3 Prototype SMG"); the
   * rest (affixes, DPS) is read out and in its tooltip (ID-198). Null shows it whole.
   */
  made?: string | null;
  ask(uses: readonly OwnedWeapon[]): void;
  confirm(): void;
  cancel(): void;
}

/** A gun's lines in the details: rarity, its role and trait (ID-101), each affix, then dmg/s. */
function facts(it: InventoryItem): HTMLElement[] {
  const name = el('p', 'inv-name', levelled(it));
  name.dataset.rarity = it.rarity;
  const rarity = el(
    'p',
    'inv-rarity',
    `${RARITIES[it.rarity].name} rarity · ${WEAPONS[it.base].name}`,
  );
  rarity.dataset.rarity = it.rarity;
  // The gun's role and the trait every one of it has (ID-101), read as one line.
  const role = it.role ? [el('p', 'inv-role', `${it.role.role}: ${it.role.trait}`)] : [];
  const affixes =
    it.affixes.length > 0
      ? list(
          'Affixes',
          'inv-affixes',
          it.affixes.map((a) => el('li', '', a)),
        )
      : el('p', 'inv-affixes inv-affixes-none', NO_AFFIXES);
  const out = [name, rarity, ...role, affixes];
  if (it.power) {
    // Each figure stays whole, so a narrow panel breaks the line at the "·" (ID-166).
    const line = el('p', 'inv-power');
    line.append(el('span', 'inv-power-part', it.power));
    if (it.powerWith) line.append(' · ', el('span', 'inv-power-part', it.powerWith));
    out.push(line);
  }
  return out;
}

/** A gun's tile as the grid shows it, to look at only: its label and tooltip say what it is. */
function tile(it: InventoryItem): HTMLElement {
  const li = el('li', 'inv-cell');
  const face = el('div', 'inv-slot inv-slot-static');
  face.dataset.rarity = it.rarity;
  face.setAttribute('role', 'img');
  face.setAttribute('aria-label', slotLabel(it));
  face.title = [levelled(it), it.affixes.join(', ') || NO_AFFIXES, it.power ?? '']
    .filter(Boolean)
    .join('\n');
  face.append(...slotFace(it));
  li.append(face);
  return li;
}

/**
 * The Combine confirm, for the details' scrolling part (ID-198: tiles, not lines): the guns it
 * uses up as the grid's tiles, then the one it makes, its name and dmg/s beside it.
 */
function combineConfirm(uses: readonly OwnedWeapon[]): HTMLElement {
  const p = combinePreview(uses);
  const confirm = el('div', 'inv-combine-confirm');
  confirm.setAttribute('role', 'group');
  confirm.setAttribute('aria-label', `Combine into a ${p.makes.name}`);
  const makes = el('div', 'inv-combine-makes');
  const about = el('div', 'inv-combine-about');
  const name = el('p', 'inv-name', levelled(p.makes));
  name.dataset.rarity = p.makes.rarity;
  // Its affixes and DPS on one line, so a phone shows them without a scroll.
  const said = [...p.makes.affixes, ...(p.makes.power ? [p.makes.power] : [])];
  about.append(name, el('p', 'menu-note', said.join(' · ')));
  makes.append(list('Makes', 'inv-combine-list', [tile(p.makes)]), about);
  confirm.append(
    el('p', 'inv-combine-label', 'Uses up'),
    list('Uses up', 'inv-combine-list', p.used.map(tile)),
    el('p', 'inv-combine-label', 'Makes'),
    makes,
  );
  return confirm;
}

/**
 * The Combine part of a gun's details (ID-091). Since ID-198 it sits in the dock pinned to
 * the panel's foot, always the same shape: its label, a two-line status (what the last combine
 * made, then the set's count or why it can't), and one button row, so Combine and its confirm's
 * Confirm stay under the pointer through a run of combines. `confirm` is the confirm's lists,
 * for the scrolling part; `note` is the rule, said there too.
 */
function combineBlock(
  it: InventoryItem,
  rows: readonly CombineRow[],
  ui: CombineUi,
): { dock: HTMLElement; confirm: HTMLElement | null; note: string | null } {
  const dock = el('div', 'inv-combine');
  dock.append(el('h4', 'inv-combine-label', 'Combine'));
  const status = el('p', 'menu-note inv-combine-result');
  const made = ui.made && ui.result?.startsWith(ui.made) ? ui.made : null;
  if (made && ui.result) {
    // The gun's own lines above say the rest: the line shows its name, a reader hears it all.
    status.append(made, el('span', 'sr-only', ui.result.slice(made.length)));
    status.dataset.made = '';
  } else status.textContent = ui.result ?? '';
  if (ui.result) status.title = ui.result;
  status.setAttribute('role', 'status');
  status.hidden = ui.result === null;
  // Focused after a combine (not a Tab stop), so it is read out and scrolled into view.
  status.tabIndex = -1;
  const actions = el('div', 'inv-combine-actions');
  // Held in Combine's place when it can't be pressed, so the row keeps its shape; its name
  // says why.
  const off = (why: string): HTMLButtonElement => {
    const b = button(`Combine ${COMBINE_COUNT}`, () => {}, 'inv-combine-off');
    b.disabled = true;
    b.setAttribute('aria-label', `Combine ${COMBINE_COUNT}: ${why}`);
    return b;
  };
  // What the line says when no combine has just been made.
  let why: string;
  let note: string | null = null;
  let confirm: HTMLElement | null = null;
  const row = it.power !== null && it.owned ? rowOf(rows, it.owned) : undefined;
  if (it.power === null) why = COMBINE_NOT_GUN;
  else if (it.free) why = COMBINE_PISTOL;
  else if (!it.owned) why = COMBINE_HELD;
  else if (!row) why = COMBINE_TOP;
  else {
    why = `${row.name}: ${row.count} · ${row.note}`;
    note = ui.canCombine ? COMBINE_NOTE : COMBINE_WAIT;
  }
  const uses = row?.uses ?? null;
  if (row && uses && ui.confirming && ui.canCombine) {
    const makes = combinePreview(ui.confirming).makes.name;
    // Confirm takes Combine's place and most of its width: the pointer is already on it.
    const yes = button('Confirm', ui.confirm, 'inv-combine-yes');
    yes.setAttribute('aria-label', `Combine into ${makes}`);
    actions.append(yes, button('Cancel', ui.cancel, 'inv-combine-no'));
    confirm = combineConfirm(ui.confirming);
  } else if (row && uses && ui.canCombine) {
    const b = button(`Combine ${COMBINE_COUNT}`, () => ui.ask(uses), 'inv-combine-button');
    b.setAttribute('aria-label', `Combine ${COMBINE_COUNT} ${row.name}`);
    b.dataset.set = row.name;
    actions.append(b);
  } else actions.append(off(ui.canCombine || !row ? why : COMBINE_WAIT));
  // Kept under a combine's short "Made: …", so a greyed Combine has its reason in sight; a
  // refusal takes both lines instead, as it says why itself.
  const count = el('p', 'menu-note inv-combine-count', why);
  count.title = why;
  count.hidden = ui.result !== null && !made;
  const line = el('div', 'inv-combine-line');
  line.append(status, count);
  dock.append(line, actions);
  return { dock, confirm, note };
}

/** What the Equip part of the details shows, between hordes, and what its buttons call. */
export interface GearUi {
  view: InventoryView;
  /** Does what dropping slot `from` on `to` does (`dropAction`). */
  move(from: string, to: string): void;
}

/**
 * The buttons that move a gun without dragging (ID-095), in the dock (ID-198): one cell per
 * survivor, always, so each survivor's button keeps its spot whichever gun is shown. A stash
 * gun has Equip on in each cell it could go to. A survivor's stash gun keeps every cell
 * blank, so the dock keeps its height, with one Unequip laid over the grid's whole first row
 * (ID-213: a survivor's cell is too narrow for the word). A cell with nothing to do keeps
 * its place, empty.
 */
function gearBlock(it: InventoryItem, ui: GearUi): HTMLElement {
  const mine = ui.view.squad.find((s) => s.gun.key === it.key);
  const block = el('div', 'inv-gear');
  const grid = el('div', 'inv-equip');
  const blank = (): HTMLElement => el('span', 'inv-equip-blank');
  if (mine) {
    block.setAttribute('role', 'group');
    block.setAttribute('aria-label', `${it.name}, held by ${mine.name}`);
    grid.append(...ui.view.squad.map(blank));
    if (mine.uid !== null) {
      const b = button('Unequip', () => ui.move(it.key, 'stash'), 'inv-unequip');
      b.setAttribute('aria-label', `Unequip ${it.name} from ${mine.name}`);
      grid.append(b);
    }
    block.append(el('h4', 'inv-combine-label', `Held by ${mine.name}`), grid);
    return block;
  }
  const can = canDrag(ui.view, it.key);
  block.setAttribute('role', 'group');
  block.setAttribute('aria-label', `Equip ${it.name} on`);
  for (const s of ui.view.squad) {
    if (!can) {
      grid.append(blank());
      continue;
    }
    const b = button(s.name, () => ui.move(it.key, s.gun.key), 'inv-equip-on');
    b.setAttribute('aria-label', `Equip ${it.name} on ${s.name}`);
    b.dataset.defender = s.id;
    grid.append(b);
  }
  block.append(el('h4', 'inv-combine-label', 'Equip on…'), grid);
  return block;
}

/** What the Upgrade part of the details calls (ID-208). */
export interface UpgradeUi {
  /** Raises the gun `uid` one step. */
  run(uid: string): void;
}

/** After an upgrade the button ignores presses this long (ms), so a double tap buys one step. */
export const UPGRADE_LOCK_MS = 400;
export const UPGRADE_PISTOL = 'The free pistol can’t be upgraded.';
export const UPGRADE_NOT_GUN = 'Only guns can be upgraded.';
/** What the greyed button says (visible, not a tooltip) for the pistol and for a non-gun. */
export const UPGRADE_PISTOL_TEXT = 'Can’t upgrade the pistol';
export const UPGRADE_NOT_GUN_TEXT = 'Can’t upgrade: not a gun';

/**
 * The Upgrade part of a gun's details (ID-208), in the dock: its label and one button naming
 * the next step and its cost, greyed (with the Scrap short in its tooltip) when it can't be
 * pressed. Always there, so the dock keeps one shape: a gun it can't apply to has it greyed.
 */
function upgradeBlock(it: InventoryItem, ui: UpgradeUi): HTMLElement {
  const block = el('div', 'inv-upgrade');
  block.append(el('h4', 'inv-upgrade-label', 'Upgrade'));
  const offer = it.upgrade;
  const why = it.power === null ? UPGRADE_NOT_GUN : UPGRADE_PISTOL;
  // The greyed button for a gun it can't apply to says why in its text, so a touch screen
  // (no tooltips) reads it too.
  const b = button(
    offer ? offer.text : it.power === null ? UPGRADE_NOT_GUN_TEXT : UPGRADE_PISTOL_TEXT,
    () => {
      if (offer && !offer.disabled) ui.run(offer.uid);
    },
    'inv-upgrade-button',
  );
  b.disabled = !offer || offer.disabled;
  b.title = offer ? offer.title : why;
  // The full wording for a screen reader: the label is short for the dock.
  b.setAttribute(
    'aria-label',
    offer
      ? offer.title.startsWith(offer.full)
        ? offer.title
        : `${offer.full}. ${offer.title}`
      : `Upgrade: ${why}`,
  );
  block.append(b);
  return block;
}

/** What the Salvage part of the details calls (ID-207). */
export interface SalvageUi {
  /** Salvages the stash gun `uid`. */
  run(uid: string): void | Promise<void>;
}

/** After a salvage the button ignores presses this long (ms), so a double tap salvages one gun. */
export const SALVAGE_LOCK_MS = 400;
/** What the greyed button says (visible, not a tooltip) for a gun in hand, the pistol, a non-gun. */
export const SALVAGE_HELD_TEXT = 'Put it back in the stash first';
export const SALVAGE_PISTOL_TEXT = 'Can’t salvage the pistol';
export const SALVAGE_NOT_GUN_TEXT = 'Can’t salvage: not a gun';

/**
 * The Salvage part of a gun's details (ID-207), in the dock under Combine: one button naming
 * what it pays ("Salvage · +25 Scrap"). Always there, so the dock keeps one shape: for a gun in
 * hand, the pistol or a non-gun it is greyed and says why in its text (a touch screen has no
 * tooltips); a held gun's says to put it back in the stash first, as Combine does.
 */
function salvageBlock(it: InventoryItem, ui: SalvageUi): HTMLElement {
  const block = el('div', 'inv-salvage');
  const offer = it.salvage;
  const text = offer
    ? offer.text
    : it.power === null
      ? SALVAGE_NOT_GUN_TEXT
      : it.free
        ? SALVAGE_PISTOL_TEXT
        : SALVAGE_HELD_TEXT;
  const b = button(
    text,
    () => {
      if (offer) void ui.run(offer.uid);
    },
    'inv-salvage-button',
  );
  b.disabled = !offer;
  b.title = offer ? offer.full : `Salvage: ${text}`;
  b.setAttribute('aria-label', offer ? offer.full : `Salvage: ${text}`);
  block.append(b);
  return block;
}

/**
 * The details beside the grid for `it`, as two parts (ID-198): what it is, which scrolls
 * when long, and the dock pinned at the foot with its Equip on or Unequip when `gear` is
 * given (between hordes) and its Combine when `combine` is. The dock keeps one shape for
 * every gun, so no button moves between picks.
 */
export function detailsPanel(
  it: InventoryItem | null,
  combine?: { rows: readonly CombineRow[]; ui: CombineUi },
  gear?: GearUi,
  upgrade?: UpgradeUi,
  salvage?: SalvageUi,
): HTMLElement[] {
  const info = el('div', 'inv-details-info');
  if (!it) {
    info.append(el('p', 'menu-note', STASH_EMPTY));
    return [info];
  }
  const dock = el('div', 'inv-dock');
  if (gear) dock.append(gearBlock(it, gear));
  if (upgrade) dock.append(upgradeBlock(it, upgrade));
  const c = combine ? combineBlock(it, combine.rows, combine.ui) : null;
  // A confirm shows what goes and what comes in place of the gun's own lines.
  if (c?.confirm) info.append(c.confirm);
  else info.append(...facts(it), el('p', 'menu-note inv-where', it.where));
  if (c?.note) info.append(el('p', 'menu-note inv-combine-note', c.note));
  if (c) dock.append(c.dock);
  if (salvage) dock.append(salvageBlock(it, salvage));
  return dock.childElementCount > 0 ? [info, dock] : [info];
}

/** The camp as the Inventory reads it. */
type InventoryGame = Pick<GameState, 'armoury' | 'roster'> &
  Partial<Pick<GameState, 'slots' | 'stock'>>;

export interface InventoryOptions {
  /**
   * The camp now, whether a fight is on and not held by Space (for the Close label), and
   * whether guns can be combined now (between hordes).
   */
  state: () => {
    game: InventoryGame;
    resumes: boolean;
    canCombine?: boolean;
    /** Whether slots can be bought now (ID-179, between hordes); false when omitted. */
    canBuy?: boolean;
    /** The horde the next fight is, for the Squad Power line (ID-098); omitted for none. */
    horde?: number;
  };
  /**
   * Buys the next stash slots (ID-179), after the app's confirm: what to say once bought,
   * why not, or null when the player said no. Without it the button does nothing.
   */
  onBuyStash?: () => Answer | Promise<Answer>;
  /**
   * Raises the gun `uid`, held or in the stash, one upgrade step (ID-208), in a fight too: what
   * it said, or why not; without it the details have no Upgrade.
   */
  onUpgrade?: (uid: string) => { ok: true; text: string } | { ok: false; reason: string };
  /**
   * Salvages the stash gun `uid` (ID-207), after the app's confirm for a Prototype or Relic,
   * in a fight too: what it said, or why not; null when the player said no. Without it the
   * details have no Salvage.
   */
  onSalvage?: (uid: string) => Answer | Promise<Answer>;
  /** Combines the stash guns `uids` (ID-091); without it the details have no Combine. */
  onCombine?: (uids: string[]) => { ok: true; weapon: OwnedWeapon } | { ok: false; reason: string };
  /**
   * Gives survivor `defenderId` gun `choice` (ID-095, between hordes), their gun going to
   * the stash; without it guns can't be dragged and the details have no Equip.
   */
  onEquip?: (defenderId: string, choice: GunChoice) => { ok: true } | { ok: false; reason: string };
  /**
   * "Best gun for everyone" (between hordes): each survivor's new gun, or why not; without
   * it the header has no such button.
   */
  onBestGuns?: () => { ok: true; moves: GunMove[] } | { ok: false; reason: string };
}

/** A mouse press becomes a drag once it moves this far (px). */
export const DRAG_SLOP = 6;
/** A touch held this still for this long starts a drag (ms); one that moves first scrolls. */
export const LONG_PRESS = 350;
/** How far a touch may wander before its long-press is a scroll instead (px). */
export const TOUCH_SLOP = 10;
/** A touch drop in the gap between slots goes to a slot this near the gun's centre (px). */
export const GAP_SNAP = 16;
/** A drag this near the grid's top or bottom edge scrolls it (px)... */
export const EDGE = 40;
/** ...by at most this much a tick (px, about 60 ticks a second). */
export const EDGE_SPEED = 12;

export interface Inventory {
  isOpen(): boolean;
  /** Opens the Weapons tab; with `uid`, on that stash gun when it is there (ID-209). */
  open(uid?: string): void;
  /** The top-bar button that opens it. */
  readonly button: HTMLElement;
  close(): void;
  /** Re-reads the camp: call when it changes. */
  refresh(): void;
}

/**
 * The Inventory button, top-right left of the Menu, and the Weapons tab it opens in the camp
 * window `win` (ID-183; a window of its own when none is given).
 */
export function createInventory(
  root: HTMLElement,
  opts: InventoryOptions,
  win: CampWindow = createCampWindow(root),
): Inventory {
  const doc = root.ownerDocument;
  let opened = false;
  // The camp drawn last: a redraw only when it changes, so the grid keeps its scroll.
  let listed: InventoryGame | null = null;
  let listedBuy = false;
  let listedCombine = false;
  let listedHorde: number | null = null;
  let view: InventoryView | null = null;
  // The stash's sort and filters (ID-192): kept over every redraw, reset when it opens.
  let pick: StashPick = { ...DEFAULT_PICK };
  // The slot selected (its key), and the one under the pointer, whose details show first.
  let selected: string | null = null;
  let hovered: string | null = null;
  // The Combine confirm up, and the line after the last combine (ID-091).
  let confirming: readonly OwnedWeapon[] | null = null;
  let result: string | null = null;
  // The start of `result` that shows (ID-198): "Made: Lv 3 Prototype SMG".
  let made: string | null = null;

  const openButton = el('button', 'inv-button', 'Weapons');
  openButton.type = 'button';
  openButton.setAttribute('aria-haspopup', 'dialog');
  openButton.addEventListener('click', () => api.open());
  root.append(openButton);

  // The Weapons tab of the camp window (ID-183): everything here sits in `pane`.
  const pane = el('div', 'inv-dialog');
  // "Best gun for everyone" (horde-only, between hordes), in the window's header: what it
  // did, or why not, on the status line; greyed in a fight, as the Roster's.
  const best = el('button', 'hud-button inv-best');
  shortLabel(best, BEST_GUNS_LEAD, BEST_GUNS_TAIL);
  best.type = 'button';
  best.addEventListener('click', () => {
    const r = opts.onBestGuns?.();
    if (r) say(r.ok ? bestGunsLine(r.moves) : r.reason, !r.ok);
  });
  const panel = el('div', 'inv-panel');
  const body = el('div', 'menu-body inv-body');
  // What the last move did, or why it was refused (ID-095): shown, and read out.
  const status = el('p', 'menu-note inv-status');
  status.setAttribute('role', 'status');
  let sayTimer: ReturnType<typeof setTimeout> | undefined;
  /** Shows `text` in the status line; `refused` marks it as a no. */
  const say = (text: string, refused = false): void => {
    clearTimeout(sayTimer);
    if (refused) status.dataset.tone = 'refused';
    else delete status.dataset.tone;
    if (text !== '' && status.textContent === text) {
      // The same line again (a second refusal): emptied, then refilled, so it is read again.
      status.textContent = '';
      sayTimer = setTimeout(() => (status.textContent = text), 50);
      return;
    }
    status.textContent = text;
  };
  const details = el('div', 'inv-details');
  details.setAttribute('role', 'region');
  // No live region: the focused slot's label already says what it is; the Combine
  // result line is its own status.
  details.setAttribute('aria-label', 'Details');
  panel.append(body, details);
  pane.append(panel);

  const slots = (): HTMLButtonElement[] => [
    ...body.querySelectorAll<HTMLButtonElement>('.inv-slot[data-key]'),
  ];
  const slotOf = (key: string | null): HTMLButtonElement | undefined =>
    slots().find((b) => b.dataset.key === key);
  const items = (): InventoryItem[] =>
    view ? [...view.squad.map((s) => s.gun), ...view.shown] : [];

  // The grid: one Tab stop; arrows, Home and End move through every slot.
  body.addEventListener('keydown', (e) => {
    const all = slots();
    const i = all.indexOf(doc.activeElement as HTMLButtonElement);
    if (i < 0) return;
    let next: number;
    if (e.key === 'ArrowRight') next = Math.min(all.length - 1, i + 1);
    else if (e.key === 'ArrowLeft') next = Math.max(0, i - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = all.length - 1;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp')
      next = vertical(all, i, e.key === 'ArrowDown');
    else return;
    e.preventDefault();
    const to = all[next];
    if (to) select(to.dataset.key!, true);
  });

  /** The slot above or below `all[i]`: nearest across in the next row up or down. */
  function vertical(all: HTMLButtonElement[], i: number, down: boolean): number {
    const from = all[i]!.getBoundingClientRect();
    let best = i;
    let bestRow = Infinity;
    let bestX = Infinity;
    all.forEach((b, j) => {
      const r = b.getBoundingClientRect();
      const dy = down ? r.top - from.top : from.top - r.top;
      if (dy <= 1) return;
      const dx = Math.abs(r.left - from.left);
      if (dy < bestRow - 1 || (Math.abs(dy - bestRow) <= 1 && dx < bestX)) {
        best = j;
        bestRow = dy;
        bestX = dx;
      }
    });
    return best;
  }

  body.addEventListener('click', async (e) => {
    // The click a drag's release makes is no selection (a key's click has no detail).
    if (swallowClick && e.detail !== 0) {
      swallowClick = false;
      return;
    }
    const buy =
      e.target instanceof Element ? e.target.closest<HTMLElement>('.inv-buy[data-buy]') : null;
    if (buy) {
      const r = await opts.onBuyStash?.();
      if (!r) return;
      const { game, canCombine = false, horde = null, canBuy = false } = opts.state();
      draw(game, canCombine, horde, canBuy);
      say(r.ok ? r.text : r.reason, !r.ok);
      (body.querySelector<HTMLElement>('.inv-buy') ?? slotOf(selected))?.focus();
      return;
    }
    if (e.target instanceof Element && e.target.closest('.inv-show-all')) {
      pick = { ...pick, type: 'all', rarity: 'all' };
      redraw();
      body.querySelector<HTMLElement>('select[data-pick="type"]')?.focus();
      return;
    }
    const b =
      e.target instanceof Element ? e.target.closest<HTMLElement>('.inv-slot[data-key]') : null;
    if (b) select(b.dataset.key!, true);
  });
  // A sort or filter picked: only a known value counts, the select's value being page data.
  body.addEventListener('change', (e) => {
    const t = e.target;
    if (!(t instanceof Element) || !t.matches('select[data-pick]')) return;
    const kind = (t as HTMLSelectElement).dataset.pick as PickKind;
    if (kind !== 'sort' && kind !== 'type' && kind !== 'rarity') return;
    pick = { ...pick, [kind]: pickValue(kind, (t as HTMLSelectElement).value) };
    redraw();
    // The selects are redrawn with the body: focus goes to the new one.
    body.querySelector<HTMLElement>(`select[data-pick="${kind}"]`)?.focus();
  });
  /** Draws the stash again from the camp now (a new sort or filter). */
  function redraw(): void {
    const { game, canCombine = false, horde = null, canBuy = false } = opts.state();
    draw(game, canCombine, horde, canBuy);
  }
  // Hover is a mouse's only. A tap on a touch screen sends compatibility mouseover and
  // mouseleave events too; a redraw on those makes iOS Safari treat the tap as a hover and
  // drop its click (the slot is not selected, the Combine button under the finger is
  // replaced), so touch and pen pointers are ignored here.
  body.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const b =
      e.target instanceof Element ? e.target.closest<HTMLElement>('.inv-slot[data-key]') : null;
    const key = b?.dataset.key ?? null;
    // A confirm stays up while the pointer wanders over the grid; a drag keeps its gun's.
    if (key === hovered || confirming || press?.ghost) return;
    hovered = key;
    drawDetails();
  });
  body.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse' || hovered === null || press?.ghost) return;
    hovered = null;
    drawDetails();
  });

  // Drag and drop (ID-095), between hordes: a press on a slot that can be picked up
  // becomes a drag once a mouse moves DRAG_SLOP, or a touch is held LONG_PRESS still (a
  // touch that moves first scrolls the grid). `ghost` is the gun under the pointer.
  let press: {
    key: string;
    id: number;
    x: number;
    y: number;
    touch: boolean;
    timer: ReturnType<typeof setTimeout> | undefined;
    ghost: HTMLElement | null;
    scroller?: ReturnType<typeof setInterval>;
  } | null = null;
  let swallowClick = false;

  body.addEventListener('pointerdown', (e) => {
    swallowClick = false;
    // A press whose release never came (the window lost it): dropped, not a dead end. A
    // second finger or a palm (not primary) leaves a drag under way alone.
    if (e.isPrimary) stopDrag();
    if (!view || !opts.onEquip || !listedCombine) return;
    if (e.button !== 0 || !e.isPrimary) return;
    const b =
      e.target instanceof Element ? e.target.closest<HTMLElement>('.inv-slot[data-key]') : null;
    const key = b?.dataset.key;
    if (!key || !canDrag(view, key)) return;
    const touch = e.pointerType === 'touch';
    press = {
      key,
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      touch,
      timer: undefined,
      ghost: null,
    };
    if (touch) press.timer = setTimeout(() => press && lift(press.x, press.y), LONG_PRESS);
    doc.addEventListener('pointermove', onMove);
    doc.addEventListener('pointerup', onUp);
    doc.addEventListener('pointercancel', onCancel);
    doc.defaultView?.addEventListener('blur', stopDrag);
  });
  // A long-press on a phone opens no menu over a slot.
  body.addEventListener('contextmenu', (e) => {
    if (press) e.preventDefault();
  });
  // While a touch drags, the page does not scroll under it. Listened for on the grid from
  // the start, not added once a touch is down: iOS Safari decides when a touch starts
  // whether its moves can be held back, and a pan it starts anyway cancels the drag
  // (#272). A touch's moves all go to the element it started on, inside the grid.
  body.addEventListener(
    'touchmove',
    (e) => {
      if (press?.ghost && e.cancelable) e.preventDefault();
    },
    { passive: false },
  );
  // iOS can end a touch with touchcancel alone (a system gesture, an alert): the drag ends.
  body.addEventListener('touchcancel', () => {
    if (press?.touch) stopDrag();
  });

  function onMove(e: PointerEvent): void {
    if (!press || e.pointerId !== press.id) return;
    // A mouse moving with no button down: its release was lost (outside the window).
    if (!press.touch && e.buttons === 0) {
      stopDrag();
      return;
    }
    if (!press.ghost) {
      const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
      if (press.touch) {
        // Moved before the long-press: a scroll, not a drag.
        if (moved > TOUCH_SLOP) stopDrag();
        return;
      }
      if (moved < DRAG_SLOP) return;
      lift(e.clientX, e.clientY);
    }
    e.preventDefault();
    follow(e.clientX, e.clientY);
  }

  /** A cancel of the drag's own pointer ends it; another finger's does not. */
  function onCancel(e: PointerEvent): void {
    if (press && e.pointerId === press.id) stopDrag();
  }

  function onUp(e: PointerEvent): void {
    if (!press || e.pointerId !== press.id) return;
    const from = press.ghost ? press.key : null;
    // Read before the gun is put away: on touch it is the gun, not the finger, that aims.
    const to = from === null ? null : dropTarget(e.clientX, e.clientY);
    stopDrag();
    if (from === null || !view) return;
    swallowClick = true;
    act(dropAction(view, from, to), from, to);
  }

  /** The press becomes a drag: its gun follows the pointer and the drop places light up. */
  function lift(x: number, y: number): void {
    if (!press || !view) return;
    const it = items().find((i) => i.key === press!.key);
    if (!it) return;
    select(press.key, false);
    const ghost = el('div', 'inv-slot inv-ghost');
    ghost.dataset.rarity = it.rarity;
    // On touch it rides above the finger, so the finger hides neither it nor the target.
    if (press.touch) {
      ghost.dataset.touch = 'true';
      doc.defaultView?.navigator.vibrate?.(10);
    }
    ghost.setAttribute('aria-hidden', 'true');
    ghost.append(...slotFace(it));
    win.scrim.append(ghost);
    press.ghost = ghost;
    pane.classList.add('inv-dragging');
    for (const b of slots()) {
      const key = b.dataset.key!;
      if (key === press.key) b.dataset.dragFrom = 'true';
      else b.dataset.drop = droppable(dropAction(view, press.key, key)) ? 'ok' : 'no';
    }
    const zone = body.querySelector<HTMLElement>('.inv-stash-zone');
    const d = dropAction(view, press.key, 'stash');
    if (zone && d.kind !== 'none') zone.dataset.drop = droppable(d) ? 'ok' : 'no';
    // Held back only by the stash being full (a survivor's gun): said at once.
    const full = view.free === 0 && press.key.startsWith('squad:');
    say(full ? STASH_FULL : '', full);
    press.scroller = setInterval(edgeScroll, 16);
    follow(x, y);
  }

  const droppable = (d: Drop): boolean =>
    d.kind === 'equip' || (d.kind === 'combine' && !!opts.onCombine);

  /**
   * Near the grid's top or bottom edge a drag scrolls it, faster the closer it gets, so a
   * slot scrolled out of sight (on a phone, the squad row or the stash's last rows) is in
   * reach. Runs on a timer, so a pointer held still at the edge keeps scrolling.
   */
  function edgeScroll(): void {
    if (!press?.ghost) return;
    const r = body.getBoundingClientRect();
    if (r.height === 0) return;
    const into =
      press.y < r.top + EDGE ? press.y - r.top - EDGE : Math.max(0, press.y - r.bottom + EDGE);
    if (into === 0) return;
    const step = Math.sign(into) * Math.min(EDGE_SPEED, Math.max(2, Math.abs(into) / 3));
    const was = body.scrollTop;
    body.scrollTop = was + step;
    if (body.scrollTop !== was) follow(press.x, press.y);
  }

  /** Moves the gun to the pointer, and marks the place under it. */
  function follow(x: number, y: number): void {
    if (!press?.ghost) return;
    // Where the pointer is now, for the edge scroll.
    press.x = x;
    press.y = y;
    const to = dropTarget(x, y);
    for (const n of pane.querySelectorAll<HTMLElement>('[data-over]')) delete n.dataset.over;
    const over =
      to === 'stash'
        ? body.querySelector<HTMLElement>('.inv-stash-zone')
        : to === null
          ? null
          : (slotOf(to) ?? null);
    if (over) over.dataset.over = 'true';
  }

  /**
   * Puts the dragged gun at the pointer (x, y) and gives the drop place it aims at. A
   * mouse aims with the pointer; on touch the gun rides above the finger, so the place
   * under the gun's centre is the one meant, and a gun let go over the gap between
   * slots goes to the nearest slot.
   */
  function dropTarget(x: number, y: number): string | null {
    if (!press?.ghost) return null;
    press.ghost.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    if (!press.touch) return targetAt(x, y, false);
    const r = press.ghost.getBoundingClientRect();
    // No layout (a hidden page, or jsdom in the tests): the finger, as a mouse.
    if (r.height === 0) return targetAt(x, y, true);
    return targetAt(r.left + r.width / 2, r.top + r.height / 2, true);
  }

  /**
   * The drop place at (x, y): a slot's key, `stash` (the stash section) or null. With
   * `snap`, a point in the grid's gaps finds a slot within GAP_SNAP of it: in the stash
   * section only a stash slot (else the stash itself), outside it only a squad slot, and
   * never the gun being dragged.
   */
  function targetAt(x: number, y: number, snap: boolean): string | null {
    const at = doc.elementFromPoint?.(x, y);
    if (!at || !body.contains(at)) return null;
    const b = at.closest<HTMLElement>('.inv-slot[data-key]');
    if (b) return b.dataset.key!;
    const inStash = !!at.closest('.inv-stash-zone');
    if (snap) {
      let best: string | null = null;
      let bestD = GAP_SNAP;
      for (const s of slots()) {
        const key = s.dataset.key!;
        if (key === press?.key || key.startsWith('stash:') !== inStash) continue;
        const r = s.getBoundingClientRect();
        if (r.height === 0) continue;
        const d = Math.hypot(
          Math.max(r.left - x, 0, x - r.right),
          Math.max(r.top - y, 0, y - r.bottom),
        );
        if (d <= bestD) {
          best = key;
          bestD = d;
        }
      }
      if (best !== null) return best;
    }
    return inStash ? 'stash' : null;
  }

  /** Ends a press or drag with nothing moved: the gun is back where it was. */
  function stopDrag(): void {
    if (!press) return;
    clearTimeout(press.timer);
    clearInterval(press.scroller);
    press.ghost?.remove();
    press = null;
    doc.removeEventListener('pointermove', onMove);
    doc.removeEventListener('pointerup', onUp);
    doc.removeEventListener('pointercancel', onCancel);
    doc.defaultView?.removeEventListener('blur', stopDrag);
    pane.classList.remove('inv-dragging');
    for (const n of pane.querySelectorAll<HTMLElement>(
      '[data-drop], [data-drag-from], [data-over]',
    )) {
      delete n.dataset.drop;
      delete n.dataset.dragFrom;
      delete n.dataset.over;
    }
  }

  /** Does `d`, the drop of slot `from` on `to` (or its button), and says what it did. */
  function act(d: Drop, from: string, to: string | null): void {
    if (!view || d.kind === 'none') return;
    if (d.kind === 'refused') {
      say(d.reason, true);
      return;
    }
    if (d.kind === 'combine') {
      if (!opts.onCombine || to === null) return;
      say('');
      select(to, true);
      ask(d.uses);
      return;
    }
    if (!opts.onEquip) return;
    const before = view;
    const r = opts.onEquip(d.defender, d.choice);
    if (!r.ok) {
      say(r.reason, true);
      return;
    }
    // The gun is selected where it went: a survivor's back in the stash, else in their hands.
    const mine = before.squad.find((s) => s.gun.key === from);
    selected = mine?.uid ? `stash:${mine.uid}` : `squad:${d.defender}`;
    hovered = null;
    confirming = null;
    result = null;
    made = null;
    // onEquip's save has usually redrawn the grid already; drawn again for the new selection.
    const { game, canCombine = false, horde = null, canBuy = false } = opts.state();
    // A gun the filters hide stays unselected: their own slot is where it came from.
    if (
      selected.startsWith('stash:') &&
      !inventoryView(game, horde, canBuy, pick).shown.some((it) => it.key === selected)
    ) {
      selected = `squad:${d.defender}`;
    }
    draw(game, canCombine, horde, canBuy);
    say(equipMessage(before, d));
    const b = slotOf(selected);
    b?.focus();
    b?.scrollIntoView?.({ block: 'nearest' });
  }

  /** Selects the slot `key`; `focus` moves the keyboard there too. */
  function select(key: string, focus: boolean): void {
    if (key !== selected) {
      confirming = null;
      result = null;
      made = null;
      // The last move's line is about another gun now.
      say('');
    }
    selected = key;
    hovered = null;
    markSelected();
    drawDetails();
    if (focus) {
      const b = slotOf(key);
      b?.focus();
      b?.scrollIntoView?.({ block: 'nearest' });
    }
  }

  function markSelected(): void {
    for (const b of slots()) {
      const on = b.dataset.key === selected;
      b.setAttribute('aria-pressed', String(on));
      b.tabIndex = on ? 0 : -1;
    }
  }

  function drawDetails(): void {
    const all = items();
    const it = all.find((x) => x.key === (hovered ?? selected)) ?? null;
    const combine =
      opts.onCombine && view
        ? {
            rows: view.combine,
            ui: {
              canCombine: listedCombine,
              confirming: hovered ? null : confirming,
              result: hovered ? null : result,
              made: hovered ? null : made,
              ask,
              confirm,
              cancel,
            },
          }
        : undefined;
    const gear =
      opts.onEquip && view && listedCombine
        ? { view, move: (from: string, to: string) => act(dropAction(view!, from, to), from, to) }
        : undefined;
    const upgrade = opts.onUpgrade ? { run: upgradeGunNow } : undefined;
    const salvage = opts.onSalvage ? { run: salvageGunNow } : undefined;
    details.replaceChildren(...detailsPanel(it, combine, gear, upgrade, salvage));
    // A short window scrolls the details as one box: another gun's start at the top, while the
    // same gun redrawn (an upgrade) keeps its place.
    if (it?.key !== detailKey) details.scrollTop = 0;
    detailKey = it?.key ?? null;
  }

  let detailKey: string | null = null;

  let salvageLockUntil = 0;

  /**
   * Salvages stash gun `uid`: asks first when the app does, says what it did or why not, and
   * keeps focus on the grid. The gun leaves, so the next gun's Salvage lands under the same
   * pointer: a press locks the button for `SALVAGE_LOCK_MS` (again once answered), so a double
   * tap salvages one gun.
   */
  async function salvageGunNow(uid: string): Promise<void> {
    if (Date.now() < salvageLockUntil) return;
    salvageLockUntil = Number.POSITIVE_INFINITY;
    let r: Answer;
    try {
      r = (await opts.onSalvage?.(uid)) ?? null;
    } finally {
      salvageLockUntil = Date.now() + SALVAGE_LOCK_MS;
    }
    if (!r) return;
    const { game, canCombine = false, horde = null, canBuy = false } = opts.state();
    draw(game, canCombine, horde, canBuy);
    say(r.ok ? r.text : r.reason, !r.ok);
    slotOf(selected)?.focus();
  }

  let upgradeLockUntil = 0;
  // The stash gun the next show selects (ID-209): set by `open(uid)`.
  let wanted: string | null = null;

  /** Raises gun `uid` one step; says what it did, or why not, and keeps focus on the button. */
  function upgradeGunNow(uid: string): void {
    // One step a press: a double tap (or a fast second click) lands on the next step's button.
    const at = Date.now();
    if (at < upgradeLockUntil) return;
    upgradeLockUntil = at + UPGRADE_LOCK_MS;
    const r = opts.onUpgrade?.(uid);
    if (!r) return;
    // A confirm over a gun that was just replaced is stale: drawing drops it.
    const { game, canCombine = false, horde = null, canBuy = false } = opts.state();
    draw(game, canCombine, horde, canBuy);
    say(r.ok ? r.text : r.reason, !r.ok);
    (
      details.querySelector<HTMLButtonElement>('.inv-upgrade-button:not(:disabled)') ??
      slotOf(selected)
    )?.focus();
  }

  /** Puts up the Combine confirm for `uses`. */
  function ask(uses: readonly OwnedWeapon[]): void {
    // Asked from a hovered gun's details: that gun becomes the selected one, so the
    // confirm stays up for it when the pointer moves on.
    if (hovered !== null) selected = hovered;
    hovered = null;
    markSelected();
    confirming = uses;
    result = null;
    made = null;
    drawDetails();
    details.querySelector<HTMLElement>('.inv-combine-no')?.focus();
  }

  /** Draws the grid for `game`; a confirm whose guns have left the stash is dropped. */
  function draw(
    game: InventoryGame,
    canCombine: boolean,
    horde: number | null,
    canBuy = false,
  ): void {
    // The slots are redrawn: a drag under way goes back.
    stopDrag();
    listed = game;
    listedCombine = canCombine;
    listedHorde = horde;
    listedBuy = canBuy;
    if (confirming && !(canCombine && confirming.every((w) => game.armoury.includes(w)))) {
      confirming = null;
    }
    // Focus in the grid or the details: both are redrawn, so it comes back to the slot.
    const hadFocus = body.contains(doc.activeElement) || details.contains(doc.activeElement);
    // A focused sort or filter select is redrawn too: focus returns to its twin.
    const pickFocus = (doc.activeElement as HTMLElement | null)?.closest?.('select[data-pick]');
    const focusedPick = body.contains(pickFocus ?? null)
      ? (pickFocus as HTMLElement).dataset.pick
      : undefined;
    view = inventoryView(game, horde, canBuy, pick);
    // On a touch screen a plain drag scrolls: the note says to hold first.
    const touch = !!doc.defaultView?.matchMedia?.('(pointer: coarse)').matches;
    const note = opts.onEquip
      ? canCombine
        ? touch
          ? DRAG_NOTE_TOUCH
          : DRAG_NOTE
        : GUNS_WAIT
      : INVENTORY_NOTE;
    body.replaceChildren(...inventoryGrid(view, canCombine, note, !!opts.onEquip));
    const keys = items().map((x) => x.key);
    if (selected === null || !keys.includes(selected)) {
      // The selected gun is gone (filtered out or left): its confirm and lines go with it.
      if (selected !== null) {
        confirming = null;
        result = null;
        made = null;
        say('');
      }
      // The strongest stash gun first; with an empty stash, the first survivor's gun.
      selected = view.shown[0]?.key ?? keys[0] ?? null;
    }
    if (hovered !== null && !keys.includes(hovered)) hovered = null;
    markSelected();
    drawDetails();
    if (focusedPick) {
      body.querySelector<HTMLElement>(`select[data-pick="${focusedPick}"]`)?.focus();
    } else if (hadFocus && !pane.contains(doc.activeElement)) slotOf(selected)?.focus();
  }

  function confirm(): void {
    const uses = confirming;
    if (!uses || !opts.onCombine) return;
    confirming = null;
    say('');
    const r = opts.onCombine(uses.map((w) => w.uid));
    result = r.ok ? combineResult(r.weapon) : r.reason;
    made = r.ok ? `Made: ${levelled(item(r.weapon, '', ''))}` : null;
    // The new gun takes a used gun's place: select it, so its details say what was made.
    if (r.ok) {
      selected = `stash:${r.weapon.uid}`;
      // A rarity filter that hides what was made is lifted, so its details say what it is.
      if (pick.rarity !== 'all' && pick.rarity !== r.weapon.rarity)
        pick = { ...pick, rarity: 'all' };
    }
    const { game, canCombine = false, horde = null, canBuy = false } = opts.state();
    draw(game, canCombine, horde, canBuy);
    // Focus on the line saying what it made: a screen reader reads it.
    (details.querySelector<HTMLElement>('.inv-combine-result') ?? slotOf(selected))?.focus();
  }

  function cancel(): void {
    if (!confirming) return;
    confirming = null;
    drawDetails();
    // Back to the set's own Combine button.
    (details.querySelector<HTMLElement>('.inv-combine-button') ?? slotOf(selected))?.focus();
  }

  win.add({
    id: 'weapons',
    label: 'Weapons',
    panel: pane,
    tools: opts.onBestGuns ? [best] : [],
    status,
    button: openButton,
    show() {
      opened = true;
      confirming = null;
      result = null;
      made = null;
      hovered = null;
      pick = { ...DEFAULT_PICK };
      say('');
      // On the gun asked for (ID-209) when it is in the stash, else the strongest.
      const want =
        wanted && opts.state().game.armoury.some((w) => w.uid === wanted) ? wanted : null;
      selected = want === null ? null : `stash:${want}`;
      wanted = null;
      // Drawn afresh: the details start on the strongest gun, with no confirm or result.
      listed = null;
      api.refresh();
      // It opens at the top, on the squad's row: the keyboard goes to the selected gun
      // without scrolling to it, unless that leaves it out of sight or cut off below; then
      // its section's heading goes to the top, never a slot cut in half.
      body.scrollTop = 0;
      const slot = slotOf(selected);
      slot?.focus({ preventScroll: true });
      const head = slot?.closest('section')?.firstElementChild;
      if (
        slot &&
        head &&
        slot.getBoundingClientRect().bottom > body.getBoundingClientRect().bottom
      ) {
        body.scrollTop = head.getBoundingClientRect().top - body.getBoundingClientRect().top;
      }
    },
    hide() {
      opened = false;
      stopDrag();
    },
    // Esc steps back first: a drag goes back where it was (and its release is no click),
    // then an open Combine confirm.
    escape() {
      if (press) {
        if (press.ghost) swallowClick = true;
        stopDrag();
        return true;
      }
      if (!confirming) return false;
      cancel();
      return true;
    },
  });

  const api: Inventory = {
    isOpen: () => opened,
    button: openButton,
    open(uid) {
      wanted = uid ?? null;
      win.open('weapons');
      wanted = null;
    },
    close() {
      if (opened) win.close();
    },
    refresh() {
      if (!opened) return;
      const { game, resumes, canCombine = false, horde = null, canBuy = false } = opts.state();
      win.setResumes(resumes);
      best.disabled = !canCombine;
      best.title = canCombine ? '' : GUNS_WAIT;
      if (
        game === listed &&
        canCombine === listedCombine &&
        horde === listedHorde &&
        canBuy === listedBuy
      ) {
        return;
      }
      draw(game, canCombine, horde, canBuy);
    },
  };
  return api;
}
