// @vitest-environment jsdom
// ID-147: the bench in the UI. The start screen shows the squad, the bench and a link to the
// Roster; a win names its joiners (squad or bench) and who rests; the Roster lists the bench
// under the squad, marks the resting, and moves a fit survivor between the two. Text reaches
// the page only through textContent.
import { describe, expect, it, vi } from 'vitest';
import { recruit } from '../core/camp.ts';
import { JOBS, SQUAD_CAP } from '../core/data.ts';
import { newGame, type GameState, type RosterDefender } from '../core/game.ts';
import type { HordeState } from '../core/horde.ts';
import { startSquadHorde, toggleSquad } from '../core/hordeonly.ts';
import { benchLine, CHANGE_SQUAD, restNote, squadScreen, squadStart } from './hud.ts';
import { JOB_SHORT } from './jobtext.ts';
import { createRoster, rosterTiles, SQUAD_WAIT } from './squadroster.ts';

const NOW = 1_700_000_000_000;

const person = (no: number, extra: Partial<RosterDefender> = {}): RosterDefender => ({
  ...recruit(no),
  ...extra,
});

function campGame(squad: RosterDefender[], bench: RosterDefender[] = [], horde = 3): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: horde,
    roster: squad,
    reserve: bench,
    camp: { ...g.camp, recruits: squad.length + bench.length },
  };
}

const people = (n: number, from = 1): RosterDefender[] =>
  Array.from({ length: n }, (_, i) => person(from + i));

/** Horde `game.hordeNumber` won with `seed`; each survivor in `down` was downed in it. */
function won(game: GameState, seed = 1, down: string[] = []): HordeState {
  const h = startSquadHorde(game, seed, NOW);
  h.outcome = 'won';
  for (const id of down) {
    const i = h.defenders.findIndex((d) => d.id === id);
    const d = h.defenders[i]!;
    h.defenders.splice(i, 1);
    h.injured.push({
      defender: { id, name: d.name, loadout: d.loadout },
      postId: d.postId,
      at: 0,
      offered: false,
      by: null,
    });
  }
  return h;
}

describe('the start screen and the bench (ID-147)', () => {
  it('sums up the bench: its size, who rests and the open slots to fill', () => {
    expect(benchLine(campGame(people(6)))).toBeNull();
    expect(benchLine(campGame(people(6), [person(7), person(8, { rest: 2 })]))).toBe(
      'Bench 2 · 1 resting',
    );
    expect(benchLine(campGame(people(4), [person(5), person(6), person(7)]))).toBe(
      'Bench 3 · 2 open slots: pick on the Roster',
    );
    expect(benchLine(campGame(people(5), [person(6, { rest: 1 })]))).toBe('Bench 1 · 1 resting');
  });

  it('shows the squad, the bench line and the Change squad link', () => {
    const g = campGame(people(5), [person(6), person(7, { rest: 1 })]);
    const s = squadStart(g);
    expect(s.lines[0]).toMatch(new RegExp(`^Squad 5/${SQUAD_CAP}: `));
    expect(s.lines).toContain('Bench 2 · 1 resting · 1 open slot: pick on the Roster');
    expect(s.debrief!.cards.map((c) => c.id)).toEqual(g.roster.map((d) => d.id));
    expect(s.debrief!.roster).toEqual({
      label: CHANGE_SQUAD,
      line: 'Bench 2 · 1 resting · 1 open slot: pick on the Roster',
    });
  });
});

