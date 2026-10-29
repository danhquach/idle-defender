// Build mode panel between hordes: stock bar, the selected slot's menu (a turret's
// included), Repair all, the Lab, power and the bank meter, and the start defender and
// post; or, in its place, the roster. Every option is a dry run of the core action, so
// a refused one shows disabled with the core's own reason.
// Text only via textContent.
import {
  buildPost,
  buildSegment,
  buildTurret,
  moveTurret,
  repairAll,
  repairAllCost,
  repairCost,
  repairSegment,
  repairTurret,
  salvageTurret,
  salvageValue,
  turretRepairCost,
  upgradeSegment,
  type Base,
  type BasePost,
  type Result,
  type TurretMount,
} from '../core/base.ts';
import { postUsable } from '../core/cards.ts';
import {
  BANK_CAP,
  BATTERIES,
  BATTERY_IDS,
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
  TURRET,
  TURRET_MOUNTS,
  type Stock,
} from '../core/data.ts';
import { available, type GameState, type RosterDefender } from '../core/game.ts';
import { labCost, research, researched, upgradeLab, type GameResult } from '../core/research.ts';
import { layoutOf, turretState, type TurretState } from '../core/horde.ts';
import { buildGenerator, nextGasAt } from '../core/power.ts';
import { exportCode, importCode, type ImportResult } from '../storage/code.ts';
import { encodeSave } from '../storage/save.ts';
import {
  bankText,
  clockTime,
  defenderLabel,
  el,
  POST_NAME,
  postName,
  slotName,
  stockText,
  wholeLeft,
} from './hud.ts';
import type { SlotHit } from './projection.ts';
import { rosterSection } from './roster.ts';

/** What the backup section says about a refused code. */
export const IMPORT_REFUSAL: Readonly<Record<Extract<ImportResult, { ok: false }>['why'], string>> =
  {
    empty: 'Paste a backup code first.',
    tooBig: 'That is too long to be a backup code.',
    bad: "That code can't be read.",
  };
export const IMPORT_CONFIRM = 'Replace this camp with the one in the code? This camp is lost.';
export const IMPORT_DONE = 'Backup code loaded.';

/**
 * What "Load code" does with `pasted`: the camp to load (null for none), the line to
 * show, and whether to clear the paste box. `confirm` asks the player, only for a
 * readable code.
 */
export function loadCode(
  pasted: string,
  confirm: (question: string) => boolean,
): { game: GameState | null; message: string; clearPaste: boolean } {
  const result = importCode(pasted);
  if (!result.ok) return { game: null, message: IMPORT_REFUSAL[result.why], clearPaste: false };
  if (!confirm(IMPORT_CONFIRM)) return { game: null, message: '', clearPaste: false };
  return { game: result.save.game, message: IMPORT_DONE, clearPaste: true };
}

export function stockBarText(game: GameState): string {
  const stock = MATERIALS.map((m) => `${m[0]!.toUpperCase()}${m.slice(1)} ${game.stock[m]}`);
  return [`Horde ${game.hordeNumber} next`, ...stock].join(' · ');
}

/** A post's slot as a stable key: building a post re-sorts `base.posts`, so ids shift. */
export const postKey = (p: BasePost): string => `${p.kind}:${p.column}:${p.row}`;

/** Posts a start defender may take: every post but a wall-walk over a broken segment. */
function usablePosts(base: Base): BasePost[] {
  const { layers, posts } = layoutOf(base);
  return base.posts.filter((_, i) => postUsable(layers, posts[i]!));
}

/** "Bob · back at 14:05" for each defender still injured at `now`, in roster order. */
export function injuredLines(roster: readonly RosterDefender[], now: number): string[] {
  return roster
    .filter((d) => !available(d, now))
    .map((d) => `${d.name} · injured, back at ${clockTime(d.injuredUntil!)}`);
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
  const fit = game.roster.filter((d) => available(d, now));
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
const mountName = (mount: TurretMount, column: number, row: number): string =>
  `${MOUNT_NAME[mount]} · ${slotName(column, row)}`;

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
): number =>
  game.base.turrets.findIndex((t) => t.mount === mount && t.column === column && t.row === row);

/** Building an Auto-turret on this mount, as a dry run. */
export function buildTurretLine(
  game: GameState,
  mount: TurretMount,
  column: number,
  row: number,
): SlotLine {
  return {
    kind: 'action',
    label: `Auto-turret${mount === 'wall-walk' ? ' (wall mount)' : ''}`,
    cost: TURRET.cost,
    result: buildTurret(game.base, game.stock, researched(game, 'auto-turret'), mount, column, row),
  };
}

