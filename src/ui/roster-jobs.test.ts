// @vitest-environment jsdom
// ID-149: professions on screen. Each Roster tab names the survivor's profession; the
// selected survivor's panel highlights what it gives, greys a fighting job's line off its
// guns, notes a shared job that doesn't stack, and splits every stat into the level's and
// the profession's part. The gun picker marks a fighting job's guns; the new-survivor tile
// names the profession (the horde panel's squad cards say none, ID-196).
import { describe, expect, it } from 'vitest';
import type { OwnedWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import { JOB_IDS, JOBS, type JobId, type WeaponId } from '../core/data.ts';
import { newGame, type GameState, type RosterDefender } from '../core/game.ts';
import { equipGun, finishSquadHorde, startSquadHorde } from '../core/hordeonly.ts';
import { xpForLevel } from '../core/stats.ts';
import { squadScreen } from './hud.ts';
import { joinCards } from './joining.ts';
import { JOB_SHORT, jobLine, NO_BONUS, NO_STACK, statRows } from './jobtext.ts';
import { createRoster, rosterTiles } from './squadroster.ts';

const NOW = 1_800_000_000_000;
const person = (n: number, job: JobId, level = 21): RosterDefender => ({
  ...recruit(n),
  job,
  xp: xpForLevel(level),
});
const gun = (uid: string, base: WeaponId): OwnedWeapon => ({
  uid,
  base,
  rarity: 'common',
  affixes: [],
});
function camp(roster: RosterDefender[], armoury: OwnedWeapon[] = []): GameState {
  const g = newGame('horde');
  return { ...g, hordeNumber: 3, roster, armoury, camp: { ...g.camp, recruits: roster.length } };
}
function open(game: GameState, id: string) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const roster = createRoster(root, {
    state: () => ({ game, fight: null, canGear: true, resumes: false }),
    onEquip: () => ({ ok: true }),
    onToggleSquad: () => ({ ok: true }),
    onLetGo: () => null,
    onCombine: () => null,
    onBestGuns: () => ({ ok: true, moves: [] }),
    onBestSquad: () => ({ ok: true, moves: { in: [], out: [] } }),
    onAutoSquad: () => ({ ok: true, moves: { in: [], out: [] } }),
  });
  roster.open(id);
  return document.querySelector<HTMLElement>('.camp-scrim')!;
}

describe('profession words (ID-149)', () => {
  it('names what a job gives at a level, its guns for a fighting job', () => {
    expect(jobLine('hunter', 21)).toBe(
      'Hunter: +12.0% crit chance, +18.0% crit damage with Sniper rifle, Carbine',
    );
    expect(jobLine('builder', 21)).toBe(
      'Construction worker: +35 max HP, +1.3 armour, +5.0% wall max HP while on the field',
    );
    expect(jobLine('chef', 21)).toBe('Chef: +10 max HP for everyone on the field');
    expect(jobLine('hunter', 1)).toBe(
      'Hunter: from level 2, more crit chance and crit damage with Sniper rifle, Carbine',
    );
    // ID-155: a Paramedic's points work from level 1; the old rest cut is gone.
    expect(jobLine('paramedic', 1)).toBe(
      'Paramedic: +20% chance a downed survivor skips rest (Paramedics in camp add up, to 80%); from level 2, more injury dodge and healing for the squad',
    );
    expect(jobLine('paramedic', 21)).toBe(
      'Paramedic: +20.0% injury dodge, everyone on the field heals 0.20% of max HP a second, +30% chance a downed survivor skips rest (Paramedics in camp add up, to 80%)',
    );
    expect(jobLine('paramedic', 21)).not.toContain('horde less');
    for (const j of JOB_IDS) {
      // Past level 1 every line names its numbers.
      expect(jobLine(j, 7), j).toMatch(new RegExp(`^${JOBS[j].name}: .*[0-9]`));
      expect(JOB_SHORT[j].length, j).toBeLessThanOrEqual(8);
    }
  });

  it('splits each stat into the level’s part and the profession’s', () => {
    const rows = statRows(person(1, 'hunter'), gun('h1', 'sniper'));
    expect(rows.map((r) => r.label)).toEqual([
      'Max HP',
      'Armour',
      'Fire rate',
      'Reload speed',
      'Accuracy',
      'Crit chance',
      'Crit damage',
      'Injury dodge',
    ]);
    const crit = rows.find((r) => r.label === 'Crit chance')!;
    expect(crit).toEqual({
      label: 'Crit chance',
      total: '22.0%',
      level: '+10.0%',
      job: '+12.0%',
      off: false,
      field: '',
    });
    const dmg = rows.find((r) => r.label === 'Crit damage')!;
    expect(dmg).toMatchObject({ total: '×2.18', level: '—', job: '+18%', off: false });
    expect(rows.find((r) => r.label === 'Max HP')).toMatchObject({
      total: '130',
      level: '+30',
      job: '—',
    });
  });

  it('a fighting job off its guns: its part shows struck out and leaves the total', () => {
    const rows = statRows(person(1, 'hunter'), gun('h1', 'smg'));
    const crit = rows.find((r) => r.label === 'Crit chance')!;
    expect(crit).toEqual({
      label: 'Crit chance',
      total: '10.0%',
      level: '+10.0%',
      job: '+12.0%',
      off: true,
      field: '',
    });
    expect(rows.filter((r) => r.off).map((r) => r.label)).toEqual(['Crit chance', 'Crit damage']);
  });
});

