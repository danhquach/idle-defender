// @vitest-environment jsdom
// ID-098 Farming, UI half: the horde picker on the start and result screens, Squad Power
// against Recommended Power, the drop tile's kind, gun level wherever the gun shows, and
// the replay and loss result screens. Text reaches the page only through textContent.
import { describe, expect, it, vi } from 'vitest';
import { levelName, type OwnedWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import { ENDING_HORDE, SQUAD_CAP } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { startSquadHorde, type SquadDrop } from '../core/hordeonly.ts';
import { powerBand, recommendedPower, squadPower } from '../core/squadpower.ts';
import { horrorAbility, waveCount } from '../core/waves.ts';
import {
  BAND_WORD,
  createHud,
  DROP_KIND,
  dropTile,
  farmText,
  gunLabel,
  gunOption,
  hordePicker,
  PICKER_HORDES,
  levelLabel,
  lossXpText,
  powerLine,
  squadDropLines,
  squadGear,
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
  thrown: null,
  kind: 'first',
  upgrade: true,
  noUpgrades: false,
  farmFrom: null,
  ...extra,
});

function page() {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
  const picks: number[] = [];
  h.onHordePick((n) => picks.push(n));
  const button = () => root.querySelector<HTMLButtonElement>('.hud-result-foot > .hud-button')!;
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
    expect(p.options[0]!.label).toMatch(/^Horde 6 \(new\) · /);
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

  it('each option names the number, a boss mark, rec power and the band word', () => {
    const g = squadGame(2, 12);
    const p = hordePicker(g);
    const power = squadPower(g);
    for (const o of p.options) {
      const rec = recommendedPower(o.horde);
      expect(o.label).toContain(`Horde ${o.horde}`);
      expect(o.label).toContain(`rec ${rec.toLocaleString('en-US')}`);
      expect(
        o.label.replace(' · best to farm', '').endsWith(` · ${BAND_WORD[powerBand(power, rec)]}`),
      ).toBe(true);
      expect(o.label.includes(' · Boss')).toBe(horrorAbility(o.horde) !== null);
      expect(o.power).toEqual(powerLine(power, rec));
    }
    expect(p.options.some((o) => o.label.includes(' · Boss'))).toBe(true);
  });

  it('the button follows the pick: Start for the new horde, Replay for a beaten one, Retry for the lost one', () => {
    const g = squadGame(1, 10);
    const p = hordePicker(g, 10, 4);
    const by = (n: number) => p.options.find((o) => o.horde === n)!.button;
    expect(by(10)).toBe(startLabel(10));
    expect(by(10)).toBe('Start Horde 10 · Boss horde');
    expect(by(5)).toBe('Replay Horde 5');
    expect(by(4)).toBe('Retry Horde 4');
    expect(hordePicker(g, 10).options.find((o) => o.horde === 4)!.button).toBe('Replay Horde 4');
    // A boss horde keeps the suffix, replayed or retried.
    const boss = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((n) => horrorAbility(n) !== null);
    if (boss !== undefined) {
      expect(by(boss)).toBe(`Replay Horde ${boss} · Boss horde`);
    }
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
    expect(s.title).toBe(`Horde 5${horrorAbility(5) ? ' · Boss horde' : ''}`);
    expect(s.button).toBe(startLabel(5));
    expect(s.picker!.value).toBe(5);
    expect(s.picker!.retitle).toBe(true);
    expect(s.debrief!.chips.map((c) => c.text)).toContain(`${waveCount(5)} waves`);
  });

  it('a picked beaten horde makes it a replay: its title, waves, button', () => {
    const g = squadGame(2, 5);
    const s = squadStart(g, 3);
    expect(s.title).toBe(`Horde 3${horrorAbility(3) ? ' · Boss horde' : ''} · Replay`);
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
    expect(title()).toContain('Horde 2');
    expect(title()).toContain('Replay');
    expect(root.querySelector('.debrief-chips')!.textContent).toContain('Replay');
    expect(line().querySelector('.hud-horde-power-text')!.textContent).toBe(
      powerLine(power, recommendedPower(2)).text,
    );
    expect(button().disabled).toBe(false);
    choose(5);
    expect(button().textContent).toBe(startLabel(5));
    expect(picks).toEqual([2, 5]);
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
    expect(s.title).toBe('Horde 3 held (replay)');
    expect(s.picker!.value).toBe(3);
    expect(s.picker!.options[0]!.horde).toBe(6);
    expect(s.button).toBe('Replay Horde 3');
    expect(s.lines.join('\n')).not.toMatch(/New survivor|nobody new joins|Squad full/);
    expect(s.debrief!.recruit).toBeNull();
    expect(s.debrief!.cards.some((c) => c.joining)).toBe(false);
    expect(s.debrief!.cards).toHaveLength(2);
    // "Replay" is said by the title and the tile's kind chip, not a third time.
    expect(s.debrief!.chips.map((c) => c.text)).not.toContain('Replay');
    expect(s.debrief!.drop).not.toBeNull();
    expect(s.debrief!.drop!.kind).toBe('Replay');
  });

  it('the ending screen is only for the first clear of the ending horde, not its replays', () => {
    const first = squadGame(SQUAD_CAP, ENDING_HORDE);
    const a = squadScreen(first, fought(first, ENDING_HORDE, 'won'));
    expect(a.title).toBe(`You held Horde ${ENDING_HORDE}`);
    expect(a.button).toBe('Continue');
    const later = squadGame(SQUAD_CAP, ENDING_HORDE + 3);
    const b = squadScreen(later, fought(later, ENDING_HORDE, 'won'));
    expect(b.title).toBe(`Horde ${ENDING_HORDE} held (replay)`);
    expect(b.button).not.toBe('Continue');
    expect(b.lines.join(' ')).not.toMatch(/The end, for now/);
    expect(b.debrief!.note).toBeNull();
  });

  it('a loss: the same horde is picked, the button says Retry, and the loss pays its small XP', () => {
    const g = squadGame(3, 6);
    const lost = fought(g, 6, 'lost', 3);
    const s = squadScreen(g, lost);
    expect(s.picker!.value).toBe(6);
    expect(s.button).toBe(`Retry Horde 6${horrorAbility(6) ? ' · Boss horde' : ''}`);
    const xp = s.debrief!.cards[0]!.xp!;
    expect(xp).toBeGreaterThan(0);
    expect(s.debrief!.chips[0]).toEqual({ text: `+${xp} XP each`, tone: 'warn' });
    expect(s.lines).toContain(`+${xp} XP each`);
    expect(s.lines.join('\n')).not.toContain('No XP on a loss');
    // Every card shows the XP the loss gave, and its bar.
    expect(s.debrief!.cards.map((c) => c.xp)).toEqual([xp, xp, xp]);
    expect(s.debrief!.cards.every((c) => c.bar !== null)).toBe(true);
    expect(s.debrief!.drop).toBeNull();
    expect(s.debrief!.recruit).toBeNull();
    expect(s.lines.join('\n')).not.toMatch(/New survivor/);
  });

  it('a loss with no wave cleared pays nothing, and says so sensibly', () => {
    const g = squadGame(2, 6);
    const s = squadScreen(g, fought(g, 6, 'lost', 1));
    expect(lossXpText(0)).toBe('No XP: no wave cleared');
    expect(s.debrief!.chips[0]!.text).toBe('No XP: no wave cleared');
    expect(s.debrief!.cards.every((c) => c.xp === null && c.bar === null)).toBe(true);
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
    spy.mockRestore();
  });
});

