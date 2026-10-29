// HUD over the canvas: status bar, the 1-of-3 card panel, the result panel and a
// short toast (refused moves).
// Text reaches the page only through textContent.
import { UPGRADES } from '../core/cards.ts';
import { MATERIALS, type Stock } from '../core/data.ts';
import { standInPayout } from '../core/game.ts';
import type { Card, HordeState } from '../core/horde.ts';
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
    `Camp ${Math.ceil(s.camp.hp)}/${s.camp.maxHp}`,
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
  return `Payout: ${stockText(standInPayout(s.hordeNumber, s.outcome))}`;
}

export function createHud(
  root: HTMLElement,
  onChoose: (index: number) => void,
  onDone: () => void,
): { update(state: HordeState): void; show(visible: boolean): void; toast(text: string): void } {
  const hud = el('div', 'hud');
  const bar = el('div', 'hud-bar');
  const cards = el('div', 'hud-panel hud-cards');
  const result = el('div', 'hud-panel hud-result');
  const resultTitle = el('h2', 'hud-result-title');
  const resultBody = el('p', 'hud-result-body');
  const back = el('button', 'hud-button', 'Back to build');
  back.type = 'button';
  back.addEventListener('click', () => {
    // Hide at once so a double click can't finish the same horde twice.
    if (result.hidden) return;
    result.hidden = true;
    onDone();
  });
  result.append(resultTitle, resultBody, back);
  const toast = el('div', 'hud-toast');
  toast.setAttribute('role', 'status');
  toast.hidden = true;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  cards.hidden = true;
  result.hidden = true;
  hud.append(bar, toast, cards, result);
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

      // The sim clones its state each tick, so compare the offer by content.
      if (JSON.stringify(state.offer) !== JSON.stringify(shownOffer)) {
        shownOffer = state.offer;
        cards.hidden = state.offer === null;
        if (state.offer) showOffer(state.offer);
        else cards.replaceChildren();
      }

      const fought = state.outcome !== 'fighting';
      if (result.hidden === fought) {
        result.hidden = !fought;
        resultTitle.textContent = state.outcome === 'won' ? 'Horde held' : 'The camp fell';
        resultBody.textContent = payoutText(state);
        if (fought) back.focus();
      }
    },
  };
}
