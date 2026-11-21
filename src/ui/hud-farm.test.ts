// @vitest-environment jsdom
// ID-098 Farming, UI half: the horde picker on the start and result screens, Squad Power
// against Recommended Power, the drop tile's kind, gun level wherever the gun shows, and
// the replay and loss result screens. Text reaches the page only through textContent.
import { describe, expect, it, vi } from 'vitest';
import { levelName, type OwnedWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import { FINALE_HORDE, RADIO_HORDES, SQUAD_CAP, STASH_CAP } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { joiners, squadResult, startSquadHorde, type SquadDrop } from '../core/hordeonly.ts';
import { noJoinText } from './joining.ts';
import { injuryBand, powerBand, recommendedPower, squadPower } from '../core/squadpower.ts';
import { horrorAbility, waveCount } from '../core/waves.ts';
import {
  BAND_WORD,
  createHud,
  EVACUATION_TITLE,
  DROP_KIND,
  dropTile,
  farmText,
  gunLabel,
  hordePicker,
  INJURY_LEAD,
  INJURY_TIP,
  INJURY_TONE,
  INJURY_WORD,
  PICKER_HORDES,
  levelLabel,
  lossXpText,
  powerLine,
  squadDropLines,
  squadScreen,
  squadStart,
  startLabel,
} from './hud.ts';

const NOW = 1_700_000_000_000;
const noop = (): void => {};

function squadGame(n: number, horde: number, stash: OwnedWeapon[] = []): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: horde,
    roster: Array.from({ length: n }, (_, i) => recruit(i + 1)),
    camp: { ...g.camp, recruits: n },
    armoury: stash,
  };
}
/** Horde `n` of `g` fought to `outcome` (a loss with `wave` reached). */
const fought = (g: GameState, n: number, outcome: 'won' | 'lost', wave = 1) => ({
  ...startSquadHorde(g, 1, NOW, n),
  outcome,
  wave,
});
const gun = (uid: string, level?: number): OwnedWeapon => ({
  uid,
  base: 'rifle',
  rarity: 'military',
  affixes: [{ id: 'damage', value: 7 }],
  ...(level === undefined ? {} : { level }),
});
const dropOf = (weapon: OwnedWeapon, extra: Partial<SquadDrop> = {}): SquadDrop => ({
  weapon,
  bonus: [],
  thrown: [],
  kind: 'first',
  upgrade: true,
  noUpgrades: false,
  farmFrom: null,
  ...extra,
});

function page() {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
  const picks: number[] = [];
  h.onHordePick((n) => picks.push(n));
  const button = () => root.querySelector<HTMLButtonElement>('.hud-start-row > .hud-button')!;
  const select = () => root.querySelector<HTMLSelectElement>('#hud-horde-select')!;
  const title = () => root.querySelector('.hud-result-title')!.textContent;
  const choose = (n: number) => {
    const s = select();
    s.value = String(n);
    s.dispatchEvent(new Event('change', { bubbles: true }));
  };
  return { root, h, picks, button, select, title, choose };
}

describe('Squad Power line (ID-098)', () => {
  it('shows both numbers with thousands separators, and the band as green, amber or red', () => {
    expect(powerLine(1240, 1400).text).toBe('Power 1,240 · rec 1,400');
    expect(powerLine(1400, 1400).band).toBe('ok');
    expect(powerLine(1190, 1400).band).toBe('close');
    expect(powerLine(1189, 1400).band).toBe('short');
    expect(BAND_WORD).toEqual({ ok: 'ok', close: 'close', short: 'short' });
  });

  it('fills the meter to Squad Power with its end at 120% of Recommended, the tick at Recommended', () => {
    const l = powerLine(840, 1400);
    expect(l.fill).toBeCloseTo(0.5);
    expect(l.tick).toBeCloseTo(1 / 1.2);
    // Past the end the fill stops at the end.
    expect(powerLine(9999, 1400).fill).toBe(1);
    expect(powerLine(0, 1400).fill).toBe(0);
  });
});