describe('drop tile: kind, farm note and level (ID-098)', () => {
  it('the kind is a chip: a guaranteed upgrade is highlighted, a first clear milder', () => {
    const w = gun('a', 5);
    const tone = (kind: SquadDrop['kind']) =>
      dropTile({ armoury: [] }, dropOf(w, { kind })).kindTone;
    expect(tone('guaranteed')).toBe('warn');
    expect(tone('first')).toBe('ok');
    expect(tone('replay')).toBe('plain');
    const { h, root } = page();
    const g = squadGame(2, 6);
    h.showResult(squadScreen(g, fought(g, 6, 'won')));
    expect(root.querySelector<HTMLElement>('.tile-kind')!.dataset.tone).toBe('ok');
  });

  it('says which kind of drop it was', () => {
    const w = gun('a', 5);
    expect(DROP_KIND).toEqual({
      first: 'First clear',
      replay: 'Replay',
      guaranteed: 'Guaranteed upgrade',
    });
    for (const kind of ['first', 'replay', 'guaranteed'] as const) {
      expect(dropTile({ armoury: [] }, dropOf(w, { kind })).kind).toBe(DROP_KIND[kind]);
    }
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

  it('on the page: kind line, level before the name, and the farm note', () => {
    const { h, root } = page();
    const g = squadGame(2, 6);
    h.showResult(squadScreen(g, fought(g, 3, 'won')));
    const tile = root.querySelector<HTMLElement>('.tile-drop')!;
    expect(tile.querySelector('.tile-kind')!.textContent).toBe('Replay');
    expect(tile.querySelector<HTMLElement>('.tile-kind')!.classList.contains('chip')).toBe(true);
    const drop = squadScreen(g, fought(g, 3, 'won')).debrief!.drop!;
    expect(tile.querySelector('.tile-name')!.textContent).toBe(`${drop.level} ${drop.name}`);
    expect(drop.level).toBe('Lv 3');
    expect(tile.querySelector('.tile-farm')?.textContent ?? null).toBe(drop.farmNote);
  });

  it('a first clear’s tile and lines say First clear', () => {
    const g = squadGame(2, 4);
    const s = squadScreen(g, fought(g, 4, 'won'));
    expect(s.debrief!.drop!.kind).toBe('First clear');
    expect(s.lines.some((l) => l.startsWith('Weapon drop (First clear): '))).toBe(true);
  });
});

describe('gun level wherever the gun shows (ID-098)', () => {
  it('"Lv 12 Military Rifle" in the label, the picker option and the drop line; the free pistol is Lv 1', () => {
    const w = gun('a', 12);
    expect(levelName(w)).toBe('Lv 12 Military Rifle');
    expect(levelLabel(w)).toBe('Lv 12 Military Rifle (+7% damage)');
    expect(gunLabel(w)).toMatch(/^Lv 12 Military Rifle \(\+7% damage\) · [\d.]+ dmg\/s$/);
    expect(gunOption(w)).toMatch(
      /^[\d.]+ dmg\/s · Lv 12 Military Rifle · Marksman \(\+7% damage\)$/,
    );
    expect(levelLabel('pistol')).toBe('Lv 1 Pistol');
    expect(levelLabel(gun('b'))).toBe('Lv 1 Military Rifle (+7% damage)');
  });

  it('the gun picker lists each gun with its level, strongest first including level', () => {
    const low = gun('lo', 1);
    const high = gun('hi', 20);
    const g = squadGame(1, 3, [low, high]);
    const row = squadGear(g).rows[0]!;
    expect(row.options.map((o) => o.value)).toEqual(['hi', 'lo', 'pistol']);
    expect(row.options[0]!.label).toContain('Lv 20 Military Rifle');
    expect(row.options[2]!.label).toContain('Lv 1 Pistol');
  });

  it('a thrown-away gun is named with its level', () => {
    const w = gun('a', 7);
    const thrown = gun('t', 3);
    const t = dropTile({ armoury: [] }, dropOf(w, { thrown }));
    expect(t.thrown).toBe('Thrown away: Lv 3 Military Rifle');
    const lines = squadDropLines({ armoury: [thrown] }, dropOf(w, { thrown }));
    expect(lines.some((l) => l.includes('Lv 3 Military Rifle (+7% damage)'))).toBe(true);
  });
});

describe('text only (ID-098)', () => {
  it('puts the picker, the Power line and the tile on the page as text nodes, no markup', () => {
    const { h, root } = page();
    const g = squadGame(2, 6);
    h.showResult(squadScreen(g, fought(g, 3, 'won')));
    for (const node of root.querySelectorAll('.hud-horde-pick, .tile-drop, .hud-corner')) {
      expect(node.querySelector('script, iframe, style')).toBeNull();
    }
  });
});
