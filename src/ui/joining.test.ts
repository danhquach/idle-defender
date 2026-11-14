// @vitest-environment jsdom
// Joining the camp in words and on the page (ID-150): the offer tile's cards, its Accept and
// Refuse, the two confirms, and text reaching the page only through textContent.
import { describe, expect, it, vi } from 'vitest';
import { rollWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import { JOBS } from '../core/data.ts';
import { newGame } from '../core/game.ts';
import { createRng } from '../core/rng.ts';
import { createHud, squadStart } from './hud.ts';
import {
  joinCards,
  joinLabel,
  leaveJoinQuestion,
  letGoQuestion,
  letGoText,
  REFUSE_NOTE,
  type JoinCard,
} from './joining.ts';
import { jobLine } from './jobtext.ts';

const noop = () => {};

describe('joining in words (ID-150)', () => {
  it('a card per newcomer: name, level, profession and gun, and what the profession brings', () => {
    const a = recruit(2, 5);
    expect(joinCards({ joining: [a] })).toEqual([
      {
        id: 'recruit-2',
        name: a.name,
        sub: `Lv 1 · ${JOBS[a.job].name} · Pistol`,
        job: jobLine(a.job, 1),
      },
    ]);
    expect(joinCards({})).toEqual([]);
    expect(joinLabel(1)).toBe('Asks to join');
    expect(joinLabel(2)).toBe('2 ask to join');
  });

  it('the leave confirm names who is refused; none with nobody asking', () => {
    const [a, b] = [recruit(7), recruit(8)];
    expect(leaveJoinQuestion({})).toBeNull();
    expect(leaveJoinQuestion({ joining: [a] })).toBe(
      `${a.name} is still asking to join. Go on without answering? They are refused and gone for good.`,
    );
    expect(leaveJoinQuestion({ joining: [a, b] })).toBe(
      `${a.name} and ${b.name} are still asking to join. Go on without answering? Both are refused and gone for good.`,
    );
  });

  it('the let-go confirm: the pistol stays theirs, a stash gun goes back, a full stash says what it throws', () => {
    const d = recruit(7);
    expect(letGoQuestion(d, [])).toBe(
      `Let ${d.name} go? They leave the camp for good. They leave their pistol.`,
    );
    const gun = rollWeapon(createRng(1), 'h1', 'rifle', 'military', 3);
    const old = rollWeapon(createRng(2), 'h2', 'smg', 'rusty', 1);
    const armed = { ...d, loadout: { primary: gun, secondary: null, item: null } };
    expect(letGoQuestion(armed, [old])).toBe(
      `Let ${d.name} go? They leave the camp for good. Their Lv 3 Military Carbine goes back to the stash. The stash is full: Lv 1 Rusty SMG will be thrown away.`,
    );
    expect(letGoText('Ava')).toBe('Ava has left the camp.');
  });
});

describe('the offer tile on the page (ID-150)', () => {
  function page() {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
    const onJoin = vi.fn();
    h.onJoin(onJoin);
    const g = { ...newGame('horde'), joining: [recruit(2)] };
    g.camp.recruits = 2;
    h.showResult(squadStart(g));
    const tile = () => root.querySelector<HTMLElement>('.tile-join')!;
    return { root, h, onJoin, tile };
  }

  it('Accept and Refuse each send their answer, by id; a hidden panel sends nothing', () => {
    const { h, onJoin, tile, root } = page();
    h.showJoin(joinCards({ joining: [recruit(2)] }));
    const [accept, refuse] = [...tile().querySelectorAll<HTMLButtonElement>('.join-btn')];
    expect(accept!.getAttribute('aria-label')).toBe(`Accept ${recruit(2).name}`);
    accept!.click();
    refuse!.click();
    expect(onJoin.mock.calls).toEqual([
      ['recruit-2', true],
      ['recruit-2', false],
    ]);
    root.querySelector<HTMLElement>('.hud-result')!.hidden = true;
    accept!.click();
    expect(onJoin).toHaveBeenCalledTimes(2);
  });

  it('nobody left asking hides the tile', () => {
    const { h, tile } = page();
    h.showJoin(joinCards({ joining: [recruit(2)] }));
    expect(tile().hidden).toBe(false);
    // Refuse is permanent, said before any answer.
    expect(tile().querySelector('.join-note')!.textContent).toBe(REFUSE_NOTE);
    h.showJoin([]);
    expect(tile().hidden).toBe(true);
  });

  it('hostile text stays text: no markup, no element, the bidi mark kept as a character', () => {
    const { h, tile } = page();
    const hostile: JoinCard = {
      id: 'recruit-2',
      name: '<img src=x onerror=alert(1)>',
      sub: '<script>alert(1)</script>',
      job: 'A‮B',
    };
    h.showJoin([hostile]);
    expect(tile().querySelector('img, script')).toBeNull();
    expect(tile().querySelector('.tile-name')!.textContent).toBe(hostile.name);
    expect(tile().querySelector('.join-job')!.textContent).toBe('A‮B');
  });
});