describe('the horde picker (ID-098)', () => {
  it('lists the next new horde first, labelled new, then every beaten horde, highest first', () => {
    const g = squadGame(2, 6);
    const p = hordePicker(g);
    expect(p.options.map((o) => o.horde)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(p.options.map((o) => o.isNew)).toEqual([true, false, false, false, false, false]);
    expect(p.value).toBe(6);
    expect(p.options[0]!.label).toMatch(/^Horde 6 \(new\)/);
  });

  it('lists at most PICKER_HORDES: the new horde and the highest beaten, however high', () => {
    const g = squadGame(2, 100_000);
    const p = hordePicker(g, 3);
    expect(p.options).toHaveLength(PICKER_HORDES);
    expect(p.options[0]!.horde).toBe(100_000);
    expect(p.options.at(-1)!.horde).toBe(100_000 - PICKER_HORDES + 1);
    // A pick off the list falls back to the new horde.
    expect(p.value).toBe(100_000);
  });

  it('each option names the number and a boss mark, and nothing of power: that is the line beside it (ID-196)', () => {
    const g = squadGame(2, 12);
    const p = hordePicker(g);
    const power = squadPower(g);
    for (const o of p.options) {
      const rec = recommendedPower(o.horde);
      expect(o.label).toMatch(new RegExp(`^Horde ${o.horde}\\b`));
      expect(o.label).not.toMatch(/rec/i);
      expect(o.label).not.toContain(rec.toLocaleString('en-US'));
      for (const word of Object.values(BAND_WORD)) expect(o.label.split(' · ')).not.toContain(word);
      expect(o.label.includes(' · Boss')).toBe(horrorAbility(o.horde) !== null);
      expect(o.power).toEqual(powerLine(power, rec));
    }
    expect(p.options.some((o) => o.label.includes(' · Boss'))).toBe(true);
    expect(p.options[0]!.label).toBe('Horde 12 (new)');
    expect(p.options.find((o) => o.horde === 10)!.label).toMatch(/^Horde 10 · Boss/);
  });

  it('the button follows the pick: Start for the new horde, Replay for a beaten one, Retry for the lost one', () => {
    const g = squadGame(1, 10);
    const p = hordePicker(g, 10, 4);
    const by = (n: number) => p.options.find((o) => o.horde === n)!.button;
    // No boss suffix: the option beside the button says "Boss", and the start screen's pill.
    expect(by(10)).toBe('Start Horde 10');
    expect(by(5)).toBe('Replay Horde 5');
    expect(by(4)).toBe('Retry Horde 4');
    expect(hordePicker(g, 10).options.find((o) => o.horde === 4)!.button).toBe('Replay Horde 4');
    const late = hordePicker(squadGame(1, 12), 12, 10);
    expect(late.options.find((o) => o.horde === 10)!.button).toBe('Retry Horde 10');
    expect(hordePicker(squadGame(1, 12)).options.find((o) => o.horde === 10)!.button).toBe(
      'Replay Horde 10',
    );
  });

  it('a boss replay says "Boss horde" and "Replay" once, as chips: not in the title or the button', () => {
    const s = squadStart(squadGame(2, 12), 10);
    expect(s.title).toBe('Horde 10');
    expect(s.button).toBe('Replay Horde 10');
    const chips = s.debrief!.chips.map((c) => c.text);
    expect(chips.filter((c) => c === 'Boss horde')).toHaveLength(1);
    expect(chips.filter((c) => c === 'Replay')).toHaveLength(1);
  });

  it('never blocks a start: a pick that is not open falls back to the new horde; Horde 1 is just the new horde', () => {
    const g = squadGame(1, 4);
    for (const bad of [0, -1, 5, 2.5, Number.NaN]) expect(hordePicker(g, bad).value).toBe(4);
    expect(hordePicker(g, 2).value).toBe(2);
    const first = hordePicker(squadGame(1, 1));
    expect(first.options.map((o) => o.horde)).toEqual([1]);
    expect(first.options[0]!.isNew).toBe(true);
  });
});

describe('the start screen (ID-098)', () => {
  it('opens on the next new horde, the picker beside Start', () => {
    const g = squadGame(2, 5);
    const s = squadStart(g);
    expect(s.title).toBe('Horde 5');
    expect(s.button).toBe(startLabel(5));
    expect(s.picker!.value).toBe(5);
    expect(s.picker!.retitle).toBe(true);
    expect(s.debrief!.chips.map((c) => c.text)).toContain(`${waveCount(5)} waves`);
  });

  it('a picked beaten horde makes it a replay: its title, waves, button', () => {
    const g = squadGame(2, 5);
    const s = squadStart(g, 3);
    expect(s.title).toBe('Horde 3');
    expect(s.button).toBe('Replay Horde 3');
    expect(s.picker!.value).toBe(3);
    expect(s.debrief!.chips.map((c) => c.text)).toEqual(
      expect.arrayContaining(['Replay', `${waveCount(3)} waves`, `Squad 2/${SQUAD_CAP}`]),
    );
    expect(s.lines.join(' ')).toContain(`${waveCount(3)} waves`);
  });

  it('on the page: the select lists every option, the Power line follows the pick, and Start is relabelled', () => {
    const { root, h, picks, button, select, title, choose } = page();
    const g = squadGame(2, 5);
    h.showResult(squadStart(g));
    expect([...select().options].map((o) => o.textContent)).toEqual(
      hordePicker(g).options.map((o) => o.label),
    );
    expect(select().value).toBe('5');
    expect(button().textContent).toBe(startLabel(5));
    expect(select().classList.contains('build-select')).toBe(true);
    expect(root.querySelector('label[for="hud-horde-select"]')).not.toBeNull();
    const line = () => root.querySelector<HTMLElement>('.hud-horde-power')!;
    const power = squadPower(g);
    expect(line().querySelector('.hud-horde-power-text')!.textContent).toBe(
      powerLine(power, recommendedPower(5)).text,
    );
    expect(line().dataset.band).toBe(powerBand(power, recommendedPower(5)));
    expect(line().querySelector('.hud-horde-band')!.textContent).toBe(
      BAND_WORD[powerBand(power, recommendedPower(5))],
    );
    choose(2);
    expect(picks).toEqual([2]);
    expect(button().textContent).toBe('Replay Horde 2');
    // "Replay" is the chip's to say, not the title's.
    expect(title()).toBe('Horde 2');
    expect(root.querySelector('.debrief-stats')!.textContent).toContain('Replay');
    // The campaign has no goal chip (ID-196): the radio is not on this panel.
    expect(root.querySelector('.debrief-stats')!.textContent).not.toMatch(/radio/i);
    expect(line().querySelector('.hud-horde-power-text')!.textContent).toBe(
      powerLine(power, recommendedPower(2)).text,
    );
    expect(button().disabled).toBe(false);
    choose(5);
    expect(button().textContent).toBe(startLabel(5));
    expect(picks).toEqual([2, 5]);
  });

  it('Endless: its goal stat stays first whichever horde is picked (ID-127)', () => {
    const { root, h, choose } = page();
    const g = squadGame(2, 45);
    h.showResult(squadStart(g));
    const first = () => root.querySelector('.debrief-stats')!.firstElementChild!.textContent;
    expect(first()).toBe('Endless · best 44');
    choose(5);
    expect(first()).toBe('Endless · best 44');
    expect(squadStart(g, 5).debrief!.chips[0]!.text).toBe('Endless · best 44');
  });

  it('even a horde the squad is far short of can be picked and started', () => {
    const { h, button, choose, root } = page();
    const g = squadGame(1, 30);
    h.showResult(squadStart(g));
    choose(30);
    expect(root.querySelector<HTMLElement>('.hud-horde-power')!.dataset.band).toBe('short');
    expect(button().disabled).toBe(false);
    expect(root.querySelector<HTMLSelectElement>('#hud-horde-select')!.disabled).toBe(false);
  });

  it('showPicker redraws the bands for the squad as it stands, keeping the pick and the button', () => {
    const { h, button, select, root } = page();
    const g = squadGame(1, 6);
    h.showResult(squadStart(g, 4));
    expect(select().value).toBe('4');
    const stronger = { ...g, roster: [...g.roster, recruit(2), recruit(3)] };
    select().focus();
    h.showPicker(hordePicker(stronger, 4, null, true));
    expect(select().value).toBe('4');
    // The same select takes the keyboard back.
    expect(document.activeElement).toBe(select());
    expect(root.querySelector('.hud-horde-power-text')!.textContent).toBe(
      powerLine(squadPower(stronger), recommendedPower(4)).text,
    );
    expect(button().textContent).toBe('Replay Horde 4');
  });

  it('a screen with no picker hides it', () => {
    const { h, root } = page();
    h.showResult(squadStart(squadGame(1, 2)));
    expect(root.querySelector<HTMLElement>('.hud-horde-pick')!.hidden).toBe(false);
    h.showResult({ ...squadStart(squadGame(1, 2)), picker: undefined });
    expect(root.querySelector<HTMLElement>('.hud-horde-pick')!.hidden).toBe(true);
  });
});

describe('result screens and the picker (ID-098)', () => {
  it('a first clear: the picker starts on the next new horde', () => {
    const g = squadGame(2, 4);
    const s = squadScreen(g, fought(g, 4, 'won'));
    expect(s.picker!.value).toBe(5);
    expect(s.picker!.options.map((o) => o.horde)).toEqual([5, 4, 3, 2, 1]);
    expect(s.picker!.retitle).toBe(false);
    expect(s.button).toBe(startLabel(5));
  });

  it('a replay win: the same replay horde, titled as a replay, nobody joins, a Replay chip', () => {
    const g = squadGame(2, 6);
    const s = squadScreen(g, fought(g, 3, 'won'));
    expect(s.title).toBe('Horde 3 - You hold the line (replay)');
    expect(s.picker!.value).toBe(3);
    expect(s.picker!.options[0]!.horde).toBe(6);
    expect(s.button).toBe('Replay Horde 3');
    expect(s.lines.join('\n')).not.toMatch(/New survivor|nobody new joins|Squad full/);
    // A replay where nobody joins says why, last in the details (ID-182, ID-196).
    expect(s.debrief!.join).toBe(true);
    expect(s.debrief!.notes!.at(-1)).toBe(noJoinText('nobody-replay', 2));
    expect(s.debrief!.cards).toHaveLength(2);
    // "Replay" is said by the title and the tile's kind chip, not a third time.
    expect(s.debrief!.chips.map((c) => c.text)).not.toContain('Replay');
    expect(s.debrief!.drop).not.toBeNull();
    expect(s.debrief!.drop!.guns[0]!.lines[0]).toMatch(/^Replay · /);
  });

  it('a lucky replay win (ID-170): the newcomer asks to join, with the offer tile', () => {
    const g = squadGame(2, 6);
    let seed = 1;
    while (joiners(g, seed, true).length === 0) seed++;
    const s = squadScreen(g, { ...startSquadHorde(g, seed, NOW, 3), outcome: 'won' as const });
    const d = recruit(3, seed);
    expect(s.title).toBe('Horde 3 - You hold the line (replay)');
    expect(d.name).toBeTruthy();
    expect(s.lines.join(' ')).not.toMatch(/asks to join/);
    expect(s.debrief!.join).toBe(true);
    expect(s.debrief!.notes!.join(' ')).not.toMatch(/Nobody new/);
  });

  it('the ending screen and radio parts are only for first clears, not replays (ID-127)', () => {
    const first = squadGame(SQUAD_CAP, FINALE_HORDE);
    const a = squadScreen(first, fought(first, FINALE_HORDE, 'won'));
    expect(a.title).toBe(EVACUATION_TITLE);
    expect(a.button).toBe('Continue');
    for (const n of RADIO_HORDES) {
      const later = squadGame(SQUAD_CAP, FINALE_HORDE + 3);
      const b = squadScreen(later, fought(later, n, 'won'));
      expect(b.title).toBe(`Horde ${n} - You hold the line (replay)`);
      expect(b.button).not.toBe('Continue');
      expect(b.lines.join(' ')).not.toMatch(/Radio|evacuation|New card/);
      expect(b.debrief!.chips.map((c) => c.text).join(' ')).not.toMatch(/Radio/);
      // Only why nobody asked to join is left in the details.
      expect(b.debrief!.notes!.join(' ')).not.toMatch(/Boss horde|evacuation|New card|radio/i);
    }
  });

  it('a loss: the same horde is picked, the button says Retry, and the loss pays its small XP', () => {
    const g = squadGame(3, 6);
    const lost = fought(g, 6, 'lost', 3);
    const s = squadScreen(g, lost);
    expect(s.picker!.value).toBe(6);
    expect(s.button).toBe('Retry Horde 6');
    const xp = squadResult(g, lost).gains[0]!.xp;
    expect(xp).toBeGreaterThan(0);
    expect(s.debrief!.chips[0]).toEqual({ text: `+${xp} XP each`, tone: 'warn' });
    expect(s.lines).toContain(`+${xp} XP each`);
    expect(s.lines.join('\n')).not.toContain('No XP on a loss');
    // Every survivor still has a card (ID-196: it shows no XP, the chip says it).
    expect(s.debrief!.cards.map((c) => c.id)).toEqual(g.roster.map((d) => d.id));
    expect(s.debrief!.drop).toBeNull();
    expect(s.lines.join('\n')).not.toMatch(/New survivor/);
  });

  it('a loss with no wave cleared pays nothing, and says so sensibly', () => {
    const g = squadGame(2, 6);
    const s = squadScreen(g, fought(g, 6, 'lost', 1));
    expect(lossXpText(0)).toBe('No XP: no wave cleared');
    expect(s.debrief!.chips[0]!.text).toBe('No XP: no wave cleared');
    expect(s.debrief!.cards).toHaveLength(2);
  });

  it('a loss retried from a beaten horde keeps that horde picked and labelled Retry', () => {
    const g = squadGame(2, 9);
    const s = squadScreen(g, fought(g, 5, 'lost', 2));
    expect(s.picker!.value).toBe(5);
    expect(s.button).toBe('Retry Horde 5');
    expect(s.picker!.options.find((o) => o.horde === 9)!.button).toBe(startLabel(9));
  });

  it('on the page after a loss: pick an easier horde and the button says Replay', () => {
    const { h, button, choose, select } = page();
    const g = squadGame(2, 6);
    h.showResult(squadScreen(g, fought(g, 6, 'lost', 3)));
    expect(select().value).toBe('6');
    expect(button().textContent).toMatch(/^Retry Horde 6/);
    choose(2);
    expect(button().textContent).toBe('Replay Horde 2');
    choose(6);
    expect(button().textContent).toMatch(/^Retry Horde 6/);
  });
});

describe('the farm hint and the result panel scroll (ID-098)', () => {
  it('marks the highest beaten horde at ok as best to farm, only when the new horde is not ok', () => {
    const g = squadGame(2, 12);
    const p = hordePicker(g);
    const power = squadPower(g);
    const ok = p.options.filter((o) => o.power.band === 'ok').map((o) => o.horde);
    expect(p.options[0]!.power.band).not.toBe('ok');
    expect(p.farm).toBe(Math.max(...ok));
    for (const o of p.options) {
      expect(o.label.endsWith(' · best to farm')).toBe(o.horde === p.farm);
      expect(o.hint).toBe(o.power.band === 'ok' ? null : `Try Horde ${p.farm} to farm`);
    }
    expect(power).toBeGreaterThan(0);
    // A squad that out-powers the new horde has no farm mark.
    const strong = hordePicker(squadGame(6, 1));
    expect(strong.farm).toBeNull();
  });

  it('says so when no beaten horde is at the squad’s power', () => {
    const g = { ...squadGame(1, 40), roster: [] };
    const p = hordePicker(g);
    expect(p.farm).toBeNull();
    expect(p.options.every((o) => o.hint === 'No beaten horde is at your power yet')).toBe(true);
  });

  it('on the page the hint sits under the Power line and follows the pick', () => {
    const { h, root, choose } = page();
    const g = squadGame(2, 12);
    const p = hordePicker(g);
    h.showResult(squadStart(g));
    const hint = () => root.querySelector<HTMLElement>('.hud-horde-hint')!;
    expect(hint().textContent).toBe(p.options[0]!.hint);
    choose(p.farm!);
    expect(hint().hidden).toBe(true);
  });

  it('a result screen opens with its panel at the top: the footer button takes focus without scrolling', () => {
    const { h, root } = page();
    const g = squadGame(2, 6);
    const spy = vi.spyOn(HTMLElement.prototype, 'focus');
    h.showResult(squadScreen(g, fought(g, 3, 'won')));
    const calls = spy.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every(([o]) => o?.preventScroll === true)).toBe(true);
    expect(root.querySelector<HTMLElement>('.hud-result')!.scrollTop).toBe(0);
    expect(root.querySelector<HTMLElement>('.hud-result-scroll')!.scrollTop).toBe(0);
    spy.mockRestore();
  });
});

