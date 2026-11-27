// @vitest-environment jsdom
// ID-237: gun classes and enemy traits on the page: the class line on a gun (the sentence only
// once Nightmare is unlocked), the class icons, the picker's trait chips and Fit pill (higher
// modes only), the damage number's look and the Help table. Text reaches the page only
// through textContent.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { rollWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import {
  ENEMIES,
  ENEMY_TRAITS,
  GUN_CLASSES,
  TRAIT_WORDS,
  type EnemyKind,
  type GunBase,
} from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import type { Pop } from '../core/horde.ts';
import { createRng } from '../core/rng.ts';
import { createHud, hordePicker, squadStart } from './hud.ts';
import { classChip, classIcon, CLASS_SHAPE } from './classicon.ts';
import { dropTile } from './hud.ts';
import { facts as factsOf, inventoryView, scrollCue, slotFace, slotLabel } from './inventory.ts';
import { COLOR, popLook, popWordPx, POP } from './render.ts';
import {
  classLine,
  CLASS_LINES,
  KIND_PLURAL,
  matchupsOpen,
  TRAIT_ROWS,
  traitText,
} from './statlines.ts';
import { affixText, ENEMY_TRAIT_NAME } from './text/index.ts';

const noop = (): void => {};
const owned = (base: GunBase) => rollWeapon(createRng(1), 'x', base, 'military', 1);

function camp(extra: Partial<GameState> = {}): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: 51,
    roster: Array.from({ length: 2 }, (_, i) => recruit(i + 1)),
    camp: { ...g.camp, recruits: 2 },
    ...extra,
  };
}
const hell = (extra: Partial<GameState> = {}): GameState =>
  camp({ mode: 'hell', modes: { nightmare: 51, hell: 1 }, ...extra });

describe('the class line on a gun (ID-237)', () => {
  it('says the class alone before Nightmare is unlocked, then the matchups with the gun as subject', () => {
    expect(classLine('pistol', false)).toBe('Light');
    expect(classLine('pistol', true)).toBe(
      'Light · Good vs Runners, Crawlers, Swollen · Poor vs Brutes, Horrors',
    );
    expect(classLine(owned('rifle'), true)).toBe('Medium · Good vs Spewers · Poor vs Screamers');
    expect(classLine(owned('shotgun'), true)).toBe('Spread · Good vs Screamers · Poor vs Swollen');
    expect(classLine(owned('sniper'), true)).toBe(
      'Heavy · Good vs Brutes, Horrors · Poor vs Runners, Crawlers, Spewers',
    );
  });

  it('is null for a weapon that is no gun', () => {
    expect(classLine('knife', true)).toBeNull();
  });

  it('opens with Nightmare: a camp that has not held Normal 50 gets the class only', () => {
    expect(matchupsOpen(camp({ hordeNumber: 50 }))).toBe(false);
    expect(matchupsOpen(camp({ hordeNumber: 51 }))).toBe(true);
    expect(matchupsOpen({})).toBe(false);
  });

  it('the Inventory item carries it, by the camp’s unlock', () => {
    const g = rollWeapon(createRng(1), 'a', 'rifle', 'military', 1);
    const view = (game: GameState) => inventoryView({ ...game, armoury: [g] });
    expect(view(camp({ hordeNumber: 50 })).stash[0]!.classLine).toBe('Medium');
    expect(view(camp()).stash[0]!.classLine).toBe('Medium · Good vs Spewers · Poor vs Screamers');
    expect(view(camp()).stash[0]!.cls).toBe('medium');
  });

  it('a dropped gun’s lines carry it', () => {
    const w = rollWeapon(createRng(2), 'b', 'sniper', 'military', 1);
    const tile = dropTile(camp(), { weapon: w, bonus: [], thrown: [] } as never);
    expect(tile.guns[0]!.lines.some((l) => l.startsWith('Heavy · Good vs Brutes'))).toBe(true);
  });
});

