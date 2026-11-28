// @vitest-environment jsdom
// ID-263: the Research Center window (a chart and a detail panel), its top-bar button and dot, and
// the texts of a purchase. The buying rules are in core/techtree.test.ts; the app's confirm and
// fight rules in app-research.test.ts. Text reaches the page only through textContent.
import { describe, expect, it } from 'vitest';
import { TECH, TECH_IDS, TECH_TABS, type TechId } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import {
  createResearchCenter,
  KIT_NOTE,
  nodeFace,
  RESEARCH_WAIT,
  researchOffer,
  researchQuestion,
  researchText,
  tabLabel,
  tabNodes,
  upgradesLabel,
  type ResearchOptions,
  type ResearchState,
} from './researchcenter.ts';
import { flush } from './testing.ts';
import { TECH_EFFECT } from './text/index.ts';

const game = (scrap: number, tech: TechId[] = []): GameState => {
  const g = newGame('horde');
  return { ...g, stock: { ...g.stock, scrap }, ...(tech.length > 0 ? { tech } : {}) };
};

function mount(initial: GameState, canBuy = true, onResearch?: ResearchOptions['onResearch']) {
  document.body.replaceChildren();
  const root = document.createElement('div');
  document.body.append(root);
  const st: ResearchState = { game: initial, canBuy, resumes: false };
  const calls: TechId[] = [];
  const rc = createResearchCenter(root, {
    state: () => st,
    onResearch:
      onResearch ??
      ((id) => {
        calls.push(id);
        return { ok: true, text: 'done' };
      }),
  });
  const q = <T extends Element = HTMLElement>(sel: string): T => document.querySelector<T>(sel)!;
  return { rc, st, calls, q, root };
}
const node = (id: TechId) =>
  document.querySelector<HTMLButtonElement>(`.research-node[data-id="${id}"]`)!;

describe('texts', () => {
  it('the tab says what is done', () => {
    expect(upgradesLabel(3, 14)).toBe('Upgrades · 3/14');
    const { rc, st, q } = mount(game(0));
    rc.open();
    expect(document.querySelector('.camp-tab')!.textContent).toBe('Upgrades · 0/14');
    st.game = game(0, ['razor-wire', 'thick-coils', 'reinforced-wall']);
    rc.refresh();
    expect(q('.camp-tab').textContent).toBe('Upgrades · 3/14');
  });

  it('a node’s face: price, progress when short, tick when done, the prerequisite when locked', () => {
    expect(nodeFace(game(600), 'steel-plating')).toEqual({
      state: 'locked',
      text: 'Needs Reinforced Wall',
    });
    expect(nodeFace(game(600, ['reinforced-wall']), 'steel-plating')).toEqual({
      state: 'open',
      text: '600 Scrap',
    });
    expect(nodeFace(game(599, ['reinforced-wall']), 'steel-plating')).toEqual({
      state: 'short',
      text: '599/600 Scrap',
    });
    expect(nodeFace(game(0, ['reinforced-wall']), 'reinforced-wall')).toEqual({
      state: 'done',
      text: '✓ Researched',
    });
    expect(nodeFace(game(1800), 'spiked-wall').state).toBe('locked');
    expect(nodeFace(game(1200), 'razor-wire').text).toBe('200 Scrap');
    expect(nodeFace(game(1200, ['razor-wire', 'thick-coils']), 'electric-wire').text).toBe(
      '1,200/1,500 Scrap',
    );
  });

  it('the confirm: Tier 1 and 2 ask the price, Tier 3 and 4 repeat the effect (and every Ammo & throwables node and Hand-loads, ID-284)', () => {
    expect(researchQuestion('reinforced-wall', 200, 2340)).toBe(
      'Research Reinforced Wall for 200 Scrap? You have 2,340.',
    );
    expect(researchQuestion('steel-plating', 600, 2340)).toBe(
      'Research Steel Plating for 600 Scrap? You have 2,340.',
    );
    expect(researchQuestion('spiked-wall', 1500, 3100)).toBe(
      "Research Spiked Wall for 1,500 Scrap? Crawlers climbing the wall lose 20% of a Shambler's HP a second. You have 3,100.",
    );
    for (const id of TECH_IDS) {
      const asks = researchQuestion(id, TECH[id].cost, 9999);
      const repeats = TECH[id].tier >= 3 || id === 'hand-loads' || tabNodes('kit').includes(id);
      expect(asks.includes(TECH_EFFECT[id]), id).toBe(repeats);
    }
  });

  it('the status line after a purchase', () => {
    expect(researchText('steel-plating', 600, 1740)).toBe(
      'Researched Steel Plating · 600 Scrap spent, 1,740 left.',
    );
  });
});

