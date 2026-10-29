// HUD over the canvas: status bar, the "camp is falling" warning, the 1-of-3 card
// panel, the replacement panel, the result panel and a short toast (refused moves).
// Text reaches the page only through textContent.
import { repairAllCost, type PostKind } from '../core/base.ts';
import { UPGRADES } from '../core/cards.ts';
import { FALL_WARNING, MATERIALS, type EnemyKind, type Stock } from '../core/data.ts';
import { hordePayout, injuredUntil, xpGains, type GameState } from '../core/game.ts';
import {
  baseAfter,
  type Breach,
  type Card,
  type HordeState,
  type Injury,
  type Post,
} from '../core/horde.ts';
import { replacePosts } from '../core/replace.ts';
import { xpToNext } from '../core/waves.ts';

/** How long a toast stays up. */
const TOAST_MS = 2000;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

export const POST_NAME: Readonly<Record<PostKind, string>> = {
  tower: 'Tower',
  'wall-walk': 'Wall-walk post',
  ground: 'Ground post',
};
export const slotName = (column: number, row: number): string =>
  `Layer ${column + 1}, row ${row + 1}`;
export const postName = (p: Pick<Post, 'kind' | 'column' | 'row'>): string =>
  `${POST_NAME[p.kind]} · ${slotName(p.column, p.row)}`;

function cardText(card: Card): { title: string; body: string } {
  if (card.kind === 'recruit')
    return { title: `Recruit ${card.defender.name}`, body: 'Takes a free post' };
  const u = UPGRADES[card.id];
  return { title: u.name, body: u.text };
}

export function statusText(s: HordeState): string {
  return [
    `Horde ${s.hordeNumber}`,
    `Wave ${s.wave}/${s.waveCount}`,
    `Lv ${s.level} (${s.xp}/${xpToNext(s.level)})`,
  ].join(' · ');
}

/** Amounts as "5 scrap, 10 wood" in material order, skipping zeros; "nothing" if all are. */
export function stockText(stock: Partial<Stock>): string {
  const parts = MATERIALS.filter((m) => (stock[m] ?? 0) > 0).map((m) => `${stock[m]} ${m}`);
  return parts.length > 0 ? parts.join(', ') : 'nothing';
}

export function payoutText(s: HordeState): string {
  if (s.outcome === 'fighting') return '';
  return `Payout: ${stockText(hordePayout(s))}`;
}

/** A wall-clock time as "14:05", in the player's locale. */
export const clockTime = (ms: number): string =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const ENEMY_NAME: Readonly<Record<EnemyKind, string>> = { shambler: 'Shambler' };
const THROUGH: Readonly<Record<Breach['through'], string>> = {
  wall: 'broken wall',
  gate: 'broken gate',
  gap: 'open gap',
};

export interface ResultScreen {
  title: string;
  lines: string[];
  button: string;
}

/** "Jack · injured by a Shambler · back at 14:05", for a horde that ended at `now`. */
function injuryLine(s: HordeState, i: Injury, now: number): string {
  const by = i.by ? ` by a ${ENEMY_NAME[i.by]}` : '';
  return `${i.defender.name} · injured${by} · back at ${clockTime(injuredUntil(s, i, now))}`;
}

/** The repair bill for the damage that carries over, against the stock after the payout. */
function repairLine(game: GameState, s: HordeState): string {
  const bill = repairAllCost(baseAfter(game.base, s));
  if (MATERIALS.every((m) => bill[m] === 0)) return 'No repairs needed';
  const payout = hordePayout(s);
  const short: Partial<Stock> = {};
  for (const m of MATERIALS) short[m] = Math.max(0, bill[m] - game.stock[m] - payout[m]);
  const cover = MATERIALS.some((m) => short[m]! > 0) ? `short by ${stockText(short)}` : 'covered';
  return `Repair bill: ${stockText(bill)} · ${cover}`;
}

/**
 * The victory or defeat screen (design §2) for horde `s`, which ended at `now`: why
 * it was won or lost, the payout, XP, the injured and when they're back, and the
 * repair bill. `game` is the game the horde was fought from, before `finishHorde`.
 */
export function resultScreen(game: GameState, s: HordeState, now: number): ResultScreen {
  if (s.outcome === 'fighting') throw new RangeError('resultScreen: the horde is still on');
  const injured = s.injured.map((i) => injuryLine(s, i, now));
  if (s.outcome === 'won') {
    return {
      title: `Horde ${s.hordeNumber} held`,
      lines: [
        `All ${s.waveCount} waves cleared`,
        payoutText(s),
        ...xpGains(s).map((g) => `${g.name} +${g.xp} XP`),
        ...injured,
        repairLine(game, s),
      ],
      button: 'Back to build',
    };
  }
  // Outside in: the outer layers have the higher columns. The innermost is where they got in.
  const path = [...s.breaches].sort((a, b) => b.column - a.column);
  const inner = path.at(-1);
  const where = inner
    ? `Broke in at ${slotName(inner.column, inner.row)}, in wave ${inner.wave} of ${s.waveCount}`
    : 'Broke in';
  const why = `${where} · nobody left to hold them for ${FALL_WARNING} s`;
  return {
    title: 'The camp fell',
    lines: [
      why,
      ...path.map((b) => `Layer ${b.column + 1} · row ${b.row + 1} · ${THROUGH[b.through]}`),
      payoutText(s),
      'No XP on a loss',
      ...injured,
      repairLine(game, s),
    ],
    button: `Back to build · retry Horde ${s.hordeNumber}`,
  };
}

/** The countdown while the camp is falling, else ''. */
export function fallingText(s: HordeState): string {
  if (s.fallingFor <= 0 || s.outcome !== 'fighting') return '';
  return `The camp is falling — ${Math.ceil(FALL_WARNING - s.fallingFor)} s`;
}

