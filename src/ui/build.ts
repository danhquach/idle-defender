// Build mode panel between hordes: stock bar, the selected slot's menu (a turret's
// included), Repair all, the Lab, power and the bank meter, and the start defender and
// post; or, in its place, the roster, the perk loadout or the world map's panel. Every
// option is a dry run of the core action, so a refused one shows disabled with the core's
// own reason.
// Text only via textContent.
import {
  buildPost,
  buildSegment,
  buildTrap,
  buildTurret,
  freeWalkSpots,
  lineWall,
  moveTurret,
  repairAll,
  repairAllCost,
  repairCost,
  repairSegment,
  removeTrap,
  repairTrap,
  repairTurret,
  salvageTurret,
  salvageValue,
  spotField,
  spotOf,
  trapRefund,
  trapRepairCost,
  turretRepairCost,
  upgradeSegment,
  type Base,
  type BasePost,
  type Refusal,
  type Result,
  type TurretMount,
} from '../core/base.ts';
import { acceptSurvivor, repairOff, turnAway } from '../core/camp.ts';
import { postUsable } from '../core/cards.ts';
import {
  BANK_CAP,
  BATTERIES,
  BATTERY_IDS,
  BUILDING_MATERIALS,
  COLUMNS,
  GENERATOR,
  MATERIALS,
  MAX_CONDITION,
  POST_COST,
  RESEARCH,
  RESEARCH_IDS,
  SEGMENTS,
  TIER_ORDER,
  TIERS,
  TRAP_DURABILITY,
  TRAP_KINDS,
  TRAPS,
  TURRET,
  TURRET_MOUNTS,
  buildingsOf,
  isPlaza,
  LOCATIONS,
  ORDER_IDS,
  ORDERS,
  placeName,
  WALK_SPOTS,
  type Focus,
  type LocationId,
  type Order,
  type PlaceId,
  type Stock,
} from '../core/data.ts';
import { available, type GameState } from '../core/game.ts';
import { freeCar, idle, patrolDue, revealedPlaces, sendPatrol } from '../core/patrol.ts';
import { labCost, research, researched, upgradeLab, type GameResult } from '../core/research.ts';
import { layoutOf, turretState, type TurretState } from '../core/horde.ts';
import { buildGenerator, nextGasAt } from '../core/power.ts';
import {
  bankText,
  clockTime,
  defenderLabel,
  el,
  POST_NAME,
  postName,
  slotName,
  spotName,
  startLabel,
  stockText,
  survivorText,
  wholeLeft,
} from './hud.ts';
import type { SlotHit } from './projection.ts';
import { perkLines, type PerkLine } from './perks.ts';
import {
  carLabel,
  focusRows,
  locationLines,
  mapContents,
  mapRefusal,
  partyRows,
  patrolLine,
  pickedParty,
  ratedParty,
  reportLines,
  riskLines,
  tickMap,
} from './worldmap.ts';
import { rosterSection } from './roster.ts';
import { costLine, setVariant } from './kit.ts';

/** Shown when a save from before the taller field (ID-047) is loaded. */
export const FIELD_GREW =
  'The field grew: your walls now hold the middle rows. Build the new rows top and bottom.';

export function stockBarText(game: GameState): string {
  const shown = MATERIALS.filter((m) => BUILDING_MATERIALS.includes(m) || game.stock[m] > 0);
  const stock = shown.map((m) => `${m[0]!.toUpperCase()}${m.slice(1)} ${game.stock[m]}`);
  return [`Horde ${game.hordeNumber} next`, ...stock].join(' · ');
}

/** A post's slot as a stable key: building a post re-sorts `base.posts`, so ids shift. */
export const postKey = (p: BasePost): string => `${p.kind}:${p.column}:${p.row}:${spotOf(p)}`;

/** Posts a start defender may take: every post but a wall-walk over a broken segment. */
function usablePosts(base: Base): BasePost[] {
  const { layers, posts } = layoutOf(base);
  return base.posts.filter((_, i) => postUsable(layers, posts[i]!));
}

/** "Bob · injured, back at 14:05" for each defender still injured at `now`, then each out on patrol, in roster order. */
export function injuredLines(game: Pick<GameState, 'roster' | 'patrols'>, now: number): string[] {
  const injured = game.roster
    .filter((d) => !available(d, now))
    .map((d) => `${d.name} · injured, back at ${clockTime(d.injuredUntil!)}`);
  const away = game.roster.flatMap((d) => {
    const p = game.patrols.find((x) => x.members.includes(d.id));
    return p ? [`${d.name} · on patrol, back at ${clockTime(patrolDue(p))}`] : [];
  });
  return [...injured, ...away];
}

/**
 * The start defender and `game.base.posts` index for a pick kept by defender id and
 * post key. A pick that's gone, injured at `now` or no longer usable falls back to the
 * first fit defender or usable post; null when nobody is fit or no post is usable.
 */
