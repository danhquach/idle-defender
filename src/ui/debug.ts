// Debug mode's panel (ID-197): a DEBUG badge that stays on screen, and the panel it opens,
// to set up the state a tester needs in a few clicks. Every typed value is checked against
// its range here and refused when it is anything else; the moves themselves are core/debug.ts.
import { DROP_GUNS, dropRarity } from '../core/armoury.ts';
import { UPGRADES } from '../core/cards.ts';
import {
  RARITIES,
  RARITY_ORDER,
  SKILL_IDS,
  SKILLS,
  WEAPONS,
  type Rarity,
  type SkillId,
  type WeaponId,
} from '../core/data.ts';
import { DEBUG_LIMITS } from '../core/debug.ts';
import type { UpgradeId } from '../core/horde.ts';
import { el } from './hud.ts';

/** The debug fight speeds (ID-197), apart from the player's own. */
export const DEBUG_SPEEDS = [2, 5, 10] as const;
export type DebugSpeed = (typeof DEBUG_SPEEDS)[number];

/** The longest text a debug field takes; longer is refused before it is read. */
const MAX_FIELD = 10;

/**
 * A whole number typed into a debug field, or null: digits only (no sign, point, space or
 * exponent), at most `MAX_FIELD` of them, within `range`. Never clamped.
 */