describe('drop tile: kind, farm note and level (ID-098, ID-196)', () => {
  it('says which kind of drop it was, on the first line of the gun’s details', () => {
    const w = gun('a', 5);
    expect(DROP_KIND).toEqual({
      first: 'First clear',
      replay: 'Replay',
      guaranteed: 'Guaranteed upgrade',
    });
    for (const kind of ['first', 'replay', 'guaranteed'] as const) {
      const t = dropTile({ armoury: [] }, dropOf(w, { kind }));
      expect(t.guns[0]!.lines[0]).toBe(`${DROP_KIND[kind]} · Military`);
    }
  });

  it('the kind is not on the chip: the chip is the level, the gun and its DPS', () => {
    const { h, root } = page();
    const g = squadGame(2, 6);
    h.showResult(squadScreen(g, fought(g, 6, 'won')));
    const chip = root.querySelector<HTMLElement>('.gun-chip')!;
    expect(chip.textContent).not.toMatch(/First clear|Replay|Guaranteed|bonus/i);
    expect(chip.querySelector('.tile-kind, .tile-bonus')).toBeNull();
    // Opened, the details say it.
    chip.click();
    expect(root.querySelector('#hud-gun-details')!.textContent).toContain('First clear');
  });

  it('says to farm a higher horde when nothing it drops could be an upgrade', () => {
    const w = gun('a', 2);
    const t = dropTile({ armoury: [] }, dropOf(w, { kind: 'replay', noUpgrades: true }));
    expect(t.farmNote).toBe('Beat a new horde for upgrades');
    const from = dropTile(
      { armoury: [] },
      dropOf(w, { kind: 'replay', noUpgrades: true, farmFrom: 9 }),
    );
    expect(from.farmNote).toBe('Farm Horde 9+ for upgrades');
    expect(farmText(9)).toBe('Farm Horde 9+ for upgrades');
    expect(dropTile({ armoury: [] }, dropOf(w, { kind: 'replay' })).farmNote).toBeNull();
    expect(
      squadDropLines({ armoury: [] }, dropOf(w, { kind: 'replay', noUpgrades: true })),
    ).toContain(farmText(null));
  });

  it('on the page: the chip has the level before the name, the details the farm note', () => {
    const { h, root } = page();
    const g = squadGame(2, 6);
    h.showResult(squadScreen(g, fought(g, 3, 'won')));
    const drop = squadScreen(g, fought(g, 3, 'won')).debrief!.drop!;
    const chip = root.querySelector<HTMLElement>('.gun-chip')!;
    expect(chip.querySelector('.gun-chip-name')!.textContent).toBe(drop.guns[0]!.short);
    expect(drop.guns[0]!.short).toMatch(/^Lv 3 /);
    expect(root.querySelector('.tile-farm')).toBeNull();
    chip.click();
    expect(root.querySelector('.tile-farm')?.textContent ?? null).toBe(drop.farmNote);
  });

  it('a first clear’s details and lines say First clear', () => {
    const g = squadGame(2, 4);
    const s = squadScreen(g, fought(g, 4, 'won'));
    expect(s.debrief!.drop!.guns[0]!.lines[0]).toMatch(/^First clear · /);
    expect(s.lines.some((l) => l.startsWith('Weapon drop (First clear): '))).toBe(true);
  });
});

