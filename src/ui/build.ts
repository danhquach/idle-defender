// Build mode panel between hordes: stock bar, the selected slot's menu, Repair all,
// and the start defender and post. Every option is a dry run of the core action, so
// a refused one shows disabled with the core's own reason. Text only via textContent.
import {
  buildPost,
  buildSegment,
  repairAll,
  repairAllCost,
  repairCost,
  repairSegment,
  upgradeSegment,
  type Base,
  type BasePost,
  type Result,
} from '../core/base.ts';
import { postUsable } from '../core/cards.ts';
import { MATERIALS, POST_COST, TIER_ORDER, TIERS, type Stock } from '../core/data.ts';
import { available, type GameState, type RosterDefender } from '../core/game.ts';
import { layoutOf } from '../core/horde.ts';
import { exportCode, importCode, type ImportResult } from '../storage/code.ts';
import { encodeSave } from '../storage/save.ts';
import { clockTime, el, POST_NAME, postName, slotName, stockText } from './hud.ts';
import type { SlotHit } from './projection.ts';

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
  // Build mode reads the clock for injuries; the core only ever gets it as `now`.
  const choice = (game: GameState) => pickStart(game, defenderId, startKey, Date.now());

  /** One menu option: its label and cost, and the refusal reason when it isn't allowed. */
  function option(label: string, cost: Partial<Stock> | null, result: Result): HTMLElement {
    const button = el('button', 'build-option');
    button.type = 'button';
    button.append(el('span', 'build-option-label', label));
    if (cost) button.append(el('span', 'build-option-cost', `(${stockText(cost)})`));
    if (!result.ok) {
      button.disabled = true;
      button.append(el('span', 'build-option-reason', result.reason));
    } else {
      button.addEventListener('click', () => onChange(result.base, result.stock));
    }
    return button;
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
      return [
        el('h3', 'build-slot-title', `${slotName(column, row)}: empty`),
        option(POST_NAME[kind], POST_COST[kind], buildPost(base, stock, post)),
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
      hasWalk
        ? el('p', 'build-slot-note', 'Has a wall-walk post')
        : option(POST_NAME['wall-walk'], POST_COST['wall-walk'], buildPost(base, stock, walk)),
    ];
  }

  function startSection(game: GameState): HTMLElement[] {
    const picked = choice(game);
    const defenders = el('select', 'build-select');
    for (const d of game.roster.filter((r) => available(r, Date.now()))) {
      const o = el('option', '', d.name);
      o.value = d.id;
      o.selected = d.id === picked?.defenderId;
      defenders.append(o);
    }
    defenders.addEventListener('change', () => {
      defenderId = defenders.value;
    });
    const posts = el('select', 'build-select');
    for (const p of usablePosts(game.base)) {
      const o = el('option', '', postName(p));
      o.value = postKey(p);
      o.selected = picked !== null && game.base.posts[picked.postId] === p;
      posts.append(o);
    }
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

  return {
    choice,
    show(game, selected) {
      // Pin the pick (or its fallback) by slot, so building a post never moves it.
      const picked = choice(game);
      if (picked) {
        defenderId = picked.defenderId;
        startKey = postKey(game.base.posts[picked.postId]!);
      }
      bar.textContent = stockBarText(game);
      const slot = el('section', 'build-slot');
      slot.append(
        ...(selected
          ? slotMenu(game, selected)
          : [el('p', 'build-slot-note', 'Click a slot on the field to build there.')]),
      );
      const all = el('section', 'build-all');
      all.append(option(`Repair all`, repairAllCost(game.base), repairAll(game.base, game.stock)));
      const start = el('section', 'build-start-section');
      start.append(...startSection(game));
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
      code.value = exportCode(encodeSave(game, Date.now()));
      panel.replaceChildren(el('h2', 'build-title', 'Build'), slot, all, start, backup);
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
      bar.hidden = true;
      panel.hidden = true;
    },
    notice(text) {
      status.textContent = text;
    },
  };
}
