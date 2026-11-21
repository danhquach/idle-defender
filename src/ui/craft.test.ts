// @vitest-environment jsdom
// ID-209, UI half: the Craft tab (third in the camp window, after Weapons): the blueprint list
// with a count per gun type, the crafting area (gun type, Scrap amount, live odds, Craft
// button), its greyed states, the result line and its "View in Weapons", salvage; and the
// result panel's blueprint line with the loot. Text reaches the page only through textContent.
import { describe, expect, it, vi } from 'vitest';
import { recruit } from '../core/camp.ts';
import { BLUEPRINT_GUNS, craftOdds } from '../core/craft.ts';
import { BLUEPRINT, CRAFT, STASH_CAP, WEAPONS, type WeaponId } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import {
  craftGun,
  salvageBlueprint,
  squadResult,
  startSquadHorde,
  type SquadDrop,
} from '../core/hordeonly.ts';
import { rollBlueprint } from '../core/craft.ts';
import { createCampWindow } from './campwindow.ts';
import {
  CRAFT_EMPTY,
  CRAFT_WAIT,
  craftedLine,
  craftLabel,
  craftTabLabel,
  salvageQuestion,
  createCraft,
  percent,
  salvageLabel,
} from './craft.ts';
import {
  blueprintLine,
  createHud,
  dropTile,
  squadDropLines,
  squadScreen,
  stashNowText,
  withStashNow,
} from './hud.ts';
import { createInventory } from './inventory.ts';
import { answerConfirm, confirmPanel, confirmQuestion } from './testing.ts';

const NOW = 1_700_000_000_000;
const noop = (): void => {};
const [A, B] = BLUEPRINT_GUNS as readonly [WeaponId, WeaponId];

function camp(
  scrap: number,
  bp: Partial<Record<WeaponId, number>>,
  stash = 0,
  made = 0,
): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: 13,
    roster: [recruit(1), recruit(2)],
    camp: { ...g.camp, recruits: 2 },
    armoury: Array.from({ length: stash }, (_, i) => ({
      uid: `h${i + 1}`,
      base: 'smg' as const,
      rarity: 'rusty' as const,
      affixes: [],
      level: 1,
    })),
    stock: { ...g.stock, scrap },
    ...(Object.keys(bp).length > 0 || made > 0 ? { craft: { blueprints: bp, made } } : {}),
  };
}

function mount(start: GameState, canCraft = true) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  let g = start;
  let can = canCraft;
  const win = createCampWindow(root);
  const inv = createInventory(
    root,
    { state: () => ({ game: g, resumes: false, canCombine: true }) },
    win,
  );
  const onView = vi.fn((uid: string) => inv.open(uid));
  const tab = createCraft(
    {
      state: () => ({ game: g, resumes: false, canCraft: can }),
      onCraft: (base, amount) => {
        const r = craftGun(g, base, amount);
        if (r.ok) g = r.game;
        return r.ok ? { ok: true, weapon: r.weapon } : r;
      },
      onSalvage: (base) => {
        const r = salvageBlueprint(g, base);
        if (r.ok) g = r.game;
        return r.ok ? { ok: true, scrap: r.scrap } : r;
      },
      onView,
    },
    win,
    inv.button,
  );
  win.open('craft');
  const scrim = document.querySelector<HTMLElement>('.camp-scrim')!;
  const q = <T extends HTMLElement>(sel: string) => scrim.querySelector<T>(sel)!;
  const go = () => q<HTMLButtonElement>('.craft-go');
  const range = () => q<HTMLInputElement>('.craft-range');
  const setAmount = (n: number) => {
    range().value = String(n);
    range().dispatchEvent(new Event('input', { bubbles: true }));
  };
  const odds = () =>
    Object.fromEntries(
      [...scrim.querySelectorAll<HTMLElement>('.craft-odd')].map((c) => [
        c.dataset.rarity!,
        c.querySelector('.craft-odd-pct')!.textContent,
      ]),
    );
  return {
    win,
    inv,
    tab,
    scrim,
    q,
    go,
    range,
    setAmount,
    odds,
    onView,
    game: () => g,
    setGame: (n: GameState) => {
      g = n;
      tab.refresh();
    },
    setCan: (c: boolean) => {
      can = c;
      tab.refresh();
    },
  };
}