describe('the result screen and the bench (ID-147)', () => {
  it('names two joiners past 6, waiting on the bench while the squad is full (seed 9)', () => {
    const g = campGame(people(6));
    const s = squadScreen(g, won(g, 9));
    const [a, b] = [recruit(7, 9), recruit(8, 9)];
    expect(s.lines).toContain(
      `New survivor: ${a.name} (${JOBS[a.job].name}) waits on the bench for now`,
    );
    expect(s.lines).toContain(
      `New survivor: ${b.name} (${JOBS[b.job].name}) waits on the bench for now`,
    );
    expect(s.debrief!.recruit).toEqual({
      label: 'New survivors',
      name: `${a.name} and ${b.name}`,
      sub: `${JOBS[a.job].name}, ${JOBS[b.job].name} · waits on the bench`,
      full: false,
    });
  });

  it('a joiner takes a slot the hurt leave, and the screen says who rests', () => {
    const g = campGame(people(6));
    const s = squadScreen(g, won(g, 8, ['recruit-2']));
    const a = recruit(7, 8);
    expect(s.lines).toContain(
      `New survivor: ${a.name} (${JOBS[a.job].name}) joins the squad for the next horde`,
    );
    expect(s.debrief!.recruit!.sub).toBe(`${JOBS[a.job].name} · joins next horde`);
    // The joiner filled the slot: nothing left to fill on the Roster.
    const note = `Resting: ${recruit(2).name} 2 hordes.`;
    expect(s.debrief!.note).toBe(note);
    expect(s.lines).toContain(note);
  });

  it('slots left open with someone fit on the bench: the note points at the Roster', () => {
    const g = campGame(people(6), [person(7)]);
    const s = squadScreen(g, won(g, 1, ['recruit-2']));
    expect(s.debrief!.note).toBe(
      `Resting: ${recruit(2).name} 2 hordes. Fill their slots on the Roster.`,
    );
  });

  it('nobody joins: the tile says so; resting with nobody fit to fill names no Roster step', () => {
    const g = campGame(people(6));
    const s = squadScreen(g, won(g, 1, ['recruit-1']));
    expect(s.debrief!.recruit).toEqual({
      label: 'Camp',
      name: '6 survivors',
      sub: 'Nobody new joins this time',
      full: true,
    });
    expect(s.debrief!.note).toBe(`Resting: ${recruit(1).name} 2 hordes.`);
    expect(restNote([], true)).toBeNull();
    expect(restNote([{ name: 'Ava', rest: 1 }], true)).toBe(
      'Resting: Ava 1 horde. Fill their slots on the Roster.',
    );
  });
});

describe('the result screen says what really happens (ID-147)', () => {
  it('a win that downs all six: the one woken at once is not named as resting', () => {
    const g = campGame(people(6));
    const all = g.roster.map((d) => d.id);
    const s = squadScreen(g, won(g, 1, all));
    const resting = all.slice(1).map((_, i) => `${recruit(i + 2).name} 2 hordes`);
    expect(s.debrief!.note).toBe(`Resting: ${resting.join(', ')}.`);
    expect(s.debrief!.note).not.toContain(`${recruit(1).name} 2`);
  });

  it('a bench survivor back from rest this horde can fill an open slot: the note says so', () => {
    const g = campGame(people(6), [person(7, { rest: 1 })]);
    const s = squadScreen(g, won(g, 1, ['recruit-2']));
    expect(s.debrief!.note).toBe(
      `Resting: ${recruit(2).name} 2 hordes. Fill their slots on the Roster.`,
    );
  });
});

describe('designer review fixes (ID-147)', () => {
  it('joiners split between squad and bench: the tile says who went where (seed 9)', () => {
    const g = campGame(people(5), [person(6)]);
    const s = squadScreen(g, won(g, 9));
    const [a, b] = [recruit(7, 9), recruit(8, 9)];
    expect(s.debrief!.recruit!.sub).toBe(
      `${a.name} joins next horde · ${b.name} waits on the bench`,
    );
  });

  it('the Roster lists the fit bench before the resting, and a resting tab says how long', () => {
    const g = campGame(people(2), [person(3, { rest: 2 }), person(4), person(5, { rest: 1 })]);
    expect(rosterTiles(g, NOW, null).map((t) => [t.id, t.rest])).toEqual([
      ['recruit-1', 0],
      ['recruit-2', 0],
      ['recruit-4', 0],
      ['recruit-3', 2],
      ['recruit-5', 1],
    ]);
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const roster = createRoster(root, {
      state: () => ({ game: g, fight: null, canGear: true, resumes: false }),
      onEquip: () => ({ ok: true }),
      onToggleSquad: () => ({ ok: true }),
      onBestGuns: () => ({ ok: true, moves: [] }),
    });
    roster.open('recruit-1');
    const job = (id: string) =>
      document.querySelector(`.rv-bench [data-defender="${id}"] .rv-tab-job`)!.textContent;
    expect(job('recruit-3')).toBe('Rest 2');
    expect(job('recruit-4')).toBe(JOB_SHORT[recruit(4).job]);
  });
});

