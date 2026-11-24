// @vitest-environment jsdom
// ID-147: the bench in the UI. The start screen shows the squad, the bench and a link to the
// Roster; a win names its joiners (squad or bench) and who rests; the Roster lists the bench
// under the squad, marks the resting, and moves a fit survivor between the two. Text reaches
// the page only through textContent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recruit } from '../core/camp.ts';
import { AREAS, JOBS, PATCH_UP, SQUAD_CAP } from '../core/data.ts';
import { maxHpOf } from '../core/stats.ts';
import { newGame, type GameState, type RosterDefender } from '../core/game.ts';
import type { HordeState } from '../core/horde.ts';
import {
  bestSquad,
  setAutoSquad,
  squadResult,
  startSquadHorde,
  toggleSquad,
  treatSurvivor,
} from '../core/hordeonly.ts';
import {
  benchLine,
  CHANGE_SQUAD,
  movesText,
  patchNote,
  restNote,
  squadScreen,
  squadStart,
} from './hud.ts';
import { wonNote } from './testing.ts';
import { answerText, noJoinText } from './joining.ts';
import { JOB_SHORT } from './jobtext.ts';
import {
  AUTO_ON,
  createRoster,
  NO_MEDICINE,
  rosterTiles,
  SQUAD_WAIT,
  TREAT_LABEL,
  TREAT_WAIT,
  INJURED,
  treatedText,
} from './squadroster.ts';
import { sendMapPatrol, takeReport, withMap } from '../core/scout.ts';
import { patrolGroupLabel, patrolMission, patrolName, patrolTime } from './maptext.ts';

const NOW = 1_700_000_000_000;
const MIN = 60_000;

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
    expect(benchLine(campGame(people(6), [person(7), person(8, { rest: 1 })]))).toBe(
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
  it('two ask to join past 6 (seed 9): the offer line is there, with no reason why nobody came', () => {
    const g = campGame(people(6));
    const s = squadScreen(g, won(g, 9));
    const [a, b] = [recruit(7, 9), recruit(8, 9)];
    expect(a.name).not.toBe(b.name);
    expect(s.debrief!.join).toBe(true);
    expect(wonNote(s) ?? '').not.toMatch(/Nobody new/);
  });

  it('one asks to join while one rests: the screen says who rests', () => {
    const g = campGame(people(6));
    const s = squadScreen(g, won(g, 8, ['recruit-2']));
    const a = recruit(7, 8);
    expect(a.name).toBeTruthy();
    expect(s.debrief!.join).toBe(true);
    // Nobody fit on the bench yet (the newcomer only joins on Accept): no Roster step.
    const note = `Resting: ${recruit(2).name} 1 horde.`;
    expect(wonNote(s)).toBe(note);
    expect(s.lines).toContain(note);
  });

  it('a newcomer will take the one open slot: no Roster step in the rest note (ID-150)', () => {
    const g = campGame(people(6), [person(7)]);
    const s = squadScreen(g, won(g, 9, ['recruit-2']));
    expect(s.debrief!.join).toBe(true);
    expect(wonNote(s)).toBe(`Resting: ${recruit(2).name} 1 horde.`);
  });

  it('slots left open with someone fit on the bench: the note points at the Roster', () => {
    const g = campGame(people(6), [person(7)]);
    const s = squadScreen(g, won(g, 1, ['recruit-2']));
    expect(s.debrief!.notes![0]).toBe(
      `Resting: ${recruit(2).name} 1 horde. Fill their slots on the Roster.`,
    );
  });

  it('nobody joins: the details say so, last; resting with nobody fit to fill names no Roster step', () => {
    const g = campGame(people(6));
    const s = squadScreen(g, won(g, 1, ['recruit-1']));
    expect(s.debrief!.join).toBe(true);
    expect(s.debrief!.notes).toEqual([
      `Resting: ${recruit(1).name} 1 horde.`,
      noJoinText('nobody-first', 6),
    ]);
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
    const resting = all.slice(1).map((_, i) => `${recruit(i + 2).name} 1 horde`);
    expect(s.debrief!.notes![0]).toBe(`Resting: ${resting.join(', ')}.`);
    expect(wonNote(s)).not.toContain(`${recruit(1).name} 1`);
  });

  it('a bench survivor back from rest this horde can fill an open slot: the note says so', () => {
    const g = campGame(people(6), [person(7, { rest: 1 })]);
    const s = squadScreen(g, won(g, 1, ['recruit-2']));
    expect(s.debrief!.notes![0]).toBe(
      `Resting: ${recruit(2).name} 1 horde. Fill their slots on the Roster.`,
    );
  });
});