export function parseWhole(raw: string, range: { min: number; max: number }): number | null {
  if (typeof raw !== 'string' || raw.length > MAX_FIELD || !/^[0-9]+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= range.min && n <= range.max ? n : null;
}

/** What the panel shows of the game as it stands. */
export interface DebugView {
  /** A fight on and not over. */
  fighting: boolean;
  /** Between hordes (no fight, or its result up): the camp can change. */
  between: boolean;
  /** The next new horde. */
  hordeNumber: number;
  /** What the camp fields hold now, shown in them while empty. */
  campLevel: number;
  scrap: number;
  squad: number;
  stash: number;
  /** The fight's seed, or null with none on. */
  seed: number | null;
  /** Everyone in the camp, squad then bench. */
  survivors: readonly { id: string; name: string }[];
  /** Who stands on the line in the fight. */
  line: readonly { id: string; name: string }[];
  /** The cards the fight could still offer. */
  cards: readonly UpgradeId[];
  /** The debug speed on, or null for the player's. */
  speed: DebugSpeed | null;
  held: boolean;
}

/** Each debug move: null when done, else why not (shown in the panel). */
export interface DebugActions {
  start(horde: number, seed: number | null): string | null;
  campLevel(level: number): string | null;
  scrap(n: number): string | null;
  squad(n: number): string | null;
  level(id: string | null, level: number): string | null;
  gun(base: WeaponId, rarity: Rarity): string | null;
  stash(n: number): string | null;
  skill(id: SkillId | null): string | null;
  offer(id: UpgradeId): string | null;
  grant(id: UpgradeId): string | null;
  speed(x: DebugSpeed | null): void;
  pause(): void;
  win(): string | null;
  lose(): string | null;
  down(id: string): string | null;
  reset(): void;
}

export interface DebugPanel {
  /** Whether the panel is open: only then is it worth bringing up to date. */
  isOpen(): boolean;
  /** Brings the panel's lists and states up to the game as it stands. */
  show(view: DebugView): void;
}

const button = (text: string, onClick: () => void): HTMLButtonElement => {
  const b = el('button', 'btn btn-secondary debug-btn', text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
};

const field = (label: string, size = 6): HTMLInputElement => {
  const input = el('input', 'debug-field');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.maxLength = MAX_FIELD;
  input.size = size;
  input.setAttribute('aria-label', label);
  return input;
};

const select = (label: string): HTMLSelectElement => {
  const s = el('select', 'debug-select');
  s.setAttribute('aria-label', label);
  return s;
};

/** `s` filled with `options` (value, text), the old pick kept where it is still there. */
function fill(s: HTMLSelectElement, options: readonly (readonly [string, string])[]): void {
  // Unchanged options are left alone: the panel is brought up to date every frame, and an
  // open list must stay open.
  const key = JSON.stringify(options);
  if (s.dataset.options === key) return;
  s.dataset.options = key;
  const was = s.value;
  s.replaceChildren(
    ...options.map(([value, text]) => {
      const o = el('option', '', text);
      o.value = value;
      return o;
    }),
  );
  if (options.some(([v]) => v === was)) s.value = was;
}

const row = (label: string, ...parts: HTMLElement[]): HTMLElement => {
  const r = el('div', 'debug-row');
  r.append(el('span', 'debug-label', label), ...parts);
  return r;
};

export function createDebugPanel(root: HTMLElement, act: DebugActions): DebugPanel {
  // The badge: always on screen while debug mode is on, and the panel's toggle.
  const badge = el('button', 'debug-badge', 'DEBUG');
  badge.type = 'button';
  badge.setAttribute('aria-expanded', 'false');
  badge.setAttribute('aria-controls', 'debug-panel');
  badge.title = 'Debug mode: this camp is not your real save';

  const panel = el('section', 'debug-panel');
  panel.id = 'debug-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Debug');
  const status = el('p', 'debug-status');
  status.setAttribute('role', 'status');
  badge.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    badge.setAttribute('aria-expanded', String(!panel.hidden));
  });

  /** Runs a move and says how it went; a refused field keeps its text to fix. */
  const said = (reason: string | null, done: string): void => {
    status.textContent = reason ?? done;
    status.dataset.refused = reason === null ? 'false' : 'true';
  };
  // A refusal names the field it is about.
  const typed = (input: HTMLInputElement, range: { min: number; max: number }): number | null => {
    const n = parseWhole(input.value, range);
    if (n === null)
      said(`${input.getAttribute('aria-label')}: type ${range.min} to ${range.max}`, '');
    return n;
  };

  // Horde and seed.
  const horde = field('Horde', 4);
  const seed = field('Seed', 10);
  seed.placeholder = 'random';
  const seedNow = el('span', 'debug-note', '');
  const start = button('Start', () => {
    const n = typed(horde, DEBUG_LIMITS.horde);
    if (n === null) return;
    const s = seed.value === '' ? null : typed(seed, DEBUG_LIMITS.seed);
    if (seed.value !== '' && s === null) return;
    said(act.start(n, s), `Horde ${n} started`);
  });

  // Progress.
  const campLevel = field('Camp level', 3);
  const scrap = field('Scrap', 7);
  const squad = field('Squad size', 2);
  const who = select('Survivor');
  const level = field('Survivor level', 3);
  level.placeholder = `${DEBUG_LIMITS.level.min}-${DEBUG_LIMITS.level.max}`;
  const number =
    (
      input: HTMLInputElement,
      range: { min: number; max: number },
      run: (n: number) => string | null,
      done: string,
    ) =>
    (): void => {
      const n = typed(input, range);
      if (n !== null) said(run(n), done);
    };

  // Items.
  const gun = select('Gun');
  fill(
    gun,
    DROP_GUNS.map((id) => [id, WEAPONS[id].name]),
  );
  const rarity = select('Rarity');
  const rarities = (): void =>
    fill(
      rarity,
      RARITY_ORDER.filter((r) => dropRarity(gun.value as WeaponId, r) === r).map((r) => [
        r,
        RARITIES[r].name,
      ]),
    );
  gun.addEventListener('change', rarities);
  rarities();
  const stash = field('Stash guns', 3);

  // Cards and skills.
  const card = select('Card');
  const skill = select('Skill');
  fill(skill, [['', 'None'], ...SKILL_IDS.map((id) => [id, SKILLS[id].name] as const)]);
  const offer = button('Offer', () => said(act.offer(card.value as UpgradeId), 'Offered'));
  const grant = button('Grant', () => said(act.grant(card.value as UpgradeId), 'Granted'));

  // Fight.
  const speeds = [null, ...DEBUG_SPEEDS].map((x) => {
    const b = button(x === null ? 'Game' : `×${x}`, () => act.speed(x));
    if (x === null) b.title = 'The top bar’s speed';
    b.dataset.speed = String(x);
    return b;
  });
  const pause = button('Pause', () => act.pause());
  const downWho = select('Survivor to down');
  const down = button('Down', () => said(act.down(downWho.value), 'Downed'));
  const win = button('Win', () => said(act.win(), 'Win forced'));
  const lose = button('Lose', () => said(act.lose(), 'Loss forced'));

  // Each heading says when its controls work, so a greyed one never looks broken.
  const section = (title: string, when: string, ...rows: HTMLElement[]): HTMLElement => {
    const s = el('div', 'debug-section');
    const h = el('h3', 'debug-heading', title);
    if (when) h.append(el('span', 'debug-when', ` · ${when}`));
    s.append(h, ...rows);
    return s;
  };
  const between = [
    button(
      'Set',
      number(campLevel, DEBUG_LIMITS.campLevel, (n) => act.campLevel(n), 'Camp level set'),
    ),
    button(
      'Set',
      number(scrap, DEBUG_LIMITS.scrap, (n) => act.scrap(n), 'Scrap set'),
    ),
    button(
      'Set',
      number(squad, DEBUG_LIMITS.squad, (n) => act.squad(n), 'Squad set'),
    ),
    button(
      'Set',
      number(
        level,
        DEBUG_LIMITS.level,
        (n) => act.level(who.value === '' ? null : who.value, n),
        'Level set',
      ),
    ),
    button('Add', () => said(act.gun(gun.value as WeaponId, rarity.value as Rarity), 'Gun added')),
    button('Fill', () => {
      const n = typed(stash, DEBUG_LIMITS.stash);
      if (n !== null) said(act.stash(n), 'Stash filled');
    }),
    button('Set', () =>
      said(act.skill(skill.value === '' ? null : (skill.value as SkillId)), 'Skill set'),
    ),
  ];
  const [setCamp, setScrap, setSquad, setLevel, addGun, fillStash, setSkill] = between as [
    HTMLButtonElement,
    HTMLButtonElement,
    HTMLButtonElement,
    HTMLButtonElement,
    HTMLButtonElement,
    HTMLButtonElement,
    HTMLButtonElement,
  ];
  const fight = [offer, grant, ...speeds, pause, down, win, lose];

  const reset = el('button', 'btn debug-btn debug-reset', 'Reset debug save');
  reset.type = 'button';
  reset.addEventListener('click', () => {
    act.reset();
    said(null, 'Debug save reset');
  });

  const speedRow = el('div', 'debug-buttons');
  speedRow.append(...speeds, pause);
  const endRow = el('div', 'debug-buttons');
  endRow.append(win, lose);
  panel.append(
    section('Horde', 'between hordes', row('Horde', horde, start), row('Seed', seed, seedNow)),
    section(
      'Camp',
      'between hordes',
      row('Camp', campLevel, setCamp),
      row('Scrap', scrap, setScrap),
      row('Squad', squad, setSquad),
      row('Level', who, level, setLevel),
      row('Skill', skill, setSkill),
    ),
    section(
      'Guns',
      'between hordes',
      row('Gun', gun, rarity, addGun),
      row('Stash', stash, fillStash),
    ),
    section(
      'Fight',
      'in a fight',
      row('Card', card, offer, grant),
      row('Speed', speedRow),
      row('Down', downWho, down),
      row('End', endRow),
    ),
    status,
    reset,
  );
  // On the page itself, above the intro and every window, so the badge is never covered.
  root.ownerDocument.body.append(panel, badge);

  return {
    isOpen: () => !panel.hidden,
    show(v) {
      seedNow.textContent = v.seed === null ? 'Now: none' : `Now: ${v.seed}`;
      // Each empty field shows what it holds now.
      horde.placeholder = String(v.hordeNumber);
      campLevel.placeholder = String(v.campLevel);
      scrap.placeholder = String(v.scrap);
      squad.placeholder = String(v.squad);
      stash.placeholder = String(v.stash);
      fill(who, [['', 'Everyone'], ...v.survivors.map((d) => [d.id, d.name] as const)]);
      fill(
        downWho,
        v.line.map((d) => [d.id, d.name] as const),
      );
      fill(
        card,
        v.cards.map((id) => [id, UPGRADES[id].name] as const),
      );
      for (const b of between) b.disabled = !v.between;
      for (const b of fight) b.disabled = !v.fighting;
      down.disabled = !v.fighting || v.line.length === 0;
      offer.disabled = grant.disabled = !v.fighting || v.cards.length === 0;
      start.disabled = !v.between;
      for (const b of speeds)
        b.setAttribute('aria-pressed', String(String(v.speed) === b.dataset.speed));
      pause.setAttribute('aria-pressed', String(v.held));
      pause.textContent = v.held ? 'Resume' : 'Pause';
    },
  };
}