describe('the Research button for a node', () => {
  it('affordable, short (progress), locked, done, and in a fight', () => {
    const open = game(600, ['reinforced-wall']);
    expect(researchOffer(open, 'steel-plating', true)).toMatchObject({
      text: 'Research · 600 Scrap',
      disabled: false,
      title: '',
      wait: '',
      hidden: false,
    });
    expect(researchOffer(game(100, ['reinforced-wall']), 'steel-plating', true)).toMatchObject({
      text: 'Research · 100/600 Scrap',
      disabled: true,
      title: 'Needs 600 Scrap',
    });
    expect(researchOffer(game(9999), 'steel-plating', true)).toMatchObject({
      text: 'Needs Reinforced Wall',
      disabled: true,
    });
    expect(researchOffer(game(0, ['razor-wire']), 'razor-wire', true).hidden).toBe(true);
    expect(researchOffer(open, 'steel-plating', false)).toMatchObject({
      disabled: true,
      title: RESEARCH_WAIT,
      wait: 'Research between hordes',
    });
    expect(RESEARCH_WAIT).toBe('Research between hordes');
  });
});

describe('Tier 4 combos (ID-264)', () => {
  const PARENTS: TechId[] = ['reinforced-wall', 'steel-plating', 'spiked-wall'];
  it('a combo node has a purple edge (data-combo), a fourth column and "Needs X + Y" while locked', () => {
    const { rc } = mount(game(99999));
    rc.open();
    for (const id of ['wall-machine-gun', 'shock-net', 'tar-moat'] as const) {
      expect(node(id).dataset.combo, id).toBe('true');
      expect(node(id).style.gridColumn).toBe('5');
    }
    expect(node('spiked-wall').dataset.combo).toBeUndefined();
    expect(node('wall-machine-gun').textContent).toContain('Needs Armour + Spiked');
    expect(node('shock-net').textContent).toContain('Needs Electric + Steel');
    expect(node('tar-moat').textContent).toContain('Needs Napalm + Spiked');
    expect(node('tar-moat').dataset.state).toBe('locked');
  });

  it('the detail shows a tick or a circle for each parent, and the combo opens with both', () => {
    const { rc, q, st } = mount(game(99999, PARENTS));
    rc.open();
    node('wall-machine-gun').click();
    expect(q('.research-needs').textContent).toBe('Needs: ○ Armour-piercing + ✓ Spiked Wall');
    expect(node('wall-machine-gun').dataset.state).toBe('locked');
    st.game = game(99999, [...PARENTS, 'hand-loads', 'armour-piercing']);
    rc.refresh();
    expect(q('.research-needs').textContent).toBe('Needs: ✓ Armour-piercing + ✓ Spiked Wall');
    expect(node('wall-machine-gun').dataset.state).toBe('open');
    expect(q('.research-meta').textContent).toBe('Tier 4 · Ammo');
    expect(q('.research-unlocks').textContent).toBe('Unlocks: nothing yet');
    expect(node('shock-net').dataset.state).toBe('locked');
  });

  it('combo lines run at right angles through the gutters, faint until their node is selected, hovered or a parent', () => {
    const { rc, q } = mount(game(99999, PARENTS));
    rc.open();
    const path = (from: string, to: string) =>
      document.querySelector<SVGElement>(`.research-lines [data-from="${from}"][data-to="${to}"]`)!;
    for (const l of document.querySelectorAll<SVGElement>('.research-lines [data-combo]')) {
      expect(l.tagName.toLowerCase()).toBe('path');
      // Only moves along an axis: M, H and V, never a slanted L.
      expect(l.getAttribute('d')).toMatch(/^M [\d. ]+( [HV] [\d. ]+)+$/);
    }
    // Armour-piercing runs straight along the Ammo row to the gun; the others bend.
    expect(path('armour-piercing', 'wall-machine-gun').getAttribute('d')).not.toMatch(/V/);
    expect(path('spiked-wall', 'wall-machine-gun').getAttribute('d')).toMatch(/V/);
    // Each bent line has its own trunk in the gutter before Tier 4 (x about 3), none shared.
    const trunks = [
      'spiked-wall>wall-machine-gun',
      'spiked-wall>tar-moat',
      'steel-plating>shock-net',
    ].map((e) => {
      const [f, t] = e.split('>');
      return /H ([\d.]+) V [\d.]+ H [\d.]+$/.exec(path(f!, t!).getAttribute('d')!)![1];
    });
    expect(new Set(trunks).size).toBe(3);
    for (const x of trunks) expect(Math.abs(Number(x) - 3)).toBeLessThanOrEqual(0.06);
    // The selected node's lines are active, the others faint.
    node('wall-machine-gun').click();
    const active = (l: SVGElement) => l.dataset.active;
    expect(active(path('armour-piercing', 'wall-machine-gun'))).toBe('true');
    expect(active(path('spiked-wall', 'wall-machine-gun'))).toBe('true');
    expect(active(path('spiked-wall', 'tar-moat'))).toBe('false');
    node('tar-moat').dispatchEvent(new Event('pointerenter'));
    expect(active(path('spiked-wall', 'tar-moat'))).toBe('true');
    node('tar-moat').dispatchEvent(new Event('pointerleave'));
    expect(active(path('spiked-wall', 'tar-moat'))).toBe('false');
    // Parent lines are active too: Spiked Wall lights both its combos.
    node('spiked-wall').click();
    expect(active(path('spiked-wall', 'tar-moat'))).toBe('true');
    expect(q('.research-chart')).not.toBeNull();
  });

  it('the parent still missing is bold in the detail, a researched one is not', () => {
    const { rc, q } = mount(game(99999, PARENTS));
    rc.open();
    node('wall-machine-gun').click();
    const bold = [...q('.research-needs').querySelectorAll('strong')].map((s) => s.textContent);
    expect(bold).toEqual(['○ Armour-piercing']);
  });

  it('the confirm repeats the card’s effect, and the tab counts n/14', () => {
    const asks = researchQuestion('shock-net', 5500, 6000);
    expect(asks).toBe(
      `Research Shock Net for 5,500 Scrap? ${TECH_EFFECT['shock-net']} You have 6,000.`,
    );
    expect(upgradesLabel(14, 14)).toBe('Upgrades · 14/14');
  });
});