describe('the Roster shows professions (ID-149)', () => {
  it('every tab names the profession; the short name for a phone', () => {
    const game = camp(JOB_IDS.slice(0, 6).map((j, i) => person(i + 1, j)));
    const tiles = rosterTiles(game, NOW, null);
    expect(tiles.map((t) => t.job)).toEqual(JOB_IDS.slice(0, 6).map((j) => JOBS[j].name));
    const scrim = open(game, 'recruit-1');
    const tabs = [...scrim.querySelectorAll<HTMLElement>('.rv-tab')];
    expect(tabs).toHaveLength(6);
    for (const [i, tab] of tabs.entries()) {
      const job = JOB_IDS[i]!;
      expect(tab.querySelector('.rv-tab-level')!.textContent).toBe('Lv 21');
      expect(tab.querySelector('.rv-tab-job')!.textContent).toBe(JOB_SHORT[job]);
      expect(tab.getAttribute('aria-label')).toContain(JOBS[job].name);
    }
    expect(scrim.querySelector('.rv-who-level')!.textContent).toContain(
      'Level 21 · Police officer',
    );
  });

  it('highlights the profession, with the full stat table', () => {
    const hunter = {
      ...person(1, 'hunter'),
      loadout: { primary: gun('h1', 'rifle'), secondary: null, item: null },
    };
    const scrim = open(camp([hunter]), 'recruit-1');
    const job = scrim.querySelector<HTMLElement>('.rv-job')!;
    expect(job.hasAttribute('data-off')).toBe(false);
    expect(job.querySelector('.rv-job-line')!.textContent).toBe(jobLine('hunter', 21));
    expect(job.querySelector('.rv-job-note')).toBeNull();
    const rows = [...scrim.querySelectorAll('.rv-stats tbody tr')];
    expect(rows).toHaveLength(8);
    expect(rows.map((r) => r.querySelector('th')!.textContent)).toContain('Injury dodge');
    expect(scrim.querySelectorAll('.rv-stat-job[data-off]')).toHaveLength(0);
  });

  it('a fighting job on another gun: greyed, with "No bonus with this gun"', () => {
    const scrim = open(camp([person(1, 'soldier')]), 'recruit-1');
    const job = scrim.querySelector<HTMLElement>('.rv-job')!;
    expect(job.hasAttribute('data-off')).toBe(true);
    expect(job.querySelector('.rv-job-note')!.textContent).toBe(NO_BONUS);
    expect(scrim.querySelectorAll('.rv-stat-job[data-off]').length).toBeGreaterThan(0);
  });

  it('a shared job notes it doesn’t stack only when another squad survivor has it', () => {
    const one = open(camp([person(1, 'chef'), person(2, 'teacher')]), 'recruit-1');
    expect(one.querySelector('.rv-job-note')).toBeNull();
    const two = open(camp([person(1, 'chef'), person(2, 'chef')]), 'recruit-2');
    expect(two.querySelector('.rv-job-note')!.textContent).toBe(
      `${NO_STACK}: ${recruit(1).name} is also a Chef.`,
    );
    // Different levels: the note says whose counts (the higher level's).
    const low = open(camp([person(1, 'chef', 9), person(2, 'chef', 5)]), 'recruit-2');
    expect(low.querySelector('.rv-job-note')!.textContent).toBe(
      `${NO_STACK}: ${recruit(1).name} is also a Chef. ${recruit(1).name}’s counts (higher level).`,
    );
    const high = open(camp([person(1, 'chef', 9), person(2, 'chef', 5)]), 'recruit-1');
    expect(high.querySelector('.rv-job-note')!.textContent).toBe(
      `${NO_STACK}: ${recruit(2).name} is also a Chef. This one counts (higher level).`,
    );
    // A job with no squad effect never gets the note; one with any does.
    const self = open(camp([person(1, 'student'), person(2, 'student')]), 'recruit-1');
    const builder = open(camp([person(1, 'builder'), person(2, 'builder')]), 'recruit-1');
    expect(builder.querySelector('.rv-job-note')!.textContent).toBe(
      `The wall part: ${NO_STACK}: ${recruit(2).name} is also a Construction worker.`,
    );
    expect(self.querySelector('.rv-job-note')).toBeNull();
  });

  it('the gun picker marks the guns that suit a fighting job, and says so', () => {
    const game = camp([person(1, 'hunter')], [gun('h1', 'sniper'), gun('h2', 'smg')]);
    const scrim = open(game, 'recruit-1');
    scrim.querySelector<HTMLButtonElement>('[data-key="slot"]')!.click();
    const tile = (uid: string) => scrim.querySelector<HTMLElement>(`[data-choice="${uid}"]`)!;
    expect(tile('h1').querySelector('.rv-fit')).not.toBeNull();
    expect(tile('h1').getAttribute('aria-label')).toContain('suits a Hunter');
    expect(tile('h2').querySelector('.rv-fit')).toBeNull();
    expect(tile('pistol')).toBeNull();
    expect(scrim.querySelector('.rv-hint')!.textContent).toContain('★ suits a Hunter');
    // A self job marks nothing.
    const plain = open(camp([person(1, 'builder')], [gun('h1', 'sniper')]), 'recruit-1');
    plain.querySelector<HTMLButtonElement>('[data-key="slot"]')!.click();
    expect(plain.querySelector('.rv-fit')).toBeNull();
  });
});

