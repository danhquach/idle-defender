// @vitest-environment jsdom
// ID-149: professions on screen. Each Roster tab names the survivor's profession; the
// selected survivor's panel highlights what it gives, greys a fighting job's line off its
// guns, notes a shared job that doesn't stack, and splits every stat into the level's and
// the profession's part. The gun picker marks a fighting job's guns; squad cards and the
// new-survivor tile name the profession.
import { describe, expect, it } from 'vitest';
import type { OwnedWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import { JOB_IDS, JOBS, type JobId, type WeaponId } from '../core/data.ts';
import { newGame, type GameState, type RosterDefender } from '../core/game.ts';
import { equipGun, startSquadHorde } from '../core/hordeonly.ts';
import { xpForLevel } from '../core/stats.ts';
import { squadGear, squadScreen } from './hud.ts';
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
    onBestGuns: () => ({ ok: true, moves: [] }),
  });
  roster.open(id);
  return document.querySelector<HTMLElement>('.roster-scrim')!;
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

describe('squad cards and the new survivor name the profession (ID-149)', () => {
  it('the start and result cards read "Lv N · Profession"', () => {
    const game = camp([person(1, 'hunter'), person(2, 'chef')]);
    const s = { ...startSquadHorde(game, 7, NOW), outcome: 'lost' as const };
    const screen = squadScreen(game, s);
    const cards = screen.debrief!.cards;
    expect(cards.map((c) => c.job)).toEqual(['Hunter', 'Chef']);
  });

  it('the start screen’s gun picker stars a fighting job’s guns and says when the held one isn’t', () => {
    const hunter = {
      ...person(1, 'hunter'),
      loadout: { primary: gun('h1', 'smg'), secondary: null, item: null },
    };
    const game = camp([hunter, person(2, 'chef')], [gun('h2', 'sniper'), gun('h3', 'lmg')]);
    const [h, chef] = squadGear(game).rows;
    const label = (row: typeof h, value: string) =>
      row!.options.find((o) => o.value === value)!.label;
    expect(label(h, 'h2').startsWith('★ ')).toBe(true);
    expect(label(h, 'h1').startsWith('★ ')).toBe(false);
    expect(label(h, 'h3').startsWith('★ ')).toBe(false);
    expect(h!.role).toContain('No Hunter bonus with this gun');
    // An everyday job marks nothing.
    expect(chef!.options.some((o) => o.label.startsWith('★'))).toBe(false);
    expect(chef!.role).not.toContain('bonus with this gun');
    const suited = camp([
      { ...hunter, loadout: { ...hunter.loadout, primary: gun('h2', 'sniper') } },
    ]);
    expect(squadGear(suited).rows[0]!.role).not.toContain('No Hunter bonus');
  });

  it('a first clear’s new survivor tile names their profession', () => {
    const game = { ...camp([person(1, 'hunter'), person(2, 'chef')]), hordeNumber: 1 };
    const s = { ...startSquadHorde(game, 7, NOW), outcome: 'won' as const };
    const screen = squadScreen(game, s);
    const joined = recruit(3, 7);
    expect(screen.debrief!.recruit!.sub).toBe(`${JOBS[joined.job].name} · joins next horde`);
  });

  it('equipping keeps the profession', () => {
    const game = camp([person(1, 'hunter')], [gun('h1', 'sniper')]);
    const r = equipGun(game, 'recruit-1', 'h1');
    expect(r.ok && r.game.roster[0]!.job).toBe('hunter');
  });
});