export function pickStart(
  game: GameState,
  defenderId: string | null,
  startKey: string | null,
  now: number,
): { defenderId: string; postId: number } | null {
  const usable = usablePosts(game.base);
  const post = usable.find((p) => postKey(p) === startKey) ?? usable[0];
  const fit = game.roster.filter((d) => idle(game, d, now));
  const defender = fit.find((d) => d.id === defenderId) ?? fit[0];
  if (!post || !defender) return null;
  return { defenderId: defender.id, postId: game.base.posts.indexOf(post) };
}

/** One Lab or power line: a note, the bank meter, or an action with its cost and dry-run result. */
export type LabLine =
  | { kind: 'heading' | 'note'; text: string }
  | { kind: 'meter'; text: string; value: number; max: number }
  | { kind: 'action'; label: string; cost: Partial<Stock>; result: GameResult };

/** The Research Lab section (design §11): its level, the next level, then each node. */
export function labLines(game: GameState): LabLine[] {
  const cost = labCost(game);
  const lines: LabLine[] = [
    {
      kind: 'heading',
      text: game.lab === 0 ? 'Research Lab: not built' : `Research Lab · level ${game.lab}`,
    },
  ];
  if (cost) {
    const label = game.lab === 0 ? 'Build Research Lab' : `Upgrade Lab to level ${game.lab + 1}`;
    lines.push({ kind: 'action', label, cost, result: upgradeLab(game) });
  }
  for (const id of RESEARCH_IDS) {
    const node = RESEARCH[id];
    lines.push(
      game.research.includes(id)
        ? { kind: 'note', text: `${node.name} · researched` }
        : {
            kind: 'action',
            label: `Research ${node.name}`,
            cost: node.cost,
            result: research(game, id),
          },
    );
  }
  return lines;
}

/**
 * The power section (design §7): the generator and its state, the bank meter, then the
 * Gas and the batteries waiting in storage.
 */
export function powerLines(game: GameState): LabLine[] {
  const { power } = game;
  const next = nextGasAt(power);
  const state =
    power.generator === null
      ? 'Generator: not built'
      : next !== null
        ? `Generator · running, next Gas at ${clockTime(next)}`
        : power.gas === 0
          ? 'Generator · idle: no Gas'
          : power.bank >= BANK_CAP
            ? 'Generator · idle: the bank is full'
            : 'Generator · starting';
  const lines: LabLine[] = [
    { kind: 'heading', text: state },
    { kind: 'meter', text: bankText(power.bank), value: power.bank, max: BANK_CAP },
  ];
  if (power.generator === null) {
    lines.push({
      kind: 'action',
      label: 'Build generator',
      cost: GENERATOR.cost,
      result: buildGenerator(game),
    });
  }
  const stored = BATTERY_IDS.filter((b) => power.batteries[b] > 0).map(
    (b) => `${power.batteries[b]} ${BATTERIES[b].name}`,
  );
  lines.push({
    kind: 'note',
    text: `Gas ${power.gas} · Batteries in storage: ${stored.length > 0 ? stored.join(', ') : 'none'}`,
  });
  return lines;
}

/** A turret mount's name in menus. */
export const MOUNT_NAME: Readonly<Record<TurretMount, string>> = {
  tower: 'Tower',
  'wall-walk': 'Wall mount',
};
const mountName = (mount: TurretMount, column: number, row: number, spot: number): string =>
  `${MOUNT_NAME[mount]} · ${slotName(column, row)}` +
  (mount === 'wall-walk' ? `, ${spotName(spot)}` : '');
/** The spots a mount kind has on a slot: two on a wall, one on a tower. */
const spotsOf = (kind: TurretMount): number[] =>
  Array.from({ length: kind === 'wall-walk' ? WALK_SPOTS : 1 }, (_, spot) => spot);

/** A turret's state as the panel says it (design §7). */
export const TURRET_STATE: Readonly<Record<TurretState, string>> = {
  lit: 'powered',
  dark: 'dark: the bank is empty',
  offline: 'offline: its wall is broken',
  jammed: 'jammed',
};

/** One turret menu line: a note, or an action with its cost (or null) and dry-run result. */
export type SlotLine =
  | { kind: 'heading' | 'note'; text: string }
  | {
      kind: 'action';
      label: string;
      cost: Partial<Stock> | null;
      result: Result;
      /** Asked before the action goes ahead. */
      confirm?: string;
    };

/** The `game.base.turrets` index of the turret on this mount, or -1. */
export const turretIndex = (
  game: GameState,
  mount: TurretMount,
  column: number,
  row: number,
  spot = 0,
): number =>
  game.base.turrets.findIndex(
    (t) => t.mount === mount && t.column === column && t.row === row && spotOf(t) === spot,
  );

/** Building an Auto-turret on this mount, as a dry run. */
export function buildTurretLine(
  game: GameState,
  mount: TurretMount,
  column: number,
  row: number,
  spot = 0,
): SlotLine {
  const ok = researched(game, 'auto-turret');
  return {
    kind: 'action',
    label: `Auto-turret${mount === 'wall-walk' ? ` (wall mount, ${spotName(spot)})` : ''}`,
    cost: TURRET.cost,
    result: buildTurret(game.base, game.stock, ok, mount, column, row, spot),
  };
}