describe('the new survivor names the profession; the panel’s cards do not (ID-149, ID-196)', () => {
  it('the panel’s squad cards carry no profession: an avatar and a name only', () => {
    const game = camp([person(1, 'hunter'), person(2, 'chef')]);
    const s = { ...startSquadHorde(game, 7, NOW), outcome: 'lost' as const };
    const screen = squadScreen(game, s);
    for (const c of screen.debrief!.cards) {
      expect(Object.keys(c).sort()).toEqual(['art', 'id', 'level', 'levelUp', 'name']);
    }
  });

  it('a first clear’s newcomer asking to join names their profession (ID-150)', () => {
    const game = { ...camp([person(1, 'hunter'), person(2, 'chef')]), hordeNumber: 1 };
    const s = { ...startSquadHorde(game, 7, NOW), outcome: 'won' as const };
    const screen = squadScreen(game, s);
    const joined = recruit(3, 7);
    expect(screen.debrief!.join).toBe(true);
    expect(joinCards(finishSquadHorde(game, s))[0]!.sub).toBe(
      `Lv 1 · ${JOBS[joined.job].name} · Pistol`,
    );
  });

  it('equipping keeps the profession', () => {
    const game = camp([person(1, 'hunter')], [gun('h1', 'sniper')]);
    const r = equipGun(game, 'recruit-1', 'h1');
    expect(r.ok && r.game.roster[0]!.job).toBe('hunter');
  });
});