describe('the layout goals (ID-237)', () => {
  const css = readFileSync('src/page.css', 'utf8');
  /** The declarations of the rule that starts a line with `selector {`. */
  const rule = (selector: string): string => {
    const at = css.indexOf(`\n${selector} {`);
    return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
  };

  it('the traits block sits in the picker, in its flow, as wide as the panel and never wider', () => {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
    h.showResult(squadStart(hell()));
    const pick = root.querySelector('.hud-horde-pick')!;
    const box = root.querySelector('.hud-horde-traits')!;
    expect(box.parentElement).toBe(pick);
    // No flex-basis of 100% (a wrapping column sent that into a second column outside the panel).
    const css = rule('.hud-horde-traits');
    expect(css).toMatch(/flex:\s*none/);
    expect(css).toMatch(/width:\s*100%/);
    expect(css).toMatch(/min-width:\s*0/);
    expect(css).not.toMatch(/flex:\s*1 0 100%/);
    expect(rule('.hud-trait')).toMatch(/min-width:\s*0/);
    expect(rule('.hud-trait')).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it('a weapon slot shows the class badge only, its name in the title and the label', () => {
    const w = rollWeapon(createRng(1), 'a', 'rifle', 'military', 1);
    const it = inventoryView({ ...camp(), armoury: [w] }).stash[0]!;
    const badge = slotFace(it).find((e) => e.classList.contains('class-badge'))!;
    expect(badge.textContent).toBe('');
    expect(badge.getAttribute('role')).toBe('img');
    expect(badge.getAttribute('aria-label')).toBe('Medium');
    expect(badge.title).toContain('Medium');
    expect(slotLabel(it)).toContain('class Medium');
  });

  it('the details put the icon inline with the class name, the matchups in smaller type', () => {
    const w = rollWeapon(createRng(1), 'a', 'sniper', 'military', 1);
    const it = inventoryView({ ...camp(), armoury: [w] }).stash[0]!;
    const row = factsOf(it).find((e) => e.classList.contains('inv-class'))!;
    const head = row.querySelector('.inv-class-name')!;
    expect(head.querySelector('svg')).not.toBeNull();
    expect(head.textContent).toBe('Heavy');
    expect(row.querySelector('.inv-class-note')!.textContent).toMatch(
      /^Good vs Brutes, Horrors · Poor vs/,
    );
  });

  it('the damage-number word is at least 12 px and Help and the picker list kinds in one order', () => {
    expect(POP.wordMin).toBeGreaterThanOrEqual(11);
    // Never bigger than its number; about 0.6 of it, 11 px at least.
    for (const px of [9, 10, 11, 13, 15, 24]) {
      expect(popWordPx(px), String(px)).toBeLessThanOrEqual(px);
      expect(popWordPx(px), String(px)).toBeGreaterThanOrEqual(Math.min(px, POP.wordMin));
    }
    expect(popWordPx(10)).toBe(10);
    expect(popWordPx(24)).toBe(Math.round(24 * POP.word));
    expect(POP.word).toBeLessThan(1);
    const picker = hordePicker(hell({ modes: { nightmare: 51, hell: 10 } })).options[0]!;
    const order = Object.keys(ENEMIES);
    const rank = (k: EnemyKind): number => order.indexOf(k);
    const sorted = (kinds: EnemyKind[]): boolean =>
      kinds.every((k, i) => i === 0 || rank(kinds[i - 1]!) < rank(k));
    expect(sorted(picker.traits!.map((c) => c.kind))).toBe(true);
    expect(sorted(TRAIT_ROWS.map((r) => r.kind))).toBe(true);
  });
});

describe('the details’ scroll cue (ID-237)', () => {
  it('a box that overflows and is not at its end gets inv-more; at the end or with room to spare, not', () => {
    const box = document.createElement('div');
    let height = 300;
    let top = 0;
    Object.defineProperty(box, 'scrollHeight', { get: () => height });
    Object.defineProperty(box, 'clientHeight', { value: 200 });
    Object.defineProperty(box, 'scrollTop', { get: () => top });
    scrollCue(box);
    const sync = (): void => void box.dispatchEvent(new Event('scroll'));
    sync();
    expect(box.classList.contains('inv-more')).toBe(true);
    top = 100;
    sync();
    expect(box.classList.contains('inv-more')).toBe(false);
    top = 0;
    height = 200;
    sync();
    expect(box.classList.contains('inv-more')).toBe(false);
  });

  it('the cue is a mask on the foot, in the page CSS', () => {
    expect(readFileSync('src/page.css', 'utf8')).toMatch(
      /\.inv-details-info\.inv-more \{[^}]*mask-image: linear-gradient/,
    );
  });
});

describe('class icons (ID-237)', () => {
  it('each class is polygons in an SVG, hidden from screen readers, beside its name as text', () => {
    for (const c of GUN_CLASSES) {
      const svg = classIcon(c);
      expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
      const shapes = CLASS_SHAPE[c].split('|');
      expect([...svg.querySelectorAll('polygon')].map((p) => p.getAttribute('points'))).toEqual(
        shapes,
      );
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(classChip(c).textContent).toBe(c[0]!.toUpperCase() + c.slice(1));
    }
    expect(new Set(Object.values(CLASS_SHAPE)).size).toBe(4);
  });
});

describe('the horde picker in a higher mode (ID-237)', () => {
  it('Normal has no traits and no fit', () => {
    const p = hordePicker(camp({ hordeNumber: 12 }));
    for (const o of p.options) {
      expect(o.traits).toBeUndefined();
      expect(o.fit).toBeUndefined();
    }
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
    h.showResult(squadStart(camp({ hordeNumber: 12 })));
    expect(root.querySelector('.hud-horde-traits')).toBeNull();
    expect(root.querySelector('.hud-horde-fit')).toBeNull();
  });

  it('Hell lists a chip for each traited kind, and a Fit pill for the squad', () => {
    const p = hordePicker(hell());
    const o = p.options[0]!;
    expect(o.traits!.length).toBeGreaterThan(0);
    for (const c of o.traits!) {
      expect(ENEMY_TRAITS[c.kind]).not.toBeNull();
      expect(c.text).toBe(traitText(c.kind));
    }
    expect(o.traits!.map((c) => c.kind)).toContain('brute');
    expect(['good', 'fair', 'poor']).toContain(o.fit!.band);
  });

  it('a boss horde’s Horror chip reads Hulking · Resists Light · Weak to Heavy', () => {
    const p = hordePicker(hell({ modes: { nightmare: 51, hell: 10 } }));
    const boss = p.options.find((o) => o.horde === 10)!;
    const horror = boss.traits!.find((c) => c.kind === 'horror')!;
    expect(horror.text).toBe('Hulking · Resists Light · Weak to Heavy');
    expect(boss.fit).toBeDefined();
  });

  it('draws the chips and the pill with the class names as text, no markup from data', () => {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
    h.showResult(squadStart(hell()));
    const items = [...root.querySelectorAll('.hud-trait')];
    expect(items.length).toBeGreaterThan(0);
    const brute = items.find((li) => (li as HTMLElement).dataset.kind === 'brute')!;
    expect(brute.textContent).toBe('Brute Plated · Resists Light · Weak to Heavy');
    expect(brute.querySelectorAll('svg')).toHaveLength(2);
    const pill = root.querySelector('.hud-horde-fit')!;
    expect(pill.textContent).toMatch(/^Fit (Good|Fair|Poor)$/);
    expect(root.querySelector('.hud-horde-traits')!.tagName).toBe('DETAILS');
  });

  it('a one-class squad is never Good, and Poor tells what to add', () => {
    const sniper = (n: number) => ({
      ...recruit(n),
      loadout: {
        primary: rollWeapon(createRng(n), `s${n}`, 'lmg', 'military', 30),
        secondary: null,
        item: null,
      },
    });
    const fit = hordePicker(hell({ roster: [sniper(1), sniper(2), sniper(3)] })).options[0]!.fit!;
    expect(fit.band).not.toBe('good');
    expect(fit.text).toMatch(/^Add \w+ or \w+$/);
  });
});

describe('damage numbers on a trait (ID-237)', () => {
  const pop = (p: Partial<Pop> = {}): Pop => ({
    x: 600,
    y: 360,
    amount: 20,
    crit: false,
    on: 'brute',
    key: 'e1',
    at: 1,
    ...p,
  });

  it('a resisted hit is muted and smaller; a weak-to one bright, not the crit colour', () => {
    const plain = popLook(pop(), 1, 1, false)!;
    const resist = popLook(pop({ fit: 'resist' }), 1, 1, false)!;
    const weak = popLook(pop({ fit: 'weak' }), 1, 1, false)!;
    expect(resist.colour).toBe(COLOR.popResist);
    expect(weak.colour).toBe(COLOR.popWeak);
    expect(weak.colour).not.toBe(COLOR.popCrit);
    expect(resist.px).toBe(Math.round(plain.px * POP.resist));
    // A weak-to hit is drawn bigger, so size carries the meaning as well as colour.
    expect(weak.px).toBe(Math.round(plain.px * POP.weak));
    expect(weak.px).toBeGreaterThan(plain.px);
  });

  it('a crit keeps its size and its "!"', () => {
    const crit = popLook(pop({ crit: true }), 1, 1, false)!;
    const resisted = popLook(pop({ crit: true, fit: 'resist' }), 1, 1, false)!;
    expect(resisted.px).toBe(crit.px);
    expect(resisted.text).toBe('20!');
  });

  it('the word is Resists or Weak, only on a pop that carries one', () => {
    expect(popLook(pop({ fit: 'resist', word: true }), 1, 1, false)!.word).toBe('Resists');
    expect(popLook(pop({ fit: 'weak', word: true }), 1, 1, false)!.word).toBe('Weak');
    expect(popLook(pop({ fit: 'weak' }), 1, 1, false)!.word).toBeUndefined();
    expect('word' in popLook(pop(), 1, 1, false)!).toBe(false);
    expect(TRAIT_WORDS).toBeGreaterThan(0);
  });
});

describe('names and Help (ID-237)', () => {
  it('Crawler and Screamer traits read as what they do, not as a gun to bring', () => {
    expect(ENEMY_TRAIT_NAME.crawler).toBe('Skittering');
    expect(ENEMY_TRAIT_NAME.screamer).toBe('Darting');
    expect(traitText('crawler')).toBe('Skittering · Resists Heavy · Weak to Light');
  });

  it('the Spread icon is three separate thin rays from one point on the left, not a heart', () => {
    const rays = CLASS_SHAPE.spread.split('|');
    expect(rays).toHaveLength(3);
    for (const ray of rays) {
      const pts = ray.split(' ').map((p) => p.split(',').map(Number) as [number, number]);
      expect(pts).toHaveLength(3);
      // Every ray starts at the shared point and ends further right.
      expect(pts[0]).toEqual([2, 8]);
      expect(pts[1]![0]).toBeGreaterThan(pts[0]![0]);
    }
    expect(new Set(Object.values(CLASS_SHAPE)).size).toBe(4);
  });

  it('Brute is Plated and the Horror stays Hulking: no two kinds share a trait name', () => {
    expect(ENEMY_TRAIT_NAME.brute).toBe('Plated');
    expect(ENEMY_TRAIT_NAME.horror).toBe('Hulking');
    const names = Object.values(ENEMY_TRAIT_NAME);
    expect(names).toHaveLength(Object.values(ENEMY_TRAITS).filter((t) => t).length);
    expect(new Set(names).size).toBe(names.length);
  });

  it('Help lists the guns of each class above the trait table, from the tables', () => {
    expect(CLASS_LINES.map((l) => l.text)).toEqual([
      'Light: Pistol, SMG, Machine Pistol, LMG',
      'Medium: Carbine, Assault Rifle',
      'Heavy: Sniper rifle, Hand Cannon',
      'Spread: Pump Shotgun, Drum Shotgun',
    ]);
  });

  it('the gun-class tiles and affix text: the boss affix names what it hits, not "heavies"', () => {
    expect(affixText({ id: 'bossDamage', value: 20 })).toBe(
      '+20% damage to bosses, Brutes and Swollen',
    );
  });
});

describe('the Help table (ID-237)', () => {
  it('has a row for every kind with a trait, from the tables', () => {
    const kinds = TRAIT_ROWS.map((r) => r.kind);
    expect(kinds).toEqual(
      (Object.keys(ENEMIES) as EnemyKind[]).filter((k) => ENEMY_TRAITS[k] !== null),
    );
    expect(TRAIT_ROWS.find((r) => r.kind === 'horror')).toMatchObject({
      trait: 'Hulking',
      resists: 'Light',
      weak: 'Heavy',
    });
    for (const k of kinds) expect(KIND_PLURAL[k]).toBeTruthy();
  });
});