describe('the Craft tab in the camp window', () => {
  it('is the third tab, after Weapons, and the strip is named by all three', () => {
    const m = mount(camp(100, { [A]: 1 }));
    const tabs = [...m.scrim.querySelectorAll('.camp-tab')].map((t) => t.textContent);
    expect(tabs).toEqual(['Weapons', 'Craft · 1']);
    const strip = m.scrim.querySelector('.camp-tabs')!;
    expect(strip.getAttribute('aria-label')).toBe('Weapons and Craft');
    expect(m.win.current()).toBe('craft');
    expect(m.scrim.querySelector('.camp-dialog')!.getAttribute('data-tab')).toBe('craft');
  });

  it('with the Roster the order is Roster, Weapons, Craft', () => {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const win = createCampWindow(root);
    const mk = (id: string) => {
      const button = document.createElement('button');
      win.add({
        id,
        label: id[0]!.toUpperCase() + id.slice(1),
        panel: document.createElement('div'),
        button,
        show: noop,
        hide: noop,
      });
    };
    mk('craft');
    mk('weapons');
    mk('roster');
    expect([...document.querySelectorAll('.camp-tab')].map((t) => t.textContent)).toEqual([
      'Roster',
      'Weapons',
      'Craft',
    ]);
    expect(document.querySelector('.camp-tabs')!.getAttribute('aria-label')).toBe(
      'Roster, Weapons and Craft',
    );
  });

  it('lists every blueprint with a count per gun type', () => {
    const m = mount(camp(100, { [A]: 3, [B]: 1 }));
    const rows = [...m.scrim.querySelectorAll<HTMLButtonElement>('.craft-bp')];
    expect(rows.map((r) => r.dataset.base)).toEqual([A, B]);
    expect(rows[0]!.textContent).toBe(`${WEAPONS[A].name}×3`);
    expect(rows[1]!.textContent).toBe(`${WEAPONS[B].name}×1`);
    expect(rows[0]!.getAttribute('aria-label')).toBe(`${WEAPONS[A].name} blueprint, 3 held`);
  });

  it('says so when there are none, with no crafting area', () => {
    const m = mount(camp(100, {}));
    expect(m.scrim.querySelector('.craft-empty')!.textContent).toBe(CRAFT_EMPTY);
    expect(m.scrim.querySelector('.craft-area')).toBeNull();
    expect(m.scrim.querySelector('.craft-bp')).toBeNull();
  });

  it('picking a blueprint opens its crafting area: gun type, Scrap amount, odds, Craft button', () => {
    const m = mount(camp(500, { [A]: 3, [B]: 1 }));
    m.q<HTMLButtonElement>(`.craft-bp[data-base="${B}"]`).click();
    expect(m.q('.craft-gun').textContent).toBe(`${WEAPONS[B].name} blueprint`);
    expect(m.q(`.craft-bp[data-base="${B}"]`).getAttribute('aria-pressed')).toBe('true');
    expect(m.q(`.craft-bp[data-base="${A}"]`).getAttribute('aria-pressed')).toBe('false');
    expect(m.q('.craft-sub').textContent).toContain('Lv 12');
    expect(m.range().min).toBe('20');
    expect(m.range().max).toBe('220');
    expect(m.range().step).toBe('20');
    expect(m.range().value).toBe('20');
    expect(m.q('.craft-amount').textContent).toBe('20 Scrap');
    expect(m.go().textContent).toBe(craftLabel(20));
    expect(m.go().disabled).toBe(false);
    expect(m.q('.craft-have').textContent).toBe('Scrap 500 · Stash 0/40');
  });

  it('shows the odds of each rarity for the amount, live as it changes', () => {
    const m = mount(camp(500, { [A]: 1 }));
    expect(m.odds()).toEqual({
      rusty: '30%',
      common: '45%',
      military: '20%',
      prototype: '5%',
      relic: '0%',
    });
    m.setAmount(120);
    expect(m.odds()).toEqual({
      rusty: '15%',
      common: '32.5%',
      military: '32.5%',
      prototype: '17.5%',
      relic: '2.5%',
    });
    expect(m.q('.craft-amount').textContent).toBe('120 Scrap');
    expect(m.go().textContent).toBe(craftLabel(120));
    m.setAmount(220);
    expect(m.odds()).toEqual({
      rusty: '0%',
      common: '20%',
      military: '45%',
      prototype: '30%',
      relic: '5%',
    });
    const cells = [...m.scrim.querySelectorAll<HTMLElement>('.craft-odd')];
    expect(cells.map((c) => c.querySelector('.craft-odd-name')!.textContent)).toEqual([
      'Rusty',
      'Common',
      'Military',
      'Prototype',
      'Relic',
    ]);
    expect(cells[0]!.dataset.zero).toBe('true');
    expect(cells[4]!.dataset.zero).toBe('false');
    // Every step on the slider shows exactly what the core says.
    for (let i = 0; i <= CRAFT.steps; i++) {
      const amount = CRAFT.min + CRAFT.step * i;
      m.setAmount(amount);
      const o = craftOdds(amount);
      expect(m.odds().military).toBe(percent(o.military));
    }
    expect(percent(32.5)).toBe('32.5%');
    expect(percent(20)).toBe('20%');
  });

  it('Craft makes the gun, uses the blueprint and Scrap, and shows the result at once', () => {
    const m = mount(camp(500, { [A]: 2 }));
    m.setAmount(120);
    m.go().click();
    const g = m.game();
    expect(g.armoury).toHaveLength(1);
    expect(g.stock.scrap).toBe(380);
    expect(g.craft!.blueprints[A]).toBe(1);
    const line = m.q('.craft-result-line');
    expect(line.textContent).toBe(craftedLine(g.armoury[0]!));
    expect(line.textContent).toMatch(/^Crafted: Lv 12 (Rusty|Common|Military|Prototype|Relic) /);
    expect(m.q('.craft-status').textContent).toBe(line.textContent);
    // The list shows the one left, the Scrap line the new balance.
    expect(m.q(`.craft-bp[data-base="${A}"]`).textContent).toBe(`${WEAPONS[A].name}×1`);
    expect(m.q('.craft-have').textContent).toBe('Scrap 380 · Stash 1/40');
    expect(document.activeElement).toBe(line);
  });

  it('"View in Weapons" opens the Weapons tab on the crafted gun', () => {
    const m = mount(camp(500, { [A]: 1 }));
    m.go().click();
    const uid = m.game().armoury[0]!.uid;
    m.q<HTMLButtonElement>('.craft-view').click();
    expect(m.onView).toHaveBeenCalledWith(uid);
    expect(m.win.current()).toBe('weapons');
    const picked = m.scrim.querySelector('.inv-slot[aria-pressed="true"]')!;
    expect(picked.getAttribute('data-key')).toBe(`stash:${uid}`);
  });

  it('the last blueprint used leaves the list, the result stays', () => {
    const m = mount(camp(500, { [A]: 1 }));
    m.go().click();
    expect(m.scrim.querySelector('.craft-bp')).toBeNull();
    expect(m.scrim.querySelector('.craft-area')).toBeNull();
    expect(m.q('.craft-result-line').textContent).toMatch(/^Crafted: /);
    expect(m.q('.craft-empty').textContent).toBe(CRAFT_EMPTY);
  });

  it('is greyed with the shortfall when Scrap is short, and a click crafts nothing', () => {
    const m = mount(camp(30, { [A]: 1 }));
    m.setAmount(100);
    expect(m.go().disabled).toBe(true);
    expect(m.go().textContent).toBe('Needs 70 more Scrap');
    expect(m.go().getAttribute('aria-label')).toBe(`${craftLabel(100)}. Needs 70 more Scrap`);
    m.go().click();
    expect(m.game().armoury).toHaveLength(0);
    m.setAmount(20);
    expect(m.go().disabled).toBe(false);
    expect(m.go().textContent).toBe(craftLabel(20));
  });

  it('is greyed with "Stash full" when the stash is full', () => {
    const m = mount(camp(500, { [A]: 1 }, STASH_CAP));
    expect(m.go().disabled).toBe(true);
    expect(m.go().textContent).toBe('Stash full');
    m.go().click();
    expect(m.game().armoury).toHaveLength(STASH_CAP);
    expect(m.game().craft!.blueprints[A]).toBe(1);
  });

  it('is greyed in a fight, saying where crafting works', () => {
    const m = mount(camp(500, { [A]: 1 }), false);
    expect(m.go().disabled).toBe(true);
    // The reason is up with the controls, in place of the "Makes a Lv…" line, not only below.
    expect(m.q('.craft-sub').textContent).toBe(CRAFT_WAIT);
    expect(m.q('.craft-area').contains(m.q('.craft-wait'))).toBe(true);
    expect(m.scrim.querySelector('.craft-note')).toBeNull();
    expect(m.q<HTMLButtonElement>('.craft-salvage').disabled).toBe(true);
    m.setCan(true);
    expect(m.q('.craft-sub').textContent).toMatch(/^Makes a Lv 12/);
    expect(m.go().disabled).toBe(false);
    expect(m.q<HTMLButtonElement>('.craft-salvage').disabled).toBe(false);
  });

  it('salvages a blueprint for a little Scrap, after the game’s own confirm', async () => {
    const m = mount(camp(10, { [A]: 2 }));
    const b = m.q<HTMLButtonElement>('.craft-salvage');
    expect(b.textContent).toBe(salvageLabel);
    expect(salvageLabel).toBe('Salvage for 5 Scrap');
    b.click();
    // Asked first; nothing has changed yet.
    expect(confirmQuestion()).toBe(`Salvage 1 ${WEAPONS[A].name} blueprint for 5 Scrap?`);
    expect(confirmQuestion()).toBe(salvageQuestion(WEAPONS[A].name));
    expect(confirmPanel()!.querySelector('.confirm-yes')!.textContent).toBe('Salvage');
    expect(confirmPanel()!.querySelector('.confirm-no')!.textContent).toBe('Keep');
    expect(m.game().stock.scrap).toBe(10);
    await answerConfirm(true);
    expect(m.game().stock.scrap).toBe(15);
    expect(m.game().craft!.blueprints[A]).toBe(1);
    expect(m.q('.craft-status').textContent).toBe(
      `Salvaged a ${WEAPONS[A].name} blueprint for 5 Scrap`,
    );
    expect(m.scrim.querySelector('.craft-result')).toBeNull();
  });

  it('Keep leaves the blueprint and the Scrap, and the keyboard on Salvage', async () => {
    const m = mount(camp(10, { [A]: 2 }));
    m.q<HTMLButtonElement>('.craft-salvage').click();
    await answerConfirm(false);
    expect(m.game().stock.scrap).toBe(10);
    expect(m.game().craft!.blueprints[A]).toBe(2);
    expect(confirmPanel()).toBeNull();
    expect(document.activeElement).toBe(m.q('.craft-salvage'));
  });

  it('Salvage is an outline button and Craft the one filled one', () => {
    const m = mount(camp(10, { [A]: 2 }));
    expect(m.q('.craft-salvage').classList.contains('hud-button')).toBe(false);
    expect(m.go().classList.contains('hud-button')).toBe(true);
  });

  it('names the ends of the slider', () => {
    const m = mount(camp(10, { [A]: 1 }));
    expect([...m.scrim.querySelectorAll('.craft-ends span')].map((x) => x.textContent)).toEqual([
      '20',
      '220',
    ]);
  });

  it('the tab label carries the blueprints held, and plain "Craft" with none', () => {
    const m = mount(camp(500, { [A]: 2, [B]: 1 }));
    const label = () => m.scrim.querySelector('#camp-tab-craft')!.textContent;
    expect(label()).toBe('Craft · 3');
    m.go().click();
    expect(label()).toBe('Craft · 2');
    m.setGame({ ...m.game(), craft: undefined });
    expect(label()).toBe('Craft');
    expect(craftTabLabel(0)).toBe('Craft');
    expect(craftTabLabel(7)).toBe('Craft · 7');
  });

  it('remembers the last amount for the session, over a close and a reopen', () => {
    const m = mount(camp(500, { [A]: 3 }));
    m.setAmount(140);
    m.win.close();
    m.win.open('craft');
    expect(m.range().value).toBe('140');
    expect(m.go().textContent).toBe(craftLabel(140));
  });

  it('after the last blueprint of a type is used, the next type’s area shows the result in place of its sub line', () => {
    const m = mount(camp(500, { [A]: 1, [B]: 2 }));
    m.go().click();
    const area = m.q('.craft-area');
    expect(area.querySelector('.craft-gun')!.textContent).toBe(`${WEAPONS[B].name} blueprint`);
    expect(area.querySelector('.craft-result-line')!.textContent).toMatch(/^Crafted: /);
    expect(area.querySelector('.craft-sub')).toBeNull();
    // Craft sits in the same area, after the slider and the odds.
    expect(area.contains(m.go())).toBe(true);
  });

  it('the Scrap and stash line is in the heading row, above the buttons', () => {
    const m = mount(camp(500, { [A]: 1 }));
    const head = m.q('.craft-headrow');
    expect(head.querySelector('.craft-have')).not.toBeNull();
    expect(head.compareDocumentPosition(m.go()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('re-reads the camp when it changes, keeping the amount and the pick', () => {
    const m = mount(camp(500, { [A]: 1, [B]: 1 }));
    m.q<HTMLButtonElement>(`.craft-bp[data-base="${B}"]`).click();
    m.setAmount(80);
    m.setGame({ ...m.game(), stock: { ...m.game().stock, scrap: 40 } });
    expect(m.q(`.craft-bp[data-base="${B}"]`).getAttribute('aria-pressed')).toBe('true');
    expect(m.range().value).toBe('80');
    expect(m.go().textContent).toBe('Needs 40 more Scrap');
  });

  it('puts blueprint text on the page as text, never markup', () => {
    const m = mount(camp(100, { [A]: 1 }));
    expect(m.scrim.querySelector('.craft-dialog script, .craft-dialog img[onerror]')).toBeNull();
    expect(m.scrim.querySelectorAll('.craft-dialog [onclick]').length).toBe(0);
  });
});

describe('the result panel shows a dropped blueprint with the loot (ID-209)', () => {
  const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);
  const g0 = (): GameState => camp(0, {});
  const won = (seed: number) => ({
    ...startSquadHorde(g0(), seed, NOW, 3),
    outcome: 'won' as const,
  });
  const withBp = SEEDS.find((s) => rollBlueprint(s) !== null)!;
  const without = SEEDS.find((s) => rollBlueprint(s) === null)!;

  it('has a "Blueprint: LMG" line in the win’s lines and on the drop tile', () => {
    const g = g0();
    const base = rollBlueprint(withBp)!;
    const screen = squadScreen(g, won(withBp));
    expect(screen.lines).toContain(`Blueprint: ${WEAPONS[base].name} · craft it in the Craft tab`);
    expect(screen.debrief!.drop!.blueprint).toBe(blueprintLine(base));
    const drop = squadResult(g, won(withBp)).drop as SquadDrop;
    expect(drop.blueprint).toBe(base);
    expect(squadDropLines(g, drop)).toContain(blueprintLine(base));
    expect(dropTile(g, drop).blueprint).toBe(blueprintLine(base));
  });

  it('is on the page under the weapon row, as text', () => {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
    h.showResult(squadScreen(g0(), won(withBp)));
    const p = root.querySelector('.debrief-guns .gun-blueprint')!;
    expect(p.textContent).toBe(blueprintLine(rollBlueprint(withBp)!));
    expect(p.children).toHaveLength(0);
  });

  it('has no such line with no blueprint', () => {
    const screen = squadScreen(g0(), won(without));
    expect(screen.lines.some((l) => l.startsWith('Blueprint'))).toBe(false);
    expect(screen.debrief!.drop!.blueprint).toBeUndefined();
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
    h.showResult(screen);
    expect(root.querySelector('.gun-blueprint')).toBeNull();
  });

  it('a loss shows none', () => {
    const g = g0();
    const lost = { ...startSquadHorde(g, withBp, NOW, 3), outcome: 'lost' as const };
    expect(squadScreen(g, lost).lines.some((l) => l.startsWith('Blueprint'))).toBe(false);
  });
});

describe('the result screen’s stash count after a craft (ID-209)', () => {
  const g = camp(0, {});
  const seed = Array.from({ length: 300 }, (_, i) => i + 1).find((x) => rollBlueprint(x) !== null)!;
  const h = { ...startSquadHorde(g, seed, NOW, 3), outcome: 'won' as const };

  it('stashNowText and withStashNow only change the count and the cap', () => {
    expect(stashNowText('Stash 15/40', 16, 50)).toBe('Stash 16/50');
    expect(stashNowText('Stash 40/40 · thrown away', 41, 50)).toBe('Stash 41/50 · thrown away');
    expect(stashNowText('Weapons', 1, 2)).toBe('Weapons');
    const screen = squadScreen(g, h);
    const next = withStashNow(screen, 9, 40);
    expect(next.debrief!.drop!.stash).toBe('Stash 9/40');
    expect(next.debrief!.drop!.guns).toBe(screen.debrief!.drop!.guns);
    expect(screen.debrief!.drop!.stash).not.toBe('Stash 9/40');
  });

  it('the shown tile, open or opened later, reads the new count', () => {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const hud = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
    hud.showResult(squadScreen(g, h));
    root.querySelector<HTMLButtonElement>('.gun-chip')!.click();
    expect(root.querySelector('.tile-stash')!.textContent).toMatch(/^Stash \d+\/40$/);
    hud.resultStash(7, 40);
    expect(root.querySelector('.tile-stash')!.textContent).toBe('Stash 7/40');
    // Closed and opened again: still the new count.
    root.querySelector<HTMLButtonElement>('.gun-chip')!.click();
    root.querySelector<HTMLButtonElement>('.gun-chip')!.click();
    expect(root.querySelector('.tile-stash')!.textContent).toBe('Stash 7/40');
  });
});

describe('a blueprint over the cap is not shown (ID-209)', () => {
  it('squadDrop has none when the type is at the cap, and the screen has no line', () => {
    const seed = Array.from({ length: 300 }, (_, i) => i + 1).find(
      (x) => rollBlueprint(x) !== null,
    )!;
    const base = rollBlueprint(seed)!;
    const g = camp(0, { [base]: BLUEPRINT.cap });
    const h = { ...startSquadHorde(g, seed, NOW, 3), outcome: 'won' as const };
    expect(squadResult(g, h).drop!.blueprint).toBeUndefined();
    expect(squadScreen(g, h).lines.some((l) => l.startsWith('Blueprint'))).toBe(false);
    expect(squadScreen(g, h).debrief!.drop!.blueprint).toBeUndefined();
    // One short of the cap it still drops, and is added.
    const g2 = camp(0, { [base]: BLUEPRINT.cap - 1 });
    expect(squadResult(g2, { ...h }).drop!.blueprint).toBe(base);
  });
});