describe('Max HP counts the Chef on the field (ID-408)', () => {
  const maxHp = (rows: ReturnType<typeof statRows>) => rows.find((r) => r.label === 'Max HP')!;
  const chef = person(1, 'chef', 24);
  const hunter = person(2, 'hunter', 1);

  it('a non-Chef on the field gets the part, and the total counts it', () => {
    const row = maxHp(statRows(hunter, gun('h1', 'sniper'), [chef, hunter]));
    expect(row.total).toBe('111');
    expect(row.field).toBe(`+11 Chef (${chef.name}) on the field`);
  });

  it('the Chef has it too; with no Chef on the field nothing changes', () => {
    expect(maxHp(statRows(chef, gun('h1', 'sniper'), [chef, hunter])).field).toContain('+11');
    expect(maxHp(statRows(hunter, gun('h1', 'sniper'), [hunter]))).toMatchObject({
      total: '100',
      field: '',
    });
    expect(maxHp(statRows(hunter, gun('h1', 'sniper')))).toMatchObject({ total: '100', field: '' });
  });

  it('two Chefs do not stack: the higher level gives it, and is named', () => {
    const low = person(3, 'chef', 5);
    const row = maxHp(statRows(hunter, gun('h1', 'sniper'), [low, chef, hunter]));
    expect(row.total).toBe('111');
    expect(row.field).toContain(chef.name);
  });

  it('a survivor off the field (the bench) has none', () => {
    const row = maxHp(statRows(hunter, gun('h1', 'sniper'), [chef]));
    expect(row).toMatchObject({ total: '100', field: '' });
  });

  it('in a fight the Roster header and the table agree', () => {
    const game = camp([chef, hunter]);
    const fight = startSquadHorde(game, 7, NOW);
    const tile = rosterTiles(game, NOW, fight).find((t) => t.id === hunter.id)!;
    const row = maxHp(statRows(hunter, gun('h1', 'sniper'), fight.defenders));
    expect(tile.health).toBe(`HP ${row.total}/${row.total}`);
  });

  it('between hordes the tab agrees with the table: on the field 111, on the bench 100', () => {
    const bench = person(4, 'student', 1);
    const game = { ...camp([chef, hunter]), reserve: [bench] };
    const row = maxHp(statRows(hunter, gun('h1', 'sniper'), [chef, hunter]));
    const tiles = rosterTiles(game, NOW, null);
    expect(tiles.find((t) => t.id === hunter.id)!.health).toBe(`HP ${row.total}/${row.total}`);
    expect(tiles.find((t) => t.id === bench.id)!.health).toBe('HP 100/100');
  });

  it('a patched-up survivor’s tab is what the fight starts them at', () => {
    const patched = { ...hunter, startHp: 0.5 };
    const game = camp([chef, patched]);
    const tile = rosterTiles(game, NOW, null).find((t) => t.id === patched.id)!;
    const fight = startSquadHorde(game, 7, NOW);
    const d = fight.defenders.find((f) => f.id === patched.id)!;
    expect(tile.health).toBe(`HP ${Math.ceil(d.hp)}/${d.maxHp} · patched\u00a0up`);
  });

  it('the panel shows the part beside the total, and only for those on the field', () => {
    const bench = person(4, 'student', 1);
    const game = { ...camp([chef, hunter]), reserve: [bench] };
    const field = open(game, hunter.id).querySelector<HTMLTableCellElement>('.rv-stat-field')!;
    // A screen reader hears which stat the note belongs to; the page shows only the note.
    expect(field.textContent).toBe(`Max HP: (+11 Chef (${chef.name}) on the field)`);
    expect(field.querySelector('.sr-only')!.textContent).toBe('Max HP: ');
    // Its own full-width row right under Max HP, so it never covers the Level column (ID-216).
    const row = field.parentElement!;
    expect(row.matches('tr.rv-stat-fieldrow')).toBe(true);
    expect(row.children).toHaveLength(1);
    expect(field.colSpan).toBe(4);
    expect(row.previousElementSibling!.querySelector('th')!.textContent).toBe('Max HP');
    expect(row.previousElementSibling!.querySelector('.rv-stat-field')).toBeNull();
    expect(open(game, bench.id).querySelector('.rv-stat-field')).toBeNull();
  });
});