describe('the window', () => {
  it('draws 14 nodes in 4 branches (3, 4, 3, 4), each with its state in words', () => {
    const { rc, q } = mount(game(300, ['reinforced-wall']));
    rc.open();
    expect(document.querySelectorAll('.research-node').length).toBe(14);
    const rows = new Map<string, number>();
    for (const n of document.querySelectorAll<HTMLElement>('.research-node')) {
      rows.set(n.style.gridRow, (rows.get(n.style.gridRow) ?? 0) + 1);
    }
    expect([...rows.values()]).toEqual([3, 4, 3, 4]);
    expect(node('reinforced-wall').dataset.state).toBe('done');
    expect(node('reinforced-wall').textContent).toContain('✓ Researched');
    expect(node('quick-mortars').dataset.state).toBe('open');
    expect(node('quick-mortars').textContent).toContain('300 Scrap');
    expect(node('steel-plating').dataset.state).toBe('short');
    expect(node('steel-plating').textContent).toContain('300/600 Scrap');
    expect(node('thick-coils').dataset.state).toBe('locked');
    expect(node('thick-coils').textContent).toContain('Needs Razor Wire');
    expect(q('.research-chart').textContent).toContain('Tier 4');
    // The phone shell leaves "Needs " and " Scrap" out by their own spans; the words stay whole.
    const face = (id: Parameters<typeof node>[0]) => node(id).querySelector('.research-node-face')!;
    expect(face('thick-coils').querySelector('.research-face-lead')!.textContent).toBe('Needs ');
    expect(face('quick-mortars').querySelector('.research-face-unit')!.textContent).toBe(' Scrap');
    expect(face('reinforced-wall').children).toHaveLength(0);
  });

  it('draws one connector line per prerequisite, green once its source is researched', () => {
    const edges = tabNodes('upgrades').flatMap((id) => TECH[id].needs.map((from) => [from, id]));
    const { rc } = mount(game(0, ['razor-wire']));
    rc.open();
    const lines = [...document.querySelectorAll<SVGElement>('.research-lines [data-from]')];
    expect(lines.length).toBe(edges.length);
    expect(lines.length).toBe(13);
    // A combo has a line from each of its two parents, marked as a combo's.
    const combo = lines
      .filter((l) => l.dataset.combo === 'true')
      .map((l) => `${l.dataset.from}>${l.dataset.to}`);
    expect(combo.sort()).toEqual(
      [
        'armour-piercing>wall-machine-gun',
        'spiked-wall>wall-machine-gun',
        'electric-wire>shock-net',
        'steel-plating>shock-net',
        'napalm-mortar>tar-moat',
        'spiked-wall>tar-moat',
      ].sort(),
    );
    for (const l of lines) {
      expect(l.dataset.done, `${l.dataset.from} → ${l.dataset.to}`).toBe(
        String(l.dataset.from === 'razor-wire'),
      );
    }
    expect(document.querySelector('.research-lines')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('the first open selects the first node that can be bought, and the panel shows its fields', () => {
    const { rc, q } = mount(game(1000, ['reinforced-wall']));
    rc.open();
    // The first open node in chart order (an open one, however much Scrap it needs).
    expect(node('steel-plating').getAttribute('aria-pressed')).toBe('true');
    expect(node('reinforced-wall').getAttribute('aria-pressed')).toBe('false');
    expect(q('.research-name').textContent).toBe('Steel Plating');
    node('razor-wire').click();
    expect(q('.research-name').textContent).toBe('Razor Wire');
    expect(q('.research-meta').textContent).toBe('Tier 1 · Barbed Wire');
    expect(q('.research-effect').textContent).toBe("Barbed Wire's bleed +25%.");
    expect(q('.research-needs').textContent).toBe('Needs: nothing');
    expect(q('.research-unlocks').textContent).toBe('Unlocks: Thick Coils');
    node('steel-plating').click();
    expect(q('.research-needs').textContent).toBe('Needs: ✓ Reinforced Wall');
    expect(q('.research-unlocks').textContent).toBe('Unlocks: Spiked Wall, Shock Net');
    node('thick-coils').click();
    expect(q('.research-needs').textContent).toBe('Needs: ○ Razor Wire');
    node('spiked-wall').click();
    expect(q('.research-unlocks').textContent).toBe('Unlocks: Wall Machine Gun, Tar Moat');
    expect(q('.research-go').textContent).toBe('Needs Steel Plating');
    expect((q('.research-go') as HTMLButtonElement).disabled).toBe(true);
    // The panel is announced as it changes.
    expect(q('.research-detail').getAttribute('aria-live')).toBe('polite');
  });

  it('a bought node shows "✓ Researched" in place of the button', () => {
    const { rc, q } = mount(game(0, ['hand-loads']));
    rc.open();
    node('hand-loads').click();
    expect(document.querySelector('.research-go')).toBeNull();
    expect(q('.research-done').textContent).toBe('✓ Researched');
  });

  it('in a fight the button is greyed with its reason in words under it', () => {
    const { rc, q } = mount(game(5000), false);
    rc.open();
    node('reinforced-wall').click();
    expect((q('.research-go') as HTMLButtonElement).disabled).toBe(true);
    expect(q('.research-wait').textContent).toBe('Research between hordes');
  });

  it('Hand-loads says what it does now, and Armour-piercing names the five cards (ID-284)', () => {
    const { rc, q } = mount(game(500));
    rc.open();
    node('hand-loads').click();
    expect(q('.research-effect').textContent).toContain('first round');
    expect(q('.research-effect').textContent).toContain('×3.25');
    expect(q('.research-effect').textContent).not.toContain('Heavy Rounds');
    node('armour-piercing').click();
    for (const card of [
      'Heavy Rounds',
      'Incendiary Rounds',
      'Shock Rounds',
      'Piercing Rounds',
      'Scavenged Ammo',
    ]) {
      expect(q('.research-effect').textContent).toContain(card);
    }
  });

  it('a purchase: yes shows the answer on the status line and redraws; no changes nothing; a refusal is flagged', async () => {
    let answer: ReturnType<ResearchOptions['onResearch']> = { ok: true, text: 'Researched X' };
    const { rc, st, q } = mount(game(1000), true, () => answer);
    rc.open();
    q<HTMLButtonElement>('.research-go').click();
    await flush();
    expect(q('.research-status').textContent).toBe('Researched X');
    expect(q('.research-status').dataset.tone).toBeUndefined();
    st.game = game(800, ['reinforced-wall']);
    answer = null;
    node('razor-wire').click();
    q<HTMLButtonElement>('.research-go').click();
    await flush();
    expect(q('.research-status').textContent).toBe('Researched X');
    answer = { ok: false, reason: 'Needs 200 Scrap' };
    q<HTMLButtonElement>('.research-go').click();
    await flush();
    expect(q('.research-status').textContent).toBe('Needs 200 Scrap');
    expect(q('.research-status').dataset.tone).toBe('refused');
  });

  it('follows the camp while open: a changed game or a fight redraws the chart', () => {
    const { rc, st, q } = mount(game(0, ['reinforced-wall']));
    rc.open();
    expect(node('steel-plating').dataset.state).toBe('short');
    st.game = game(700, ['reinforced-wall']);
    rc.refresh();
    expect(node('steel-plating').dataset.state).toBe('open');
    node('steel-plating').click();
    expect((q('.research-go') as HTMLButtonElement).disabled).toBe(false);
    st.canBuy = false;
    rc.refresh();
    expect((q('.research-go') as HTMLButtonElement).disabled).toBe(true);
    st.resumes = true;
    rc.refresh();
    expect(q('.camp-done').textContent).toBe('Resume');
  });

  it('puts no HTML in the page: every label goes in as text', () => {
    const { rc } = mount(game(0));
    rc.open();
    expect(document.querySelectorAll('.research-body img, .research-body script').length).toBe(0);
    for (const n of document.querySelectorAll('.research-node')) {
      // The name, the face and, inside it, the "Needs " and " Scrap" spans: text, never markup.
      for (const e of n.querySelectorAll('*')) {
        expect(e.tagName).toBe('SPAN');
        expect(e.children.length === 0 || e.classList.contains('research-node-face')).toBe(true);
      }
    }
  });
});

describe('the chart on a narrow window', () => {
  it('fades its inline end while more is out of sight, and not once at the end', () => {
    const { rc } = mount(game(0));
    rc.open();
    const scroll = document.querySelector<HTMLElement>('.research-scroll')!;
    const size = (client: number, full: number, left: number): void => {
      Object.defineProperty(scroll, 'clientWidth', { value: client, configurable: true });
      Object.defineProperty(scroll, 'scrollWidth', { value: full, configurable: true });
      scroll.scrollLeft = left;
      scroll.dispatchEvent(new Event('scroll'));
    };
    size(300, 444, 0);
    expect(scroll.dataset.more).toBe('true');
    size(300, 444, 144);
    expect(scroll.dataset.more).toBe('false');
    size(500, 444, 0);
    expect(scroll.dataset.more).toBe('false');
  });
});

describe('the top-bar button and its dot', () => {
  const dotOn = (): boolean => !document.querySelector<HTMLElement>('.research-dot')!.hidden;

  it('is labelled Research, opens the window, and the dot follows what is affordable', () => {
    const { rc, st, q } = mount(game(0));
    rc.refresh();
    expect(q('.research-button').getAttribute('aria-label')).toBe('Research');
    expect(q('.research-label').textContent).toBe('Research');
    expect(q('.research-button').getAttribute('aria-haspopup')).toBe('dialog');
    expect(dotOn()).toBe(false);
    st.game = game(200);
    rc.refresh();
    expect(dotOn()).toBe(true);
    expect(q('.research-button').getAttribute('aria-label')).toBe(
      'Research, an upgrade is affordable',
    );
    // Off in a fight, whatever the Scrap.
    st.canBuy = false;
    rc.refresh();
    expect(dotOn()).toBe(false);
    // Off with everything researched, on again once Scrap rises past an open node's price.
    st.canBuy = true;
    st.game = game(1e6, [...TECH_IDS]);
    rc.refresh();
    expect(dotOn()).toBe(false);
    st.game = game(199, ['reinforced-wall', 'razor-wire', 'hand-loads', 'quick-mortars']);
    rc.refresh();
    expect(dotOn()).toBe(false);
    st.game = game(300, ['reinforced-wall', 'razor-wire', 'hand-loads', 'quick-mortars']);
    rc.refresh();
    expect(dotOn()).toBe(false);
    st.game = game(600, ['reinforced-wall', 'razor-wire', 'hand-loads', 'quick-mortars']);
    rc.refresh();
    expect(dotOn()).toBe(true);
    q('.research-button').click();
    expect(rc.isOpen()).toBe(true);
  });
});

describe('the Ammo & throwables tab (ID-284)', () => {
  const kitTab = (): HTMLButtonElement =>
    document.querySelector<HTMLButtonElement>('#camp-tab-kit')!;
  const openKit = (initial: GameState) => {
    const m = mount(initial);
    m.rc.open();
    kitTab().click();
    return m;
  };

  it('is a second tab with its own count; the Upgrades tab still counts its 14', () => {
    expect(tabLabel('kit', 2, 18)).toBe('Ammo & throwables · 2/18');
    expect(tabNodes('upgrades')).toHaveLength(14);
    expect(tabNodes('kit')).toHaveLength(18);
    const { rc, st } = mount(game(0));
    rc.open();
    const tabs = [...document.querySelectorAll('.camp-tab')].map((t) => t.textContent);
    expect(tabs).toEqual(['Upgrades · 0/14', 'Ammo & throwables · 0/18']);
    st.game = game(0, ['razor-wire', 'incendiary-rounds', 'incendiary-rounds-mk2', 'molotov']);
    rc.refresh();
    expect([...document.querySelectorAll('.camp-tab')].map((t) => t.textContent)).toEqual([
      'Upgrades · 1/14',
      'Ammo & throwables · 3/18',
    ]);
  });

  it('draws 18 nodes in 6 rows (the cards) and 3 columns headed Unlock, Mk II, Mk III', () => {
    openKit(game(900));
    const nodes = [...document.querySelectorAll<HTMLElement>('#camp-panel-kit .research-node')];
    expect(nodes.map((n) => n.dataset.id)).toHaveLength(18);
    const rows = new Map<string, string[]>();
    for (const n of nodes) {
      rows.set(n.style.gridRow, [...(rows.get(n.style.gridRow) ?? []), n.style.gridColumn]);
    }
    expect([...rows.keys()]).toEqual(['2', '3', '4', '5', '6', '7']);
    for (const cols of rows.values()) expect(cols).toEqual(['2', '3', '4']);
    const heads = [...document.querySelectorAll('#camp-panel-kit .research-tier')].map(
      (h) => h.textContent,
    );
    expect(heads).toEqual(['Unlock', 'Mk II', 'Mk III']);
    const rowNames = [...document.querySelectorAll('#camp-panel-kit .research-branch')].map(
      (h) => h.textContent,
    );
    expect(rowNames).toEqual(['Incendiary', 'Shock', 'Toxin', 'Frag', 'Flashbang', 'Molotov']);
    expect(
      document.querySelector('#camp-panel-kit [data-id="toxin-rounds"] .research-node-name')!
        .textContent,
    ).toBe('Toxin Rounds');
    // The unlock is the card's name, the chain's others its Mk.
    expect(
      document.querySelector('#camp-panel-kit [data-id="frag-grenades"] .research-node-name')!
        .textContent,
    ).toBe('Frag Grenades');
    expect(
      document.querySelector('#camp-panel-kit [data-id="flashbang-mk3"] .research-node-name')!
        .textContent,
    ).toBe('Flashbang Mk III');
    // No Tier 4 anywhere on it.
    expect(document.querySelector('#camp-panel-kit .research-chart')!.textContent).not.toContain(
      'Tier',
    );
    expect(document.querySelector('#camp-panel-kit .research-meta')!.textContent).toMatch(
      /^(Unlock|Mk II|Mk III) · /,
    );
  });

  it('draws one line per prerequisite of its own nodes, in a 3 by 6 box', () => {
    openKit(game(900, ['incendiary-rounds']));
    const svg = document.querySelector('#camp-panel-kit .research-lines')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 3 6');
    const lines = [...svg.querySelectorAll<SVGElement>('[data-from]')];
    expect(lines).toHaveLength(12);
    for (const l of lines) {
      expect(l.tagName).toBe('line');
      expect(l.dataset.done, `${l.dataset.from}`).toBe(
        String(l.dataset.from === 'incendiary-rounds'),
      );
    }
    // The Upgrades tab keeps its 4 by 4 box.
    document.querySelector<HTMLButtonElement>('#camp-tab-upgrades')!.click();
    expect(
      document.querySelector('#camp-panel-upgrades .research-lines')!.getAttribute('viewBox'),
    ).toBe('0 0 4 4');
  });

  it('says over the chart where an unlock is used', () => {
    openKit(game(0));
    expect(KIT_NOTE).toBe('Pick your starting ammo and throwable on the squad screen.');
    expect(document.querySelector('#camp-panel-kit .research-kit-note')!.textContent).toBe(
      KIT_NOTE,
    );
    expect(document.querySelector('#camp-panel-upgrades .research-kit-note')).toBeNull();
  });

  it('every node on it states its effect in the detail panel and repeats it in the confirm', () => {
    const { q } = openKit(game(99999));
    for (const id of tabNodes('kit')) {
      document.querySelector<HTMLElement>(`#camp-panel-kit [data-id="${id}"]`)!.click();
      expect(q('#camp-panel-kit .research-effect').textContent, id).toBe(TECH_EFFECT[id]);
      expect(researchQuestion(id, TECH[id].cost, 99999), id).toContain(TECH_EFFECT[id]);
      expect(TECH_EFFECT[id], id).not.toBe('');
    }
    expect(TECH_TABS.kit).toHaveLength(6);
  });

  it('an unlock reads the same in the confirm, Mk II and Mk III with their numbers', () => {
    expect(researchQuestion('incendiary-rounds', 500, 2000)).toBe(
      'Research Incendiary Rounds for 500 Scrap? Can be the squad’s starting ammo card. You have 2,000.',
    );
    expect(researchQuestion('frag-grenades-mk3', 3500, 4000)).toContain('32.5%');
    expect(researchQuestion('frag-grenades-mk3', 3500, 4000)).toContain('77 px');
    expect(researchQuestion('flashbang-mk3', 2500, 4000)).toContain('110 px');
    expect(researchQuestion('molotov-mk3', 2500, 4000)).toContain('5 / 7 / 9 s');
    expect(researchQuestion('shock-rounds-mk2', 1000, 4000)).toContain('0.23 / 0.345 / 0.46 s');
    expect(researchQuestion('toxin-rounds', 500, 2000)).toBe(
      'Research Toxin Rounds for 500 Scrap? Can be the squad’s starting ammo card. You have 2,000.',
    );
    expect(researchQuestion('toxin-rounds-mk2', 1000, 4000)).toContain(
      '2.3 / 3.45 / 4.6% of a Shambler’s HP a second) and burst +15% (17.25%)',
    );
    expect(researchQuestion('toxin-rounds-mk3', 2500, 4000)).toContain(
      '2.6 / 3.9 / 5.2%) and burst +30% (19.5%), in place of the +15%',
    );
    expect(researchQuestion('incendiary-rounds-mk2', 1000, 4000)).toContain('3.45 / 6.9 / 10.35%');
  });

  it('buying from it goes through the same confirm, and redraws the tab', async () => {
    const { rc, st, calls, q } = mount(game(600));
    rc.open();
    kitTab().click();
    document.querySelector<HTMLElement>('#camp-panel-kit [data-id="shock-rounds"]')!.click();
    expect(q('#camp-panel-kit .research-go').textContent).toBe(
      'Research · 600/500 Scrap'.replace('600/', ''),
    );
    q('#camp-panel-kit .research-go').click();
    await flush();
    expect(calls).toEqual(['shock-rounds']);
    expect(st.game).toBeDefined();
  });

  it('the window stays open across a tab switch, and closing resets nothing it needs', () => {
    const { rc } = openKit(game(0));
    expect(rc.isOpen()).toBe(true);
    document.querySelector<HTMLButtonElement>('#camp-tab-upgrades')!.click();
    expect(rc.isOpen()).toBe(true);
    rc.close();
    expect(rc.isOpen()).toBe(false);
  });
});