describe('the Roster and the bench (ID-147)', () => {
  it('lists the bench after the squad, the resting marked', () => {
    const tiles = rosterTiles(campGame(people(2), [person(3), person(4, { rest: 2 })]), NOW, null);
    expect(
      tiles.map((t) => [t.id, t.bench, t.down, t.health.startsWith('HP') ? 'HP' : t.health]),
    ).toEqual([
      ['recruit-1', false, false, 'HP'],
      ['recruit-2', false, false, 'HP'],
      ['recruit-3', true, false, 'HP'],
      ['recruit-4', true, true, 'Resting: 2 hordes'],
    ]);
  });

  function mount(start: GameState, canGear = true) {
    let g = start;
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const onToggleSquad = vi.fn((id: string) => {
      if (!canGear) return { ok: false as const, reason: SQUAD_WAIT };
      const r = toggleSquad(g, id);
      if (!r.ok) return r;
      g = r.game;
      roster.refresh();
      return { ok: true as const };
    });
    const roster = createRoster(root, {
      state: () => ({ game: g, fight: null, canGear, resumes: false }),
      onEquip: () => ({ ok: true }),
      onToggleSquad,
      onBestGuns: () => ({ ok: true, moves: [] }),
    });
    const scrim = document.querySelector<HTMLElement>('.roster-scrim')!;
    const q = <T extends HTMLElement = HTMLButtonElement>(sel: string): T =>
      scrim.querySelector<T>(sel)!;
    return { roster, scrim, q, onToggleSquad, game: () => g };
  }

  it('with no bench the Roster looks as it did: no labels, no bench row, no squad button', () => {
    const m = mount(campGame(people(3)));
    m.roster.open('recruit-1');
    expect(m.q('.rv-bench').hidden).toBe(true);
    expect(
      [...m.scrim.querySelectorAll<HTMLElement>('.rv-tabs-label')].every((l) => l.hidden),
    ).toBe(true);
    expect(m.q('[data-key="squad"]')).toBeNull();
  });

  it('moves a bench survivor into an open slot and back, saying so', () => {
    const m = mount(campGame(people(5), [person(6), person(7)]));
    m.roster.open('recruit-6');
    expect(m.q('.rv-bench').hidden).toBe(false);
    const labels = [...m.scrim.querySelectorAll('.rv-tabs-label')].map((l) => l.textContent);
    expect(labels).toEqual([`Squad 5/${SQUAD_CAP}`, 'Bench 2']);
    expect(m.q('.rv-bench [data-defender="recruit-6"]')).not.toBeNull();
    m.q('[data-key="squad"]').click();
    expect(m.onToggleSquad).toHaveBeenCalledWith('recruit-6');
    expect(
      m
        .game()
        .roster.map((d) => d.id)
        .at(-1),
    ).toBe('recruit-6');
    expect(m.q('.rv-status').textContent).toBe(`${recruit(6).name} joins the squad.`);
    expect(m.q('[data-key="squad"]').textContent).toBe('Move to bench');
    expect(document.activeElement).toBe(m.q('[data-key="squad"]'));
    m.q('[data-key="squad"]').click();
    expect(m.game().reserve.map((d) => d.id)).toEqual(['recruit-7', 'recruit-6']);
  });

  it('a full squad refuses with its reason; the resting get no button, only their rest', () => {
    const m = mount(campGame(people(6), [person(7), person(8, { rest: 1 })]));
    m.roster.open('recruit-7');
    m.q('[data-key="squad"]').click();
    expect(m.q('.rv-status').textContent).toBe(
      `The squad is full (${SQUAD_CAP}/${SQUAD_CAP}): unmark one first`,
    );
    expect(m.q('.rv-status').dataset.tone).toBe('danger');
    m.q('[data-defender="recruit-8"]').click();
    expect(m.q('[data-key="squad"]')).toBeNull();
    expect(m.q('.rv-who-level').textContent).toContain('Resting: 1 horde');
    expect(m.q('[data-defender="recruit-8"]').classList.contains('rv-tab-down')).toBe(true);
  });

  it('in a fight the squad button is greyed with why', () => {
    const m = mount(campGame(people(6), [person(7)]), false);
    m.roster.open('recruit-7');
    const b = m.q('[data-key="squad"]');
    expect(b.disabled).toBe(true);
    expect(b.title).toBe(SQUAD_WAIT);
  });
});