describe('the result screen names who "Auto" moved (ID-154)', () => {
  it('a note when it moved someone; none when it is off or moved nobody', () => {
    const plain = campGame(people(6), [person(7, { xp: 30000 })]);
    const g = { ...plain, autoSquad: true as const };
    const h = won(g);
    const s = squadScreen(g, h);
    const out = squadResult(g, h).auto!.out[0]!;
    const note = `Auto squad: in ${recruit(7).name} · out ${out}.`;
    expect(wonNote(s)).toContain(note);
    expect(s.lines).toContain(note);
    expect(wonNote(squadScreen(plain, h)) ?? '').not.toContain('Auto squad');
    // A loss says it too.
    const lost = squadScreen(g, { ...h, outcome: 'lost' });
    expect(lost.debrief!.note).toContain('Auto squad: in');
    // Auto on with nothing better on the bench: no note.
    const best = { ...campGame(people(6), [person(7)]), autoSquad: true as const };
    const settled = bestSquad(best).game;
    expect(squadResult(settled, won(settled)).auto).toBeNull();
  });

  it('a rest is never reported as an Auto move; filling its slot is', () => {
    const g = { ...campGame(people(6), [person(7)]), autoSquad: true as const };
    const h = won(g, 1, ['recruit-1']);
    const r = squadResult(g, h);
    // recruit-1 rests (benched by the rest, not by Auto); Auto fills the open slot.
    expect(r.rests.map((x) => x.id)).toContain('recruit-1');
    expect(r.auto).toEqual({ in: [recruit(7).name], out: [] });
    // Off, nobody fills it and nothing is reported.
    const off = { ...g };
    delete (off as Partial<GameState>).autoSquad;
    expect(squadResult(off, h).auto).toBeNull();
  });

  it('movesText says who came in and went out, or null', () => {
    expect(movesText({ in: ['Ava', 'Bo'], out: ['Cy'] })).toBe('in Ava, Bo · out Cy');
    expect(movesText({ in: [], out: ['Cy'] })).toBe('out Cy');
    expect(movesText({ in: [], out: [] })).toBeNull();
  });
});