/** Turret `index`'s menu: where it is, its condition and state, Repair and Salvage. */
export function turretLines(game: GameState, index: number): SlotLine[] {
  const { layers, turrets } = layoutOf(game.base);
  const t = game.base.turrets[index]!;
  const state = turretState({ layers, energy: game.power.bank }, turrets[index]!);
  const value = salvageValue(t);
  return [
    { kind: 'heading', text: `Auto-turret · ${mountName(t.mount, t.column, t.row)}` },
    {
      kind: 'note',
      text: `Condition ${wholeLeft(t.condition)}/${MAX_CONDITION} · ${TURRET_STATE[state]}`,
    },
    {
      kind: 'action',
      label: 'Repair turret',
      cost: turretRepairCost(t),
      result: repairTurret(game.base, game.stock, index),
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
        const result = moveTurret(game.base, game.stock, index, mount, column, row);
        if (result.ok) {
          targets.push({
            key: `${mount}:${column}:${row}`,
            label: mountName(mount, column, row),
            result,
          });
        }
      }
    }
  });
  return targets;
}

export interface BuildPanel {
  /** Redraws the panel for `game` with `selected` open; call when either changes. */
  show(game: GameState, selected: SlotHit | null): void;
  hide(): void;
  /** The start defender and the `game.base.posts` index picked, or null if none is usable. */
  choice(game: GameState): { defenderId: string; postId: number } | null;
  /** Shows a line about saving in the backup section (a refused write, a lost save). */
  notice(text: string): void;
}

