// @vitest-environment jsdom
// Joining the camp in words and on the page (ID-150): the offer line's cards, its Accept and
// Refuse, the two confirms, and text reaching the page only through textContent.
import { describe, expect, it, vi } from 'vitest';
import { rollWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import { JOBS } from '../core/data.ts';
import { newGame } from '../core/game.ts';
import { createRng } from '../core/rng.ts';
import { createHud, squadStart } from './hud.ts';
import {
  combineQuestion,
  combineText,
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
        profession: JOBS[a.job].name,
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

  it('the combine confirm (ID-170): who leaves, the XP and levels, the gun, a full stash', () => {
    const k = { ...recruit(1), xp: 0 };
    const f = recruit(7);
    expect(combineQuestion(k, f, 25, [])).toBe(
      `Combine ${f.name} into ${k.name}? ${f.name} (Lv 1) leaves the camp for good. ${k.name} gains 25 XP (Lv 1 → 2). The free pistol goes with them.`,
    );
    const gun = rollWeapon(createRng(1), 'h1', 'rifle', 'military', 3);
    const old = rollWeapon(createRng(2), 'h2', 'smg', 'rusty', 1);
    const armed = { ...f, loadout: { primary: gun, secondary: null, item: null } };
    expect(combineQuestion(k, armed, 10, [old])).toBe(
      `Combine ${f.name} into ${k.name}? ${f.name} (Lv 1) leaves the camp for good. ${k.name} gains 10 XP (stays Lv 1). ${f.name}'s Lv 3 Military Carbine goes back to the stash. The stash is full: Lv 1 Rusty SMG will be thrown away.`,
    );
    expect(combineText('Ava', 'Ben', 25)).toBe('Ava took in Ben: +25 XP.');
  });
});

describe('the offer line on the page (ID-150, ID-196)', () => {
  function page() {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
    const onJoin = vi.fn();
    h.onJoin(onJoin);
    const g = { ...newGame('horde'), joining: [recruit(2)] };
    g.camp.recruits = 2;
    h.showResult(squadStart(g));
    const tile = () => root.querySelector<HTMLElement>('.debrief-join')!;
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

  it('nobody left asking hides the box', () => {
    const { h, tile } = page();
    h.showJoin(joinCards({ joining: [recruit(2)] }));
    expect(tile().hidden).toBe(false);
    // Refuse is permanent, said on its button before any answer.
    expect(tile().querySelectorAll<HTMLButtonElement>('.join-btn')[1]!.title).toBe(REFUSE_NOTE);
    h.showJoin([]);
    expect(tile().hidden).toBe(true);
  });

  it('hostile text stays text: no markup, no element, the bidi mark kept as a character', () => {
    const { h, tile } = page();
    const hostile: JoinCard = {
      id: 'recruit-2',
      name: '<img src=x onerror=alert(1)>',
      profession: 'Hunter',
      sub: '<script>alert(1)</script>',
      job: 'A\u202eB',
    };
    h.showJoin([hostile]);
    expect(tile().querySelector('img, script')).toBeNull();
    expect(tile().querySelector('.join-name')!.textContent).toBe(hostile.name);
    // The job is on the Accept button's hover title, the name and sub on the line's.
    expect(tile().querySelector<HTMLButtonElement>('.join-btn')!.title).toBe('A\u202eB');
    expect(tile().querySelector<HTMLElement>('.join-who')!.title).toBe(
      '<script>alert(1)</script>. A\u202eB',
    );
  });
});