describe('gun level wherever the gun shows (ID-098)', () => {
  it('"Lv 12 Military Carbine" in the label and the drop line; the free pistol is Lv 1', () => {
    const w = gun('a', 12);
    expect(levelName(w)).toBe('Lv 12 Military Carbine');
    expect(levelLabel(w)).toBe('Lv 12 Military Carbine (+7% damage)');
    expect(gunLabel(w)).toMatch(/^Lv 12 Military Carbine \(\+7% damage\) · [\d.]+ DPS$/);
    expect(levelLabel('pistol')).toBe('Lv 1 Pistol');
    expect(levelLabel(gun('b'))).toBe('Lv 1 Military Carbine (+7% damage)');
  });

  it('a thrown-away gun is named with its level', () => {
    const w = gun('a', 7);
    const thrown = gun('t', 3);
    const full = { armoury: [thrown, ...Array.from({ length: STASH_CAP - 1 }, () => w)] };
    const t = dropTile(full, dropOf(w, { thrown: [thrown] }));
    expect(t.thrown).toBe('Thrown away: Lv 3 Military Carbine · salvaged for 25 Scrap');
    const lines = squadDropLines(full, dropOf(w, { thrown: [thrown] }));
    expect(lines.some((l) => l.includes('Lv 3 Military Carbine (+7% damage)'))).toBe(true);
  });
});

