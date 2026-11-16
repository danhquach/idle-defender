// @vitest-environment jsdom
// ID-179: the buy buttons for squad slots (Roster, beside "Squad 6/6") and stash slots
// (Inventory, beside "Stash 40/40"), the Scrap chip and the result screen's Scrap line.
import { describe, expect, it, vi } from 'vitest';
import { recruit } from '../core/camp.ts';
import { newGame, type GameState } from '../core/game.ts';
import { buySquadSlot, buyStashSlots, squadResult, startSquadHorde } from '../core/hordeonly.ts';
import {
  BUY_WAIT,
  buyQuestion,
  buyText,
  createScrapChip,
  shortCount,
  scrapChipText,
  scrapLine,
  slotOffer,
  squadScreen,
} from './hud.ts';
import { createInventory, inventoryView } from './inventory.ts';
import { createRoster, type RosterOptions } from './squadroster.ts';

function camp(squad: number, bench: number, scrap: number): GameState {
  const g = newGame('horde');
  const all = Array.from({ length: squad + bench }, (_, i) => recruit(i + 1));
  return {
    ...g,
    hordeNumber: 3,
    roster: all.slice(0, squad),
    reserve: all.slice(squad),
    camp: { ...g.camp, recruits: squad + bench },
    stock: { ...g.stock, scrap },
  };
}

describe('slotOffer', () => {
  it('shows the price, and progress toward it when short', () => {
    expect(slotOffer(camp(6, 1, 500), 'squad', true)).toMatchObject({
      text: '+1 slot · 500 Scrap',
      disabled: false,
      title: '',
    });
    expect(slotOffer(camp(6, 1, 120), 'squad', true)).toMatchObject({
      text: '+1 slot · 120/500 Scrap',
      disabled: true,
      title: 'Needs 500 Scrap',
    });
    expect(
      slotOffer({ ...camp(6, 1, 120), slots: { squad: 1, stash: 0 } }, 'squad', true)?.text,
    ).toBe('+1 slot · 120/1,200 Scrap');
    expect(slotOffer(camp(6, 1, 120), 'stash', true)?.text).toBe('+10 slots · 120/150 Scrap');
    expect(slotOffer(camp(6, 1, 150), 'stash', true)?.text).toBe('+10 slots · 150 Scrap');
  });

  it('is greyed with the reason in a fight, and gone at the most slots', () => {
    expect(slotOffer(camp(6, 1, 9999), 'stash', false)).toMatchObject({
      disabled: true,
      title: BUY_WAIT,
    });
    const maxed = { ...camp(6, 1, 9999), slots: { squad: 2, stash: 4 } };
    expect(slotOffer(maxed, 'squad', true)).toBeNull();
    expect(slotOffer(maxed, 'stash', true)).toBeNull();
  });
});

function mountRoster(game: GameState, canGear = true) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  let g = game;
  const onBuySquad = vi.fn(() => {
    const r = buySquadSlot(g);
    if (!r.ok) return r;
    g = r.game;
    roster.refresh();
    return { ok: true as const, text: 'Bought' };
  });
  const opts: RosterOptions = {
    state: () => ({ game: g, fight: null, canGear, resumes: false }),
    onEquip: () => ({ ok: true }),
    onToggleSquad: () => ({ ok: true }),
    onLetGo: () => null,
    onCombine: () => null,
    onBestGuns: () => ({ ok: true, moves: [] }),
    onBestSquad: () => ({ ok: true, moves: { in: [], out: [] } }),
    onAutoSquad: () => ({ ok: true, moves: { in: [], out: [] } }),
    onBuySquad,
  };
  const roster = createRoster(root, opts);
  roster.open();
  const scrim = document.querySelector<HTMLElement>('.roster-scrim')!;
  const buy = () => scrim.querySelector<HTMLButtonElement>('.rv-buy-squad')!;
  return { buy, scrim, onBuySquad, game: () => g };
}

describe('the Roster buy button', () => {
  it('sits on the squad row, buys on a click, then shows the next price', () => {
    const m = mountRoster(camp(6, 2, 2000));
    expect(m.scrim.querySelector('.rv-tabs-label')?.textContent).toBe('Squad 6/6');
    expect(m.buy().hidden).toBe(false);
    expect(m.buy().textContent).toBe('+1 slot · 500 Scrap');
    m.buy().click();
    expect(m.onBuySquad).toHaveBeenCalledOnce();
    expect(m.game().roster).toHaveLength(7);
    expect(m.scrim.querySelector('.rv-tabs-label')?.textContent).toBe('Squad 7/7');
    expect(m.buy().textContent).toBe('+1 slot · 1,200 Scrap');
    m.buy().click();
    expect(m.game().roster).toHaveLength(8);
    // Every slot bought: gone.
    expect(m.buy().hidden).toBe(true);
  });

  it('is disabled when unaffordable and says what it needs', () => {
    const m = mountRoster(camp(6, 2, 100));
    expect(m.buy().disabled).toBe(true);
    expect(m.buy().textContent).toBe('+1 slot · 100/500 Scrap');
    expect(m.buy().title).toBe('Needs 500 Scrap');
    m.buy().click();
    expect(m.onBuySquad).not.toHaveBeenCalled();
  });

  it('is disabled in a fight with the reason', () => {
    const m = mountRoster(camp(6, 2, 5000), false);
    expect(m.buy().disabled).toBe(true);
    expect(m.buy().title).toBe(BUY_WAIT);
    m.buy().click();
    expect(m.onBuySquad).not.toHaveBeenCalled();
  });
});