describe('designer review fixes (ID-147)', () => {
  it('each answer says where the newcomer went (ID-150)', () => {
    expect(answerText('Ava', 'squad')).toBe('Ava joined the squad');
    expect(answerText('Ava', 'bench')).toBe('Ava joined the camp, on the bench');
    expect(answerText('Ava', null)).toBe('Ava was turned away');
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
      onLetGo: () => null,
      onCombine: () => null,
      onBestGuns: () => ({ ok: true, moves: [] }),
      onBestSquad: () => ({ ok: true, moves: { in: [], out: [] } }),
      onAutoSquad: () => ({ ok: true, moves: { in: [], out: [] } }),
    });
    roster.open('recruit-1');
    const job = (id: string) =>
      document.querySelector(`.rv-bench [data-defender="${id}"] .rv-tab-job`)!.textContent;
    expect(job('recruit-3')).toBe('Injured');
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
    // Treat (ID-220), as the app runs it.
    const onTreat = vi.fn((id: string) => {
      if (!canGear) return { ok: false as const, reason: TREAT_WAIT };
      const r = treatSurvivor(g, id);
      if (!r.ok) return r;
      g = r.game;
      roster.refresh();
      return { ok: true as const };
    });
    // "Best squad" and "Auto" (ID-154), as the app runs them.
    const onBestSquad = vi.fn(() => {
      if (!canGear) return { ok: false as const, reason: SQUAD_WAIT };
      const r = bestSquad(g);
      g = r.game;
      roster.refresh();
      return { ok: true as const, moves: r.moves };
    });
    const onAutoSquad = vi.fn((on: boolean) => {
      if (!canGear) return { ok: false as const, reason: SQUAD_WAIT };
      const r = setAutoSquad(g, on);
      g = r.game;
      roster.refresh();
      return { ok: true as const, moves: r.moves };
    });
    const roster = createRoster(root, {
      state: () => ({ game: g, fight: null, canGear, resumes: false }),
      onEquip: () => ({ ok: true }),
      onToggleSquad,
      onTreat,
      onLetGo: () => null,
      onCombine: () => null,
      onBestGuns: () => ({ ok: true, moves: [] }),
      onBestSquad,
      onAutoSquad,
    });
    const scrim = document.querySelector<HTMLElement>('.camp-scrim')!;
    const q = <T extends HTMLElement = HTMLButtonElement>(sel: string): T =>
      scrim.querySelector<T>(sel)!;
    // The camp changed outside the Roster (a report taken on the World map).
    const set = (next: GameState): void => {
      g = next;
    };
    return {
      roster,
      scrim,
      q,
      onToggleSquad,
      onTreat,
      onBestSquad,
      onAutoSquad,
      game: () => g,
      set,
    };
  }

  it('with no bench the Roster looks as it did: no labels, no bench row, no squad button', () => {
    const m = mount(campGame(people(3)));
    m.roster.open('recruit-1');
    expect(m.q('.rv-bench').hidden).toBe(true);
    expect(
      [...m.scrim.querySelectorAll<HTMLElement>('.rv-tabs-label')].every(
        (l) => l.closest('[hidden]') !== null,
      ),
    ).toBe(true);
    expect(m.q('[data-key="squad"]')).toBeNull();
    // No "Best squad" or "Auto" (ID-154) either, and Tab never lands on them.
    expect(m.q('[data-key="best-squad"]').closest('[hidden]')).not.toBeNull();
    expect(m.q('[data-key="auto-squad"]').closest('[hidden]')).not.toBeNull();
  });

  describe('survivors on patrol: their own row (ID-230), one block per patrol (ID-234)', () => {
    // The clock a minute after the patrols left, so they are still out.
    beforeEach(() => {
      vi.useFakeTimers({ now: NOW + MIN, toFake: ['Date'] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });
    /** Sends each team in `teams` to the next area, in turn. */
    const out = (bench: RosterDefender[], ...teams: string[][]): GameState => {
      let g = withMap(campGame(people(3), bench), 7);
      teams.forEach((ids, i) => {
        const sent = sendMapPatrol(g, g.map!.areas[i]!.kind, ids, 1, NOW);
        if (!sent.ok) throw new Error(sent.reason);
        g = sent.game;
      });
      return g;
    };
    const rowIds = (sel: string, m: ReturnType<typeof mount>) =>
      [...m.scrim.querySelectorAll<HTMLElement>(`${sel} .rv-tab`)].map((t) => t.dataset.defender);
    const blocks = (m: ReturnType<typeof mount>) => [
      ...m.scrim.querySelectorAll<HTMLElement>('.rv-patrols .rv-patrol-block'),
    ];
    const label = (el: HTMLElement) => el.previousElementSibling as HTMLElement;

    it('Squad, Bench and On patrol rows, each counted apart; the card keeps its locks', () => {
      const m = mount(out([person(4), person(5, { rest: 1 }), person(6)], ['recruit-6']));
      m.roster.open('recruit-1');
      const bench = m.q<HTMLElement>('.rv-bench:not(.rv-patrol)');
      expect(rowIds('.rv-bench:not(.rv-patrol)', m)).toEqual(['recruit-4', 'recruit-5']);
      expect(rowIds('.rv-patrol', m)).toEqual(['recruit-6']);
      expect(label(bench).textContent).toBe('Bench 2');
      expect(label(m.q('.rv-patrols')).textContent).toBe('On patrol 1');
      expect(m.q('.rv-patrols').hidden).toBe(false);
      expect(m.q('.rv-squad-row').hidden).toBe(false);
      expect(m.q('.rv-patrol [data-defender="recruit-6"] .rv-tab-job').textContent).toBe('Out');
      // The card: the patrol by name, no squad or treat button, gun locked (ID-219).
      const p = m.game().map!.patrols[0]!;
      m.roster.open('recruit-6');
      expect(m.q('.rv-who-level').textContent).toBe(
        `Level 1 · ${JOBS[recruit(6).job].name} · ${patrolName(p)}`,
      );
      expect(m.q('[data-key="squad"]')).toBeNull();
      expect(m.q('[data-key="treat"]')).toBeNull();
    });

    it('two patrols: two blocks, the soonest back first, each with its members in sent order', () => {
      const m = mount(
        out(people(5, 4), ['recruit-7', 'recruit-4', 'recruit-6', 'recruit-5'], ['recruit-8']),
      );
      m.roster.open('recruit-1');
      const ps = [...m.game().map!.patrols].sort((a, b) => a.backAt - b.backAt || a.no - b.no);
      const bs = blocks(m);
      expect(bs).toHaveLength(2);
      expect(label(m.q('.rv-patrols')).textContent).toBe('On patrol 5');
      bs.forEach((b, i) => {
        const p = ps[i]!;
        expect(b.getAttribute('role')).toBe('group');
        expect(b.getAttribute('aria-label')).toBe(patrolGroupLabel(p, NOW + MIN));
        expect(b.querySelector('.rv-patrol-title')!.textContent).toBe(patrolName(p));
        expect(b.querySelector('.rv-patrol-time')!.textContent).toBe(patrolTime(p, NOW + MIN));
        expect(b.querySelector('.rv-patrol-mission')!.textContent).toBe(patrolMission(p));
        const ids = [...b.querySelectorAll<HTMLElement>('.rv-tab')].map((t) => t.dataset.defender);
        expect(ids).toEqual(p.members);
        // The cards no longer repeat where and when: the header says it once.
        for (const t of b.querySelectorAll('.rv-tab')) {
          expect(t.getAttribute('aria-label')).toContain('On patrol');
          expect(t.getAttribute('aria-label')).not.toContain(AREAS[p.area].name);
          expect(t.getAttribute('aria-label')).not.toMatch(/\d+ (m|h|s)\b/);
        }
      });
      // Four members fit their block's list, counted for the layout.
      const four = bs.find((b) => b.querySelectorAll('.rv-tab').length === 4)!;
      expect(four.querySelector<HTMLElement>('.rv-patrol')!.dataset.count).toBe('4');
    });

    it('patrols back at the same time are ordered by number', () => {
      const g = out(people(2, 4), ['recruit-5'], ['recruit-4']);
      const [a, b] = g.map!.patrols;
      const tied = {
        ...g,
        map: { ...g.map!, patrols: [{ ...b!, backAt: a!.backAt }, a!] },
      };
      const m = mount(tied);
      m.roster.open('recruit-1');
      expect(blocks(m).map((x) => x.querySelector('.rv-patrol-title')!.textContent)).toEqual([
        patrolName(a!),
        patrolName(b!),
      ]);
    });

    it('tick: closed does nothing; the countdown moves in place; back redraws, the card kept', () => {
      const m = mount(out(people(2, 4), ['recruit-4'], ['recruit-5']));
      m.roster.tick(NOW + 2 * MIN); // closed: nothing drawn, nothing thrown
      expect(blocks(m)).toHaveLength(0);
      m.roster.open('recruit-5');
      const p = m.game().map!.patrols.find((x) => x.members.includes('recruit-4'))!;
      const block = () => blocks(m).find((b) => b.querySelector('[data-defender="recruit-4"]'))!;
      const before = block();
      const time = before.querySelector('.rv-patrol-time')!;
      // A minute left: the time moves, the same nodes stay.
      m.roster.tick(p.backAt - MIN);
      expect(block()).toBe(before);
      expect(time.textContent).toBe('Back in 1 m');
      expect(before.getAttribute('aria-label')).toBe(
        `Patrol ${p.no}, ${AREAS[p.area].name}, back in 1 minute`,
      );
      // Nothing changed: nothing rewritten.
      m.roster.tick(p.backAt - MIN);
      expect(block()).toBe(before);
      // Back: "report ready" in place; a timer never redraws what the player is using.
      const shownCard = m.q('[data-defender="recruit-5"]');
      shownCard.focus();
      vi.setSystemTime(p.backAt);
      m.roster.tick(p.backAt);
      expect(block()).toBe(before);
      expect(time.textContent).toBe('Back · report ready');
      expect(before.getAttribute('aria-label')).toBe(
        `Patrol ${p.no}, ${AREAS[p.area].name}, back, report ready`,
      );
      expect(document.activeElement).toBe(shownCard);
      expect(shownCard.getAttribute('aria-current')).toBe('true');
    });

    it('tick: a patrol taken without a refresh is drawn again', () => {
      const m = mount(out(people(2, 4), ['recruit-4'], ['recruit-5']));
      m.roster.open('recruit-1');
      const p = m.game().map!.patrols.find((x) => x.members.includes('recruit-4'))!;
      const taken = takeReport(m.game(), p.area, p.backAt);
      if (!taken.ok) throw new Error(taken.reason);
      m.set(taken.game);
      m.roster.tick(NOW + 2 * MIN);
      expect(blocks(m)).toHaveLength(1);
      expect(rowIds('.rv-bench:not(.rv-patrol)', m)).toContain('recruit-4');
    });

    it('a report taken: its block goes and its members are back on the Bench', () => {
      const m = mount(out(people(2, 4), ['recruit-4'], ['recruit-5']));
      m.roster.open('recruit-1');
      const p = m.game().map!.patrols.find((x) => x.members.includes('recruit-4'))!;
      const taken = takeReport(m.game(), p.area, p.backAt);
      if (!taken.ok) throw new Error(taken.reason);
      m.set(taken.game);
      m.roster.refresh();
      expect(blocks(m)).toHaveLength(1);
      expect(rowIds('.rv-bench:not(.rv-patrol)', m)).toContain('recruit-4');
      expect(rowIds('.rv-patrol', m)).toEqual(['recruit-5']);
    });

    it('the whole bench away: the Bench row hides, Squad and On patrol stay', () => {
      const m = mount(out([person(4)], ['recruit-4']));
      m.roster.open('recruit-1');
      const bench = m.q<HTMLElement>('.rv-bench:not(.rv-patrol)');
      expect(bench.hidden && label(bench).hidden).toBe(true);
      expect(m.q('.rv-patrols').hidden).toBe(false);
      expect(label(m.q('.rv-patrols')).textContent).toBe('On patrol 1');
      expect(m.q('.rv-squad-row').hidden).toBe(false);
    });

    it('nobody on patrol: the label and blocks are hidden', () => {
      const m = mount(campGame(people(3), [person(4)]));
      m.roster.open('recruit-1');
      const patrols = m.q<HTMLElement>('.rv-patrols');
      expect(patrols.hidden && label(patrols).hidden).toBe(true);
      expect(blocks(m)).toHaveLength(0);
      expect(label(m.q('.rv-bench')).textContent).toBe('Bench 1');
    });
  });

  it('"Best squad" swaps a weaker squad survivor for a stronger bench one, saying so (ID-154)', () => {
    const vet = person(7, { xp: 5000 });
    const m = mount(campGame(people(6), [vet]));
    m.roster.open('recruit-1');
    const b = m.q('[data-key="best-squad"]');
    expect(b.closest('[hidden]')).toBeNull();
    b.click();
    expect(m.game().roster.map((d) => d.id)).toContain('recruit-7');
    const out = m.game().reserve[0]!;
    expect(m.q('.rv-status').textContent).toBe(`Squad: in ${vet.name} · out ${out.name}`);
    expect(document.activeElement).toBe(m.q('[data-key="best-squad"]'));
    // A second press changes nothing.
    m.q('[data-key="best-squad"]').click();
    expect(m.q('.rv-status').textContent).toBe('The squad is already the strongest it can be.');
  });

  it('"Auto" ticks on (running the pick once) and off, and shows the saved state (ID-154)', () => {
    const m = mount(campGame(people(5), [person(6)]));
    m.roster.open('recruit-1');
    const box = m.q<HTMLInputElement>('[data-key="auto-squad"]');
    expect(box.checked).toBe(false);
    box.click();
    expect(m.onAutoSquad).toHaveBeenLastCalledWith(true);
    expect(m.game().autoSquad).toBe(true);
    expect(m.game().roster).toHaveLength(6);
    // It says when it runs, then who the tick moved.
    expect(m.q('.rv-status').textContent).toBe(`${AUTO_ON} Squad: in ${recruit(6).name}`);
    expect(m.q<HTMLInputElement>('[data-key="auto-squad"]').checked).toBe(true);
    m.q<HTMLInputElement>('[data-key="auto-squad"]').click();
    expect(m.game().autoSquad).toBeUndefined();
    expect(m.q('.rv-status').textContent).toBe('Auto off: the squad stays as you pick it.');
  });

  it('in a fight "Best squad" and "Auto" are greyed with the reason (ID-154)', () => {
    const m = mount(campGame(people(5), [person(6)]), false);
    m.roster.open('recruit-1');
    expect(m.q('[data-key="best-squad"]').disabled).toBe(true);
    expect(m.q('[data-key="best-squad"]').title).toBe(SQUAD_WAIT);
    expect(m.q<HTMLInputElement>('[data-key="auto-squad"]').disabled).toBe(true);
    expect(m.q('.rv-auto').title).toBe(SQUAD_WAIT);
    // In words too, for a phone, where a tooltip never shows.
    expect(m.q('.rv-squad-wait').hidden).toBe(false);
    expect(m.q('.rv-squad-wait').textContent).toBe(SQUAD_WAIT);
    expect(m.q('[data-key="best-squad"]').getAttribute('aria-label')).toBe(
      `Best squad. ${SQUAD_WAIT}`,
    );
    expect(m.q('[data-key="auto-squad"]').getAttribute('aria-label')).toBe(
      `Auto best squad. ${SQUAD_WAIT}`,
    );
  });

  it('moves a bench survivor into an open slot and back, saying so', () => {
    const m = mount(campGame(people(5), [person(6), person(7)]));
    m.roster.open('recruit-6');
    expect(m.q('.rv-bench').hidden).toBe(false);
    const labels = [...m.scrim.querySelectorAll<HTMLElement>('.rv-tabs-label')]
      .filter((l) => l.closest('[hidden]') === null)
      .map((l) => l.textContent);
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
    expect(m.q('.rv-status').textContent).toBe(`${recruit(6).name} moves into the squad.`);
    // Not "joins": a newcomer joins on the result screen, this is a move (ID-182).
    expect(m.q('.rv-status').textContent).not.toMatch(/joins/);
    expect(m.q('[data-key="squad"]').textContent).toBe('Move to bench');
    expect(document.activeElement).toBe(m.q('[data-key="squad"]'));
    m.q('[data-key="squad"]').click();
    expect(m.game().reserve.map((d) => d.id)).toEqual(['recruit-7', 'recruit-6']);
    expect(m.q('.rv-status').textContent).toBe(`${recruit(6).name} moves to the bench.`);
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

describe('patched up by Paramedics (ID-155)', () => {
  const medics = () =>
    Array.from({ length: 4 }, (_, i) => person(7 + i, { job: 'paramedic' as const }));

  it('the result screen names who is back next horde and at what HP', () => {
    const g = campGame(people(6), medics());
    // A seed where recruit-2's roll succeeds (80% with four Paramedics).
    const seed = Array.from({ length: 40 }, (_, s) => s + 1).find((s) =>
      wonNote(squadScreen(g, won(g, s, ['recruit-2'])))?.startsWith('Patched up'),
    )!;
    const s = squadScreen(g, won(g, seed, ['recruit-2']));
    expect(s.debrief!.notes![0]).toBe(
      `Patched up by Paramedics, back next horde: ${recruit(2).name} (50% HP).`,
    );
    expect(patchNote([])).toBeNull();
    // With a Paramedic in camp, the rest note says the roll failed.
    expect(restNote([{ name: 'Bo', rest: 1 }], false, true)).toBe(
      'Resting (not patched up): Bo 1 horde.',
    );
    expect(
      patchNote([
        { name: 'Ava', startHp: 0.55 },
        { name: 'Bo', startHp: 0.8 },
      ]),
    ).toBe('Patched up by Paramedics, back next horde: Ava (55% HP), Bo (80% HP).');
  });

  it('the Roster shows the reduced HP they start the next horde at', () => {
    const tiles = rosterTiles(
      campGame([person(1, { startHp: PATCH_UP.hp }), person(2)]),
      NOW,
      null,
    );
    const max = maxHpOf(person(1));
    expect(tiles[0]!.health).toBe(`HP ${Math.round(max * PATCH_UP.hp)}/${max} · patched\u00a0up`);
    expect(tiles[0]!.down).toBe(false);
    expect(tiles[1]!.health).toBe(`HP ${maxHpOf(person(2))}/${maxHpOf(person(2))}`);
  });
});

describe('the Roster: Medicine treats the resting (ID-220)', () => {
  function mount(start: GameState, canGear = true) {
    let g = start;
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const onTreat = vi.fn((id: string) => {
      if (!canGear) return { ok: false as const, reason: TREAT_WAIT };
      const r = treatSurvivor(g, id);
      if (!r.ok) return r;
      g = r.game;
      roster.refresh();
      return { ok: true as const };
    });
    const onToggleSquad = vi.fn((id: string) => {
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
      onTreat,
      onLetGo: () => null,
      onCombine: () => null,
      onBestGuns: () => ({ ok: true, moves: [] }),
      onBestSquad: () => ({ ok: true, moves: { in: [], out: [] } }),
      onAutoSquad: () => ({ ok: true, moves: { in: [], out: [] } }),
    });
    const scrim = document.querySelector<HTMLElement>('.camp-scrim')!;
    const q = (sel: string): HTMLButtonElement | null =>
      scrim.querySelector<HTMLButtonElement>(sel);
    return { roster, q, onTreat, game: () => g };
  }
  const hurt = (medicine: number): GameState => ({
    ...campGame(people(5), [person(6, { rest: 1 }), person(7)]),
    ...(medicine > 0 ? { medicine } : {}),
  });

  it('a resting survivor: "Treat · 1 Medicine"; a press ends the rest and says so', () => {
    const m = mount(hurt(2));
    m.roster.open('recruit-6');
    const b = m.q('[data-key="treat"]')!;
    expect(b.textContent).toBe(TREAT_LABEL);
    expect(b.disabled).toBe(false);
    expect(m.q('[data-key="squad"]')).toBeNull();
    b.click();
    expect(m.onTreat).toHaveBeenCalledWith('recruit-6');
    expect(m.game().medicine).toBe(1);
    expect(m.q('.rv-status')!.textContent).toBe(treatedText(recruit(6).name));
    // Fit now: no Treat, and "Add to squad" in its place works at once.
    expect(m.q('[data-key="treat"]')).toBeNull();
    expect(m.q('.rv-who-level')!.textContent).not.toContain('Resting');
    m.q('[data-key="squad"]')!.click();
    expect(m.game().roster.at(-1)!.id).toBe('recruit-6');
  });

  it('no Medicine: "No Medicine", greyed; nothing changes', () => {
    const m = mount(hurt(0));
    m.roster.open('recruit-6');
    const b = m.q('[data-key="treat"]')!;
    expect(b.textContent).toBe(NO_MEDICINE);
    expect(b.disabled).toBe(true);
    expect(b.getAttribute('aria-label')).toContain(NO_MEDICINE);
    b.click();
    expect(m.onTreat).not.toHaveBeenCalled();
    expect(m.game().reserve[0]!.rest).toBe(1);
  });

  it('the injured look: red card, bandaged portrait, "Injured" tab and tag; the fit and the away have none', () => {
    const sent = sendMapPatrol(
      withMap(hurt(2), 7),
      withMap(hurt(2), 7).map!.areas[0]!.kind,
      ['recruit-7'],
      1,
      NOW,
    );
    if (!sent.ok) throw new Error(sent.reason);
    // Hand-made: one out on patrol with a rest (a doctored save): "Out" wins, no injured look.
    const g = {
      ...sent.game,
      reserve: sent.game.reserve.map((d) => (d.id === 'recruit-7' ? { ...d, rest: 1 } : d)),
    };
    const m = mount(g);
    m.roster.open('recruit-6');
    const tab = (id: string) => m.q(`[data-key="tab:${id}"]`)!;
    expect(tab('recruit-6').classList.contains('rv-tab-hurt')).toBe(true);
    expect(tab('recruit-6').querySelector('.rv-tab-job')!.textContent).toBe(INJURED);
    expect(tab('recruit-6').getAttribute('aria-label')).toContain(`${INJURED}, Resting: 1 horde`);
    expect(tab('recruit-6').querySelector('.roster-avatar-hurt .roster-bandage')).not.toBeNull();
    expect(m.q('.rv-hurt-tag')!.textContent).toBe(INJURED);
    expect(m.q('.rv-top .roster-avatar-hurt .roster-bandage')!.getAttribute('aria-hidden')).toBe(
      'true',
    );
    for (const id of ['recruit-1', 'recruit-7']) {
      expect(tab(id).classList.contains('rv-tab-hurt')).toBe(false);
      expect(tab(id).querySelector('.roster-bandage')).toBeNull();
    }
    expect(tab('recruit-7').querySelector('.rv-tab-job')!.textContent).toBe('Out');
    m.roster.open('recruit-1');
    expect(m.q('.rv-hurt-tag')).toBeNull();
    expect(m.q('.rv-top .roster-avatar-hurt')).toBeNull();
  });

  it('hidden for anyone not resting', () => {
    const m = mount(hurt(3));
    m.roster.open('recruit-7');
    expect(m.q('[data-key="treat"]')).toBeNull();
    m.roster.open('recruit-1');
    expect(m.q('[data-key="treat"]')).toBeNull();
  });

  it('mid-fight: greyed, saying why; no Medicine used', () => {
    const m = mount(hurt(2), false);
    m.roster.open('recruit-6');
    const b = m.q('[data-key="treat"]')!;
    expect(b.disabled).toBe(true);
    expect(b.title).toBe(TREAT_WAIT);
    expect(b.getAttribute('aria-label')).toContain(TREAT_WAIT);
    expect(m.game().medicine).toBe(2);
  });
});