/**
 * "Line the wall" on layer `column` (design §3): one wall-walk post per free spot of
 * its standing segments, with the total cost shown first. It asks before going ahead,
 * saying how many the stock covers when it can't cover them all.
 */
export function lineWallLine(game: GameState, column: number): SlotLine {
  const free = freeWalkSpots(game.base, column).length;
  const cost = Object.fromEntries(
    Object.entries(POST_COST['wall-walk']).map(([m, n]) => [m, n * free]),
  ) as Partial<Stock>;
  const result = lineWall(game.base, game.stock, column);
  const built = result.ok ? result.base.posts.length - game.base.posts.length : 0;
  const posts = (n: number): string => `${n} wall-walk post${n === 1 ? '' : 's'}`;
  return {
    kind: 'action',
    label: free > 0 ? `Line the wall: ${posts(free)}` : 'Line the wall',
    cost: free > 0 ? cost : null,
    result,
    confirm:
      `Line layer ${column + 1} with ${posts(free)} for ${stockText(cost)}?` +
      (built < free ? ` The stock covers ${built}.` : ''),
  };
}

/** Turret `index`'s menu: where it is, its condition and state, Repair and Salvage. */
export function turretLines(game: GameState, index: number): SlotLine[] {
  const { layers, turrets } = layoutOf(game.base);
  const t = game.base.turrets[index]!;
  const state = turretState({ layers, energy: game.power.bank }, turrets[index]!);
  const value = salvageValue(t);
  return [
    { kind: 'heading', text: `Auto-turret · ${mountName(t.mount, t.column, t.row, spotOf(t))}` },
    {
      kind: 'note',
      text: `Condition ${wholeLeft(t.condition)}/${MAX_CONDITION} · ${TURRET_STATE[state]}`,
    },
    {
      kind: 'action',
      label: 'Repair turret',
      cost: turretRepairCost(t, repairOff(game.camp)),
      result: repairTurret(game.base, game.stock, index, repairOff(game.camp)),
    },
    {
      kind: 'action',
      label: `Salvage for ${stockText(value)}`,
      cost: null,
      result: salvageTurret(game.base, game.stock, index),
      confirm: `Salvage this turret for ${stockText(value)}? It is dismantled.`,
    },
  ];
}

/** A trap cell's name in menus: the outer layer's strip, by row. */
export const trapCellName = (row: number): string => `Trap strip · row ${row + 1}`;

/**
 * The trap cell `row`'s menu (design §7): an empty cell offers each basic trap as a dry
 * run; a built one shows its durability, then Repair and Remove (asks first).
 */
export function trapLines(game: GameState, row: number): SlotLine[] {
  const { base, stock } = game;
  const index = base.traps.findIndex((t) => t.row === row);
  if (index < 0) {
    return [
      { kind: 'heading', text: `${trapCellName(row)}: empty` },
      ...TRAP_KINDS.map((k): SlotLine => ({
        kind: 'action',
        label: TRAPS[k].name,
        cost: TRAPS[k].cost,
        result: buildTrap(base, stock, k, row),
      })),
    ];
  }
  const t = base.traps[index]!;
  const refund = trapRefund(t);
  return [
    { kind: 'heading', text: `${TRAPS[t.kind].name} · ${trapCellName(row)}` },
    {
      kind: 'note',
      text: `Durability ${t.durability}/${TRAP_DURABILITY}${t.durability <= 0 ? ' · broken' : ''}`,
    },
    {
      kind: 'action',
      label: 'Repair trap',
      cost: trapRepairCost(t, repairOff(game.camp)),
      result: repairTrap(base, stock, index, repairOff(game.camp)),
    },
    {
      kind: 'action',
      label: `Remove for ${stockText(refund)}`,
      cost: null,
      result: removeTrap(base, stock, index),
      confirm: `Remove this trap for ${stockText(refund)}?`,
    },
  ];
}

/** What clicking `line` gives: its result once `ask` agrees to any `confirm`, else null. */
export function lineResult(line: SlotLine, ask: (question: string) => boolean): Result | null {
  if (line.kind !== 'action' || !line.result.ok) return null;
  if (line.confirm !== undefined && !ask(line.confirm)) return null;
  return line.result;
}

/** Every free mount turret `index` may move to, in field order, each a dry run that holds. */
export function relocateTargets(
  game: GameState,
  index: number,
): { key: string; label: string; result: Extract<Result, { ok: true }> }[] {
  const targets: { key: string; label: string; result: Extract<Result, { ok: true }> }[] = [];
  COLUMNS.forEach((_, column) => {
    for (const mount of TURRET_MOUNTS) {
      for (let row = 0; row < SEGMENTS; row++) {
        for (const spot of spotsOf(mount)) {
          const result = moveTurret(game.base, game.stock, index, mount, column, row, spot);
          if (result.ok) {
            targets.push({
              key: `${mount}:${column}:${row}:${spot}`,
              label: mountName(mount, column, row, spot),
              result,
            });
          }
        }
      }
    }
  });
  return targets;
}