function mountInventory(game: GameState, canBuy = true, answer = true) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  let g = game;
  const onBuyStash = vi.fn(() => {
    if (!answer) return null;
    const r = buyStashSlots(g);
    if (!r.ok) return r;
    g = r.game;
    inv.refresh();
    return { ok: true as const, text: buyText('stash', 150, g.stock.scrap) };
  });
  const inv = createInventory(root, {
    state: () => ({ game: g, resumes: false, canBuy }),
    onBuyStash,
  });
  inv.open();
  const scrim = document.querySelector<HTMLElement>('.inv-scrim')!;
  const buy = () => scrim.querySelector<HTMLButtonElement>('.inv-buy');
  const heading = () => scrim.querySelector('.inv-stash-heading')?.textContent;
  return { buy, heading, onBuyStash, scrim };
}

describe('the Inventory buy button', () => {
  it('sits by the stash heading, buys on a click and shows the new size', () => {
    const m = mountInventory(camp(2, 0, 400));
    expect(m.heading()).toBe('Stash 0/40');
    expect(m.buy()?.textContent).toBe('+10 slots · 150 Scrap');
    m.buy()!.click();
    expect(m.onBuyStash).toHaveBeenCalledOnce();
    expect(m.heading()).toBe('Stash 0/50');
    expect(m.buy()?.textContent).toBe('+10 slots · 250 Scrap');
    expect(m.scrim.querySelector('.inv-status')?.textContent).toBe(
      'Bought 10 stash slots · 150 Scrap spent, 250 left.',
    );
  });

  it('is disabled when unaffordable ("Needs N Scrap") and in a fight', () => {
    const poor = mountInventory(camp(2, 0, 10));
    expect(poor.buy()!.disabled).toBe(true);
    expect(poor.buy()!.textContent).toBe('+10 slots · 10/150 Scrap');
    poor.buy()!.click();
    expect(poor.onBuyStash).not.toHaveBeenCalled();
    const fight = mountInventory(camp(2, 0, 9999), false);
    expect(fight.buy()!.disabled).toBe(true);
    expect(fight.buy()!.title).toBe(BUY_WAIT);
  });

  it('a no to the confirm buys nothing', () => {
    const m = mountInventory(camp(2, 0, 400), true, false);
    m.buy()!.click();
    expect(m.heading()).toBe('Stash 0/40');
  });

  it('is hidden once every slot is bought', () => {
    const g = { ...camp(2, 0, 9999), slots: { squad: 0, stash: 4 } };
    expect(inventoryView(g, null, true).buy).toBeNull();
    expect(inventoryView(g).stashHeading).toBe('Stash 0/80');
    expect(mountInventory(g).buy()).toBeNull();
  });
});

describe('Scrap on the screens', () => {
  it('the result screen says what a win paid, and the salvage in it', () => {
    expect(scrapChipText({ total: 35 })).toBe('+35 Scrap');
    expect(scrapLine({ total: 35, salvage: 0, now: 655 })).toBe('+35 Scrap · now 655');
    expect(scrapLine({ total: 1055, salvage: 20, now: 12655 })).toBe(
      '+1,055 Scrap (20 from salvage) · now 12,655',
    );
    expect(buyText('squad', 500, 120)).toBe('Bought 1 squad slot · 500 Scrap spent, 120 left.');
    expect(buyQuestion('squad', 1200, 2500)).toBe(
      'Buy 1 squad slot for 1,200 Scrap? You have 2,500.',
    );
    const g = camp(2, 0, 0);
    const s = { ...startSquadHorde(g, 1, 1_700_000_000_000), outcome: 'won' as const };
    const screen = squadScreen(g, s);
    const paid = squadResult(g, s).scrap;
    expect(screen.lines).toContain(scrapLine(paid));
    // The chip stays short; the full line (balance included) is the result line.
    expect(screen.debrief?.chips.map((c) => c.text)).toContain(scrapChipText(paid));
    // The page shows the debrief, not the lines: the chip's hover hint carries the full line.
    expect(screen.debrief?.chips.find((c) => c.text === scrapChipText(paid))?.title).toBe(
      scrapLine(paid),
    );
    expect(paid.now).toBe(g.stock.scrap + paid.total);
    const lost = squadScreen(g, { ...s, outcome: 'lost' });
    expect(lost.lines.some((l) => l.includes('Scrap'))).toBe(false);
  });

  it('the top bar shows the balance', () => {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const chip = createScrapChip(document);
    chip.set(1234);
    const el = document.querySelector('.scrap-chip')!;
    expect(el.textContent).toBe('Scrap 1,234');
    expect(el.getAttribute('aria-live')).toBe('polite');
    // A read-only chip, not a button, and on the page itself so the dialogs never cover it.
    expect(el.tagName).not.toBe('BUTTON');
    expect(el.parentElement).toBe(document.body);
    expect(root.querySelector('.hud-corner-scrap')).toBeNull();
    chip.set(5);
    expect(el.textContent).toBe('Scrap 5');
    // Big balances stay short so the chip never grows into the speed buttons; the exact
    // figure is the hover hint and what a screen reader hears.
    chip.set(1_234_567);
    expect(el.textContent).toBe('Scrap 1.2M');
    expect((el as HTMLElement).title).toBe('Scrap 1,234,567');
    expect(el.getAttribute('aria-label')).toBe('Scrap balance: 1,234,567');
  });

  it('shortens counts past 99,999', () => {
    const cases: [number, string][] = [
      [0, '0'],
      [99_999, '99,999'],
      [100_000, '100k'],
      [999_999, '999k'],
      [1_000_000, '1M'],
      [9_999_999, '9.9M'],
      [123_456_789, '123M'],
      [4_500_000_000, '4.5B'],
      [1e12, '1T'],
    ];
    for (const [n, text] of cases) expect(shortCount(n), String(n)).toBe(text);
  });
});