export function createHud(
  root: HTMLElement,
  onChoose: (index: number) => void,
  onDone: () => void,
  onReplace: (defenderId: string, postId: number) => void,
  onSkip: () => void,
): {
  update(state: HordeState): void;
  showResult(screen: ResultScreen): void;
  show(visible: boolean): void;
  toast(text: string): void;
} {
  const hud = el('div', 'hud');
  const bar = el('div', 'hud-bar');
  const warning = el('div', 'hud-warning');
  warning.setAttribute('role', 'alert');
  warning.hidden = true;
  const cards = el('div', 'hud-panel hud-cards');
  const replace = el('div', 'hud-panel hud-replace');
  replace.hidden = true;
  const result = el('div', 'hud-panel hud-result');
  const resultTitle = el('h2', 'hud-result-title');
  const resultList = el('ul', 'hud-result-list');
  const back = el('button', 'hud-button');
  back.type = 'button';
  back.addEventListener('click', () => {
    // Hide at once so a double click can't finish the same horde twice.
    if (result.hidden) return;
    result.hidden = true;
    onDone();
  });
  result.append(resultTitle, resultList, back);
  const toast = el('div', 'hud-toast');
  toast.setAttribute('role', 'status');
  toast.hidden = true;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  cards.hidden = true;
  result.hidden = true;
  hud.append(bar, warning, toast, cards, replace, result);
  root.append(hud);

  let shownOffer: Card[] | null = null;
  // Hide the panel at once: a second click or key before the next frame must not
  // pick from an offer the player hasn't seen yet.
  function choose(index: number): void {
    if (cards.hidden || !shownOffer?.[index]) return;
    cards.hidden = true;
    shownOffer = null;
    onChoose(index);
  }
  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const index = ['1', '2', '3'].indexOf(e.key);
    if (index >= 0) choose(index);
  });

  // Like the cards: hide at once so a second click can't answer the same offer twice.
  let shownReplace = '';
  function answer(act: () => void): void {
    if (replace.hidden) return;
    replace.hidden = true;
    shownReplace = '';
    act();
  }
  function showReplace(state: HordeState): void {
    const offer = state.replace!;
    const name = state.injured.find((i) => i.defender.id === offer.injuredId)?.defender.name ?? '';
    const posts = replacePosts(state);
    const heading = el('h2', 'hud-cards-title', `${name} is injured: send someone in?`);
    const parts: HTMLElement[] = [heading];
    const pick = el('select', 'build-select');
    for (const p of posts) {
      const o = el('option', '', postName(p));
      o.value = String(p.id);
      pick.append(o);
    }
    if (offer.postId === null) {
      const label = el('label', 'build-field', 'Post');
      label.append(pick);
      parts.push(label);
    } else {
      parts.push(el('p', 'hud-result-body', `Takes ${postName(posts[0]!)}`));
    }
    const row = el('div', 'hud-card-row');
    for (const d of state.bench) {
      const button = el('button', 'hud-card hud-card-recruit');
      button.type = 'button';
      button.append(el('span', 'hud-card-title', `Send in ${d.name}`));
      button.addEventListener('click', () => answer(() => onReplace(d.id, Number(pick.value))));
      row.append(button);
    }
    const skip = el('button', 'hud-button hud-skip', 'Skip');
    skip.type = 'button';
    skip.addEventListener('click', () => answer(onSkip));
    replace.replaceChildren(...parts, row, skip);
  }

  function showOffer(offer: Card[]): void {
    const heading = el('h2', 'hud-cards-title', 'Level up: pick one');
    const row = el('div', 'hud-card-row');
    offer.forEach((card, i) => {
      const { title, body } = cardText(card);
      const button = el('button', `hud-card hud-card-${card.kind}`);
      button.type = 'button';
      button.append(
        el('span', 'hud-card-key', String(i + 1)),
        el('span', 'hud-card-title', title),
        el('span', 'hud-card-body', body),
      );
      button.addEventListener('click', () => choose(i));
      row.append(button);
    });
    cards.replaceChildren(heading, row);
  }

  return {
    show(visible) {
      hud.hidden = !visible;
      if (!visible) toast.hidden = true;
    },
    toast(text) {
      toast.textContent = text;
      toast.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toast.hidden = true;
      }, TOAST_MS);
    },
    update(state) {
      const status = statusText(state);
      if (bar.textContent !== status) bar.textContent = status;
      const falling = fallingText(state);
      if (warning.textContent !== falling) warning.textContent = falling;
      warning.hidden = falling === '';

      // Redraw only when the offer, bench or free posts change (the sim clones each tick).
      const replaceKey = state.replace
        ? JSON.stringify([state.replace, state.bench, replacePosts(state).map((p) => p.id)])
        : '';
      if (replaceKey !== shownReplace) {
        shownReplace = replaceKey;
        replace.hidden = replaceKey === '';
        if (state.replace) {
          showReplace(state);
          replace.querySelector('button')?.focus();
        } else replace.replaceChildren();
      }

      // The sim clones its state each tick, so compare the offer by content.
      if (JSON.stringify(state.offer) !== JSON.stringify(shownOffer)) {
        shownOffer = state.offer;
        cards.hidden = state.offer === null;
        if (state.offer) showOffer(state.offer);
        else cards.replaceChildren();
      }
    },
    showResult(screen) {
      resultTitle.textContent = screen.title;
      resultList.replaceChildren(...screen.lines.map((line) => el('li', '', line)));
      back.textContent = screen.button;
      result.hidden = false;
      back.focus();
    },
  };
}