describe('text only (ID-098)', () => {
  it('puts the picker, the Power line and the tile on the page as text nodes, no markup', () => {
    const { h, root } = page();
    const g = squadGame(2, 6);
    h.showResult(squadScreen(g, fought(g, 3, 'won')));
    for (const node of root.querySelectorAll('.hud-horde-pick, .debrief-guns, .hud-corner')) {
      expect(node.querySelector('script, iframe, style')).toBeNull();
    }
  });
});

describe('the injury band beside the power band (ID-155)', () => {
  it('says how many a win is likely to cost, follows the pick, and never blocks a start', () => {
    const { root, h, button, choose } = page();
    const g = squadGame(6, 12);
    h.showResult(squadStart(g));
    const line = () => root.querySelector<HTMLElement>('.hud-horde-injury')!;
    const power = squadPower(g);
    const expectBand = (n: number) => {
      const band = injuryBand(power, recommendedPower(n));
      expect(line().textContent).toBe(`${INJURY_LEAD} ${INJURY_WORD[band]}`);
      expect(line().querySelector('.hud-horde-band')!.textContent).toBe(INJURY_WORD[band]);
      expect(line().dataset.band).toBe(INJURY_TONE[band]);
      expect(line().querySelector<HTMLElement>('.hud-horde-band')!.title).toBe(INJURY_TIP[band]);
      expect(hordePicker(g).options.find((o) => o.horde === n)!.injury).toBe(band);
    };
    expectBand(12);
    choose(1);
    // Horde 1 is far under this squad: few.
    expect(injuryBand(power, recommendedPower(1))).toBe('few');
    expectBand(1);
    choose(12);
    expectBand(12);
    expect(button().disabled).toBe(false);
  });

  it('a squad far short reads heavy, in words and the short band’s colour', () => {
    const { root, h, choose } = page();
    h.showResult(squadStart(squadGame(1, 30)));
    choose(30);
    const line = root.querySelector<HTMLElement>('.hud-horde-injury')!;
    expect(line.textContent).toBe(`${INJURY_LEAD} ${INJURY_WORD.heavy}`);
    expect(line.dataset.band).toBe('short');
  });

  it('the words say the result, not few, some or heavy (ID-184)', () => {
    expect(INJURY_LEAD).toBe('Win cost:');
    expect(INJURY_WORD).toEqual({
      few: 'nobody down',
      some: '~1 down',
      heavy: '1+ down',
    });
    expect(INJURY_TONE).toEqual({ few: 'ok', some: 'close', heavy: 'short' });
  });
});