export function createBuildPanel(
  root: HTMLElement,
  onChange: (base: Base, stock: Stock) => void,
  onStart: (defenderId: string, postId: number) => void,
  onLoad: (game: GameState) => void,
  onGame: (game: GameState) => void,
): BuildPanel {
  const bar = el('div', 'hud-bar build-bar');
  const panel = el('aside', 'build-panel');
  bar.hidden = true;
  panel.hidden = true;
  root.append(bar, panel);

  // Built once, so a pasted code survives the redraws.
  const backup = el('section', 'build-backup');
  const code = el('textarea', 'build-code');
  code.readOnly = true;
  code.rows = 2;
  code.setAttribute('aria-label', 'Backup code for this camp');
  code.addEventListener('focus', () => code.select());
  const paste = el('textarea', 'build-code');
  paste.rows = 2;
  paste.placeholder = 'Paste a backup code';
  paste.setAttribute('aria-label', 'Backup code to load');
  const load = el('button', 'build-option', 'Load code');
  load.type = 'button';
  const status = el('p', 'build-slot-note');
  status.setAttribute('role', 'status');
  load.addEventListener('click', () => {
    const { game, message, clearPaste } = loadCode(paste.value, (q) => window.confirm(q));
    status.textContent = message;
    if (clearPaste) paste.value = '';
    if (game) onLoad(game);
  });
  backup.append(
    el('h3', 'build-slot-title', 'Backup code'),
    el('p', 'build-slot-note', 'Keep it somewhere safe; paste it back to restore this camp.'),
    code,
    paste,
    load,
    status,
  );

  let defenderId: string | null = null;
  let startKey: string | null = null;
  // The Relocate pick, kept by target key so a redraw (a Gas burnt) doesn't reset it.
  let relocateKey: string | null = null;
  // The roster shows in place of the build panel until "Back".
  let rosterOpen = false;
  let shown: { game: GameState; selected: SlotHit | null } | null = null;
  let rosterButton: HTMLButtonElement | null = null;
  // Build mode reads the clock for injuries; the core only ever gets it as `now`.
  const choice = (game: GameState) => pickStart(game, defenderId, startKey, Date.now());

  /** One menu option: its label and cost, and the refusal reason when it isn't allowed. */
  function choiceButton(
    label: string,
    cost: Partial<Stock> | null,
    refused: string | null,
    onClick: () => void,
  ): HTMLElement {
    const button = el('button', 'build-option');
    button.type = 'button';
    button.append(el('span', 'build-option-label', label));
    if (cost) button.append(el('span', 'build-option-cost', `(${stockText(cost)})`));
    if (refused !== null) {
      button.disabled = true;
      button.append(el('span', 'build-option-reason', refused));
    } else {
      button.addEventListener('click', onClick);
    }
    return button;
  }
  const option = (label: string, cost: Partial<Stock> | null, result: Result): HTMLElement =>
    choiceButton(label, cost, result.ok ? null : result.reason, () => {
      if (result.ok) onChange(result.base, result.stock);
    });
  const labOption = (label: string, cost: Partial<Stock>, result: GameResult): HTMLElement =>
    choiceButton(label, cost, result.ok ? null : result.reason, () => {
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
    return choiceButton(line.label, line.cost, result.ok ? null : result.reason, () => {
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
      ];
    }
    const next = TIER_ORDER[TIER_ORDER.indexOf(seg.tier) + 1];
    const walk: BasePost = { kind: 'wall-walk', column, row };
    const hasWalk = base.posts.some((p) => postKey(p) === postKey(walk));
    const turret = turretIndex(game, 'wall-walk', column, row);
    const mount = hasWalk
      ? [el('p', 'build-slot-note', 'Has a wall-walk post')]
      : turret >= 0
        ? turretMenu(game, turret)
        : [
            option(POST_NAME['wall-walk'], POST_COST['wall-walk'], buildPost(base, stock, walk)),
            slotLine(buildTurretLine(game, 'wall-walk', column, row)),
          ];
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
      option('Repair', repairCost(seg), repairSegment(base, stock, column, row)),
      ...mount,
    ];
  }

  function startSection(game: GameState): HTMLElement[] {
    const picked = choice(game);
    const defenders = el('select', 'build-select');
    const fit = game.roster.filter((r) => available(r, Date.now()));
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
    const go = el('button', 'hud-button build-start', `Start Horde ${game.hordeNumber}`);
    go.type = 'button';
    go.disabled = picked === null;
    go.addEventListener('click', () => {
      const c = choice(game);
      if (c) onStart(c.defenderId, c.postId);
    });
    const injured = injuredLines(game.roster, Date.now()).map((line) =>
      el('p', 'build-slot-note', line),
    );
    if (!game.roster.some((d) => available(d, Date.now()))) {
      injured.unshift(el('p', 'build-slot-note', 'Nobody can defend until someone recovers.'));
    }
    return [label('Start defender', defenders), label('Start post', posts), ...injured, go];
  }

  /** The build panel: the slot menu, Repair all, the start pick and Roster, the backup code. */
  function buildView(game: GameState, selected: SlotHit | null): HTMLElement[] {
    const slot = el('section', 'build-slot');
    slot.append(
      ...(selected
        ? slotMenu(game, selected)
        : [el('p', 'build-slot-note', 'Click a slot on the field to build there.')]),
    );
    const all = el('section', 'build-all');
    all.append(option(`Repair all`, repairAllCost(game.base), repairAll(game.base, game.stock)));
    const start = el('section', 'build-start-section');
    const roster = el('button', 'build-option', 'Roster');
    roster.type = 'button';
    rosterButton = roster;
    roster.addEventListener('click', () => {
      rosterOpen = true;
      api.show(game, selected);
      panel.querySelector<HTMLButtonElement>('button')?.focus();
    });
    start.append(...startSection(game), roster);
    code.value = exportCode(encodeSave(game, Date.now()));
    return [
      el('h2', 'build-title', 'Build'),
      slot,
      all,
      linesSection('build-lab', labLines(game)),
      linesSection('build-power', powerLines(game)),
      start,
      backup,
    ];
  }

  /** The roster in place of the build panel: a Back button, then each defender. */
  function rosterView(game: GameState): HTMLElement[] {
    const back = el('button', 'build-option', 'Back');
    back.type = 'button';
    back.addEventListener('click', () => {
      rosterOpen = false;
      if (shown) api.show(shown.game, shown.selected);
      rosterButton?.focus(); // back where the player came from
    });
    return [el('h2', 'build-title', 'Roster'), back, ...rosterSection(game, Date.now(), onGame)];
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
      const controls = (): (HTMLButtonElement | HTMLSelectElement)[] => [
        ...panel.querySelectorAll<HTMLButtonElement | HTMLSelectElement>('button, select'),
      ];
      const focused = controls().indexOf(document.activeElement as HTMLButtonElement);
      // The backup section is the same node each time: its focus goes back where it was.
      const inBackup =
        document.activeElement instanceof HTMLElement && backup.contains(document.activeElement)
          ? document.activeElement
          : null;
      panel.replaceChildren(...(rosterOpen ? rosterView(game) : buildView(game, selected)));
      if (inBackup) {
        inBackup.focus();
      } else if (focused >= 0) {
        const after = controls();
        const next = [...after.slice(focused), ...after.slice(0, focused)].find((c) => !c.disabled);
        next?.focus();
      }
      bar.hidden = false;
      panel.hidden = false;
    },
    hide() {
      // A horde starts from the build panel; the next visit opens on it again.
      rosterOpen = false;
      bar.hidden = true;
      panel.hidden = true;
    },
    notice(text) {
      status.textContent = text;
    },
  };
  return api;
}