/** What may show in place of the build panel. */
type View = 'roster' | 'perks' | 'map';

export interface BuildPanel {
  /** Redraws the panel for `game` with `selected` open; call when either changes. */
  show(game: GameState, selected: SlotHit | null): void;
  hide(): void;
  /** The start defender and the `game.base.posts` index picked, or null if none is usable. */
  choice(game: GameState): { defenderId: string; postId: number } | null;
  /** Shows a line at the foot of the build panel (a recruit, a lost save); '' clears it. */
  notice(text: string): void;
  /** Forgets the world map picks: the camp was replaced. */
  forget(): void;
}

export function createBuildPanel(
  root: HTMLElement,
  onChange: (base: Base, stock: Stock) => void,
  onStart: (defenderId: string, postId: number) => void,
  onGame: (game: GameState) => void,
): BuildPanel {
  const bar = el('div', 'hud-bar build-bar');
  const panel = el('aside', 'build-panel');
  bar.hidden = true;
  panel.hidden = true;
  root.append(bar, panel);

  // The world map's place, buildings, loot focus, order, car and party picks, kept across redraws and visits.
  let mapLocation: PlaceId | null = null;
  let mapBuildings = new Set<LocationId>();
  let mapFocus: Focus = 'anything';
  let mapOrder: Order = 'balanced';
  let mapCar = false;
  const mapParty = new Set<string>();
  /** Picks a place: all its buildings ticked, any focus, on foot. */
  const pickPlace = (place: PlaceId | null): void => {
    mapLocation = place;
    mapBuildings = new Set(place === null ? [] : buildingsOf(place));
    mapFocus = 'anything';
    mapCar = false;
  };
  // A line at the foot of the panel: a recruit back, a lost save. Built once, so it
  // survives the redraws.
  const notice = el('p', 'build-slot-note build-notice');
  notice.setAttribute('role', 'status');
  notice.hidden = true;

  let defenderId: string | null = null;
  let startKey: string | null = null;
  // The Relocate pick, kept by target key so a redraw (a Gas burnt) doesn't reset it.
  let relocateKey: string | null = null;
  // The roster, the perk loadout or the world map shows in place of the build panel until "Back".
  let open: 'build' | View = 'build';
  let shown: { game: GameState; selected: SlotHit | null } | null = null;
  // The buttons that open each view, from the last redraw, for "Back" to focus.
  const openers: Partial<Record<View, HTMLButtonElement>> = {};
  // The map fills the screen beside the panel over a backdrop that keeps clicks off the
  // field; its patrol timers tick every second.
  const backdrop = el('div', 'worldmap-backdrop');
  const map = el('div', 'worldmap');
  backdrop.append(map);
  backdrop.hidden = true;
  root.prepend(backdrop);
  let ticker: ReturnType<typeof setInterval> | null = null;
  function stopTicker(): void {
    if (ticker !== null) clearInterval(ticker);
    ticker = null;
  }
  // Build mode reads the clock for injuries; the core only ever gets it as `now`.
  const choice = (game: GameState) => pickStart(game, defenderId, startKey, Date.now());

  /** One menu option: its label and cost, and the refusal when it isn't allowed. */
  function choiceButton(
    label: string,
    cost: Partial<Stock> | null,
    refused: Refusal | null,
    onClick: () => void,
  ): HTMLElement {
    const button = el('button', 'build-option');
    button.type = 'button';
    button.append(el('span', 'build-option-label', label));
    if (cost)
      button.append(costLine(cost, shown?.game.stock ?? null, 'build-option-cost btn-cost'));
    if (refused !== null) {
      // An unaffordable cost names its shortfall in red, so the reason is only the tooltip.
      const variant = refused.short ? 'unaffordable' : 'locked';
      setVariant(button, variant, variant === 'unaffordable' && cost ? '' : refused.reason);
      button.title = refused.reason;
    } else {
      button.addEventListener('click', onClick);
    }
    return button;
  }
  const option = (label: string, cost: Partial<Stock> | null, result: Result): HTMLElement =>
    choiceButton(label, cost, result.ok ? null : result, () => {
      if (result.ok) onChange(result.base, result.stock);
    });
  const labOption = (label: string, cost: Partial<Stock> | null, result: GameResult): HTMLElement =>
    choiceButton(label, cost, result.ok ? null : result, () => {
      if (result.ok) onGame(result.game);
    });

  /** The bank meter: a `<meter>` labelled with its text. */
  function meter(text: string, value: number, max: number): HTMLElement {
    const label = el('label', 'build-field', text);
    const bar = el('meter', 'build-meter');
    bar.min = 0;
    bar.max = max;
    bar.value = value;
    label.append(bar);
    return label;
  }

  /** A section of headings, notes, the meter and dry-run actions (the Lab, power). */
  function linesSection(className: string, lines: LabLine[]): HTMLElement {
    const section = el('section', className);
    section.append(
      ...lines.map((line) =>
        line.kind === 'action'
          ? labOption(line.label, line.cost, line.result)
          : line.kind === 'meter'
            ? meter(line.text, line.value, line.max)
            : line.kind === 'heading'
              ? el('h3', 'build-slot-title', line.text)
              : el('p', 'build-slot-note', line.text),
      ),
    );
    return section;
  }

  /** A turret menu line; an action with `confirm` asks first. */
  function slotLine(line: SlotLine): HTMLElement {
    if (line.kind !== 'action') {
      return line.kind === 'heading'
        ? el('h3', 'build-slot-title', line.text)
        : el('p', 'build-slot-note', line.text);
    }
    const { result } = line;
    return choiceButton(line.label, line.cost, result.ok ? null : result, () => {
      const done = lineResult(line, (q) => window.confirm(q));
      if (done?.ok) onChange(done.base, done.stock);
    });
  }

  /** Turret `index`'s menu, then Relocate: a list of the free mounts and a button. */
  function turretMenu(game: GameState, index: number): HTMLElement[] {
    const targets = relocateTargets(game, index);
    if (targets.length === 0) {
      return [
        ...turretLines(game, index).map(slotLine),
        el('p', 'build-slot-note', 'Relocate: no free mount'),
      ];
    }
    const to = el('select', 'build-select');
    for (const t of targets) {
      const o = el('option', '', t.label);
      o.value = t.key;
      o.selected = t.key === relocateKey;
      to.append(o);
    }
    to.addEventListener('change', () => {
      relocateKey = to.value;
    });
    const field = el('label', 'build-field', 'Relocate to');
    field.append(to);
    const move = el('button', 'build-option', 'Relocate');
    move.type = 'button';
    move.addEventListener('click', () => {
      const target = targets.find((t) => t.key === to.value);
      if (target) onChange(target.result.base, target.result.stock);
    });
    return [...turretLines(game, index).map(slotLine), field, move];
  }

  function slotMenu(game: GameState, slot: SlotHit): HTMLElement[] {
    const { base, stock, tiers } = game;
    const { column, row } = slot;
    if (slot.what === 'trap') return trapLines(game, row).map(slotLine);
    if (slot.what !== 'segment') {
      const kind = slot.what;
      const post: BasePost = { kind, column, row };
      const built = base.posts.some((p) => postKey(p) === postKey(post));
      if (built) {
        return [el('h3', 'build-slot-title', `${POST_NAME[kind]} · ${slotName(column, row)}`)];
      }
      if (kind === 'tower') {
        const turret = turretIndex(game, 'tower', column, row);
        if (turret >= 0) return turretMenu(game, turret);
      }
      return [
        el('h3', 'build-slot-title', `${slotName(column, row)}: empty`),
        option(POST_NAME[kind], POST_COST[kind], buildPost(base, stock, post)),
        ...(kind === 'tower' ? [slotLine(buildTurretLine(game, 'tower', column, row))] : []),
      ];
    }
    const seg = base.layers.find((l) => l.column === column)?.slots[row] ?? null;
    if (!seg) {
      return [
        el('h3', 'build-slot-title', `${slotName(column, row)}: empty`),
        ...TIER_ORDER.map((t) =>
          option(
            `${TIERS[t].name} wall`,
            TIERS[t].cost,
            buildSegment(base, stock, tiers, column, row, 'wall', t),
          ),
        ),
        // Patrols leave by a gate (design §10); one per layer, so a layer with one offers none.
        ...(base.layers.find((l) => l.column === column)?.slots.some((s) => s?.kind === 'gate')
          ? []
          : TIER_ORDER
        ).map((t) =>
          option(
            `${TIERS[t].name} gate`,
            TIERS[t].cost,
            buildSegment(base, stock, tiers, column, row, 'gate', t),
          ),
        ),
      ];
    }
    const next = TIER_ORDER[TIER_ORDER.indexOf(seg.tier) + 1];
    // Each wall-walk spot, top to bottom: its post, its turret's menu, or what may go there.
    const mount = spotsOf('wall-walk').flatMap((spot): HTMLElement[] => {
      const walk: BasePost = { kind: 'wall-walk', column, row, ...spotField(spot) };
      const name = `${POST_NAME['wall-walk']} (${spotName(spot)})`;
      if (base.posts.some((p) => postKey(p) === postKey(walk))) {
        return [el('p', 'build-slot-note', `Has a wall-walk post on ${spotName(spot)}`)];
      }
      const turret = turretIndex(game, 'wall-walk', column, row, spot);
      if (turret >= 0) return turretMenu(game, turret);
      return [
        option(name, POST_COST['wall-walk'], buildPost(base, stock, walk)),
        slotLine(buildTurretLine(game, 'wall-walk', column, row, spot)),
      ];
    });
    return [
      el(
        'h3',
        'build-slot-title',
        `${TIERS[seg.tier].name} ${seg.kind} · ${slotName(column, row)}`,
      ),
      el('p', 'build-slot-hp', `${Math.ceil(seg.hp)}/${seg.maxHp} HP`),
      option(
        next ? `Upgrade to ${TIERS[next].name}` : 'Upgrade',
        next ? TIERS[next].cost : null,
        upgradeSegment(base, stock, tiers, column, row),
      ),
      option(
        'Repair',
        repairCost(seg, repairOff(game.camp)),
        repairSegment(base, stock, column, row, repairOff(game.camp)),
      ),
      ...mount,
      slotLine(lineWallLine(game, column)),
    ];
  }

  function startSection(game: GameState): HTMLElement[] {
    const picked = choice(game);
    const defenders = el('select', 'build-select');
    const fit = game.roster.filter((r) => idle(game, r, Date.now()));
    for (const d of fit) {
      const o = el('option', '', defenderLabel(d));
      o.value = d.id;
      o.selected = d.id === picked?.defenderId;
      defenders.append(o);
    }
    const posts = el('select', 'build-select');
    const usable = usablePosts(game.base);
    for (const p of usable) {
      const o = el('option', '', postName(p));
      o.value = postKey(p);
      o.selected = picked !== null && game.base.posts[picked.postId] === p;
      posts.append(o);
    }
    defenders.addEventListener('change', () => {
      defenderId = defenders.value;
    });
    posts.addEventListener('change', () => {
      startKey = posts.value;
    });
    const label = (text: string, control: HTMLElement): HTMLElement => {
      const l = el('label', 'build-field', text);
      l.append(control);
      return l;
    };
    const go = el('button', 'hud-button build-start', startLabel(game.hordeNumber));
    go.type = 'button';
    go.disabled = picked === null;
    go.addEventListener('click', () => {
      const c = choice(game);
      if (c) onStart(c.defenderId, c.postId);
    });
    const injured = injuredLines(game, Date.now()).map((line) => el('p', 'build-slot-note', line));
    if (!game.roster.some((d) => idle(game, d, Date.now()))) {
      injured.unshift(el('p', 'build-slot-note', 'Nobody can defend until someone is back.'));
    }
    return [label('Start defender', defenders), label('Start post', posts), ...injured, go];
  }

  /** The build panel: the slot menu, Repair all, the start pick, Roster and Perks, the notice line. */
  function buildView(game: GameState, selected: SlotHit | null): HTMLElement[] {
    const slot = el('section', 'build-slot');
    slot.append(
      ...(selected
        ? slotMenu(game, selected)
        : [el('p', 'build-slot-note', 'Click a slot on the field to build there.')]),
    );
    const all = el('section', 'build-all');
    const off = repairOff(game.camp);
    all.append(
      option(`Repair all`, repairAllCost(game.base, off), repairAll(game.base, game.stock, off)),
    );
    const start = el('section', 'build-start-section');
    const viewButton = (label: string, view: View, refused: string | null = null): HTMLElement => {
      const button = el('button', 'build-option', label);
      button.type = 'button';
      openers[view] = button;
      if (refused !== null) {
        setVariant(button, 'locked', refused);
        return button;
      }
      button.addEventListener('click', () => {
        open = view;
        api.show(game, selected);
        panel.querySelector<HTMLButtonElement>('button')?.focus();
      });
      return button;
    };
    start.append(
      ...startSection(game),
      viewButton('Roster', 'roster'),
      viewButton('Perks', 'perks'),
      viewButton('World map', 'map', mapRefusal(game)),
    );
    return [
      el('h2', 'build-title', 'Build'),
      slot,
      all,
      linesSection('build-lab', labLines(game)),
      linesSection('build-power', powerLines(game)),
      start,
      notice,
    ];
  }

  /** "Back" from the roster, the perk loadout or the world map to the build panel. */
  function backButton(view: View): HTMLElement {
    const back = el('button', 'build-option', 'Back');
    back.type = 'button';
    back.addEventListener('click', () => {
      open = 'build';
      if (shown) api.show(shown.game, shown.selected);
      openers[view]?.focus(); // back where the player came from
    });
    return back;
  }

  /** The roster in place of the build panel: a Back button, then each defender. */
  function rosterView(game: GameState): HTMLElement[] {
    return [
      el('h2', 'build-title', 'Roster'),
      backButton('roster'),
      ...rosterSection(game, Date.now(), onGame, (q) => window.confirm(q)),
    ];
  }

  /** One perk loadout line as a page element. */
  function perkLine(line: PerkLine): HTMLElement {
    if (line.kind === 'action') return labOption(line.label, null, line.result);
    return line.kind === 'heading'
      ? el('h3', 'build-slot-title', line.text)
      : el('p', 'build-slot-note', line.text);
  }

  /** The perk loadout in place of the build panel: a Back button, the slots, then each perk. */
  function perksView(game: GameState): HTMLElement[] {
    const section = el('section', 'build-perks');
    section.append(...perkLines(game).map(perkLine));
    return [el('h2', 'build-title', 'Perks'), backButton('perks'), section];
  }

  /**
   * The world map's panel: the picked location's facts, the party picker, the risk
   * screen and Send; then the patrols out and the reports, newest first.
   */
  function mapView(game: GameState): HTMLElement[] {
    const now = Date.now();
    if (mapLocation !== null && !revealedPlaces(game).includes(mapLocation)) pickPlace(null);
    const where = el('section', 'build-slot');
    if (mapLocation === null) {
      where.append(el('p', 'build-slot-note', 'Pick a place on the map to send a patrol there.'));
    } else {
      const location = mapLocation;
      const party = pickedParty(game, mapParty, now);
      const ids = party.map((d) => d.id);
      const buildings = buildingsOf(location).filter((b) => mapBuildings.has(b));
      // The pick is kept; one the ticked buildings can't drop counts as Anything for now.
      const focusNow: Focus = focusRows(buildings).some((r) => r.id === mapFocus && r.free)
        ? mapFocus
        : 'anything';
      const redraw = (): void => api.show(game, shown?.selected ?? null);
      const picker = el('fieldset', 'worldmap-party');
      picker.append(el('legend', 'build-slot-title', 'Who goes'));
      for (const row of partyRows(game, now)) {
        const box = el('input', '');
        box.type = 'checkbox';
        box.disabled = !row.free;
        box.checked = row.free && mapParty.has(row.id);
        box.addEventListener('change', () => {
          if (box.checked) mapParty.add(row.id);
          else mapParty.delete(row.id);
          redraw();
        });
        const label = el('label', 'worldmap-member');
        label.append(box, document.createTextNode(row.label));
        picker.append(label);
      }
      // A plaza's buildings to search; a single building has nothing to tick.
      const search = el('fieldset', 'worldmap-buildings');
      if (isPlaza(location)) {
        search.append(el('legend', 'build-slot-title', 'Buildings to search'));
        for (const b of buildingsOf(location)) {
          const box = el('input', '');
          box.type = 'checkbox';
          box.checked = mapBuildings.has(b);
          box.dataset.building = b;
          box.addEventListener('change', () => {
            if (box.checked) mapBuildings.add(b);
            else mapBuildings.delete(b);
            redraw();
          });
          const label = el('label', 'worldmap-member');
          label.append(
            box,
            document.createTextNode(`${LOCATIONS[b].name} · T${LOCATIONS[b].tier}`),
          );
          search.append(label);
        }
      }
      const focus = el('select', 'worldmap-focus');
      focus.setAttribute('aria-label', 'Loot focus');
      for (const row of focusRows(buildings)) {
        const option = el('option', '', row.free ? row.label : `${row.label} (not found here)`);
        option.value = row.id;
        option.disabled = !row.free;
        option.selected = row.id === focusNow;
        focus.append(option);
      }
      focus.addEventListener('change', () => {
        mapFocus = focus.value as Focus;
        redraw();
      });
      const order = el('select', 'worldmap-order');
      order.setAttribute('aria-label', 'When things go wrong');
      for (const id of ORDER_IDS) {
        const option = el('option', '', ORDERS[id].name);
        option.value = id;
        option.selected = id === mapOrder;
        order.append(option);
      }
      order.addEventListener('change', () => {
        mapOrder = order.value as Order;
        redraw();
      });
      const orders = el('section', 'worldmap-orders');
      const labelled = (text: string, control: HTMLElement): HTMLElement => {
        const label = el('label', 'worldmap-member', `${text} `);
        label.append(control);
        return label;
      };
      orders.append(labelled('Loot focus', focus), labelled('When things go wrong', order));
      // The car (ID-030): offered while one is free; each place and each send starts on foot.
      const byCar = mapCar && freeCar(game) !== null && buildings.length > 0;
      if (game.camp.cars > 0 && buildings.length > 0) {
        if (freeCar(game) === null) {
          orders.append(el('p', 'build-slot-note', 'The car is out on patrol'));
        } else {
          const box = el('input', '');
          box.type = 'checkbox';
          box.checked = byCar;
          box.dataset.car = 'take';
          box.addEventListener('change', () => {
            mapCar = box.checked;
            redraw();
          });
          const label = el('label', 'worldmap-member');
          label.append(box, document.createTextNode(carLabel(game, location, buildings)));
          orders.append(label);
        }
      }
      const risk = el('section', 'worldmap-risk-screen');
      risk.setAttribute('aria-live', 'polite');
      risk.append(
        ...riskLines(party, location, { buildings, order: mapOrder }).map((t) =>
          el('p', 'build-slot-note', t),
        ),
      );
      const options = { buildings, focus: focusNow, order: mapOrder, car: byCar };
      const dry = sendPatrol(game, location, ids, 0, now, options);
      where.append(
        el('h3', 'build-slot-title', placeName(location)),
        ...locationLines(game, location, buildings, byCar).map((t) =>
          el('p', 'build-slot-note', t),
        ),
        ...(isPlaza(location) ? [search] : []),
        picker,
        orders,
        risk,
        choiceButton('Send patrol', null, dry.ok ? null : dry, () => {
          // The send time is the patrol's seed: the only randomness from outside the core.
          const at = Date.now();
          const sent = sendPatrol(game, location, ids, at, at, options);
          // Refused since the redraw (someone back injured): redraw to show why.
          if (!sent.ok) return redraw();
          for (const id of ids) mapParty.delete(id);
          mapCar = false;
          onGame(sent.game);
        }),
      );
    }
    const out = el('section', 'build-slot');
    out.append(el('h3', 'build-slot-title', 'Patrols out'));
    if (game.patrols.length === 0) out.append(el('p', 'build-slot-note', 'None out.'));
    for (const p of game.patrols) {
      const line = el('p', 'build-slot-note', patrolLine(game, p, now));
      line.dataset.patrol = String(p.no);
      out.append(line);
    }
    const reports = el('section', 'build-slot');
    reports.append(el('h3', 'build-slot-title', 'Patrol reports'));
    if (game.reports.length === 0)
      reports.append(el('p', 'build-slot-note', 'No patrol back yet.'));
    for (const r of [...game.reports].reverse()) {
      const { title, lines } = reportLines(r);
      const item = el('article', 'worldmap-report');
      item.append(
        el('h4', 'build-slot-title', title),
        ...lines.map((t) => el('p', 'build-slot-note', t)),
      );
      // Survivors wait here, taking no camp slot, until let in or turned away (design §10).
      for (const s of r.survivors) {
        const accepted = acceptSurvivor(game, r.no, s.id);
        item.append(
          el('p', 'build-slot-note', `Survivor wants to join: ${survivorText(s)}`),
          choiceButton(`Let ${s.name} join`, null, accepted.ok ? null : accepted, () => {
            if (accepted.ok) onGame(accepted.game);
          }),
          choiceButton(`Turn ${s.name} away`, null, null, () => {
            const away = turnAway(game, r.no, s.id);
            if (away.ok) onGame(away.game);
          }),
        );
      }
      reports.append(item);
    }
    // Picking a place redraws the map: keep keyboard focus on the same place.
    const active = document.activeElement;
    const focusedSpot =
      active instanceof HTMLElement && map.contains(active) ? active.dataset.location : undefined;
    map.replaceChildren(
      ...mapContents(game, ratedParty(game, mapParty, now), mapLocation, now, (location) => {
        pickPlace(location);
        api.show(game, shown?.selected ?? null);
      }),
    );
    if (focusedSpot !== undefined) {
      [...map.querySelectorAll<HTMLButtonElement>('button')]
        .find((b) => b.dataset.location === focusedSpot)
        ?.focus();
    }
    return [el('h2', 'build-title', 'World map'), backButton('map'), where, out, reports];
  }

  const api: BuildPanel = {
    choice,
    show(game, selected) {
      shown = { game, selected };
      // Pin the pick (or its fallback) by slot, so building a post never moves it.
      const picked = choice(game);
      if (picked) {
        defenderId = picked.defenderId;
        startKey = postKey(game.base.posts[picked.postId]!);
      }
      bar.textContent = stockBarText(game);
      // The redraw replaces every control: keep keyboard focus on the same place, or
      // the next control that can take it (the one used may now be disabled).
      type Control = HTMLButtonElement | HTMLSelectElement | HTMLInputElement;
      const controls = (): Control[] => [
        ...panel.querySelectorAll<Control>('button, select, input[type="checkbox"]'),
      ];
      const focused = controls().indexOf(document.activeElement as Control);
      panel.replaceChildren(
        ...(open === 'roster'
          ? rosterView(game)
          : open === 'perks'
            ? perksView(game)
            : open === 'map'
              ? mapView(game)
              : buildView(game, selected)),
      );
      backdrop.hidden = open !== 'map';
      if (open !== 'map') stopTicker();
      else
        ticker ??= setInterval(() => {
          if (shown) tickMap(root, shown.game, Date.now());
        }, 1000);
      if (focused >= 0) {
        const after = controls();
        const next = [...after.slice(focused), ...after.slice(0, focused)].find((c) => !c.disabled);
        next?.focus();
      }
      bar.hidden = false;
      panel.hidden = false;
    },
    hide() {
      // A horde starts from the build panel; the next visit opens on it again.
      open = 'build';
      bar.hidden = true;
      panel.hidden = true;
      backdrop.hidden = true;
      stopTicker();
    },
    notice(text) {
      notice.textContent = text;
      notice.hidden = text === '';
    },
    forget() {
      // Another camp: picks made on the world map belong to the old one.
      pickPlace(null);
      mapOrder = 'balanced';
      mapParty.clear();
    },
  };
  return api;
}
