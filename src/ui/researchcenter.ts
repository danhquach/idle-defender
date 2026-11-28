// The Research Center (ID-263): a chart of the Scrap upgrades, branches as rows and tiers
// left to right, with a detail panel beside it, in a window of its own (a camp window with
// two tabs, "Upgrades" and, since ID-284, "Ammo & throwables"). Browsing works any time; buying
// only between hordes. The buying rules live in core/techtree.ts; this file is the view. Text
// reaches the page only through textContent, and the connector lines are SVG built from the
// table's numbers.
import {
  TECH,
  TECH_IDS,
  TECH_TABS,
  type TechBranch,
  type TechId,
  type TechTab,
} from '../core/data.ts';
import type { GameState } from '../core/game.ts';
import { techOf, techReady, techState, unlocksOf } from '../core/techtree.ts';
import { createCampWindow } from './campwindow.ts';
import type { Answer } from './confirm.ts';
import { el, thousands } from './hud.ts';
import { refusedText, TECH_BRANCH_NAME, TECH_EFFECT, TECH_NAME, TECH_SHORT } from './text/index.ts';

/** Why Research is greyed in a fight. */
export const RESEARCH_WAIT = 'Research between hordes';

/** Each tab's name (ID-284). */
const TAB_NAME: Readonly<Record<TechTab, string>> = {
  upgrades: 'Upgrades',
  kit: 'Ammo & throwables',
};
const TABS = Object.keys(TECH_TABS) as TechTab[];

/** The nodes the tab shows, in table order (each tab counts and draws its own). */
export const tabNodes = (tab: TechTab): TechId[] =>
  TECH_IDS.filter((id) => (TECH_TABS[tab] as readonly TechBranch[]).includes(TECH[id].branch));

/** The tab's name with what is done: "Upgrades · 3/14", "Ammo & throwables · 0/15". */
export const tabLabel = (tab: TechTab, done: number, total: number): string =>
  `${TAB_NAME[tab]} · ${done}/${total}`;
export const upgradesLabel = (done: number, total: number): string =>
  tabLabel('upgrades', done, total);

/** The label of a tab for what the game has researched. */
const labelFor = (tab: TechTab, game: Pick<GameState, 'tech'>): string => {
  const nodes = tabNodes(tab);
  return tabLabel(tab, techOf(game).filter((id) => nodes.includes(id)).length, nodes.length);
};

/** The columns' headers (ID-284): the Upgrades tab's tiers, the other's Unlock then each Mk. */
const COLUMN_NAME: Readonly<Record<TechTab, readonly string[]>> = {
  upgrades: ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4'],
  kit: ['Unlock', 'Mk II', 'Mk III'],
};

/** Where the starting pick is made (ID-284), over the chart of the second tab. */
export const KIT_NOTE = 'Pick your starting ammo and throwable on the squad screen.';

/** A node on the chart: ready (open and affordable), short of Scrap, bought, or locked. */
export type NodeState = 'done' | 'open' | 'short' | 'locked';

/** What a node's face says, and the state it is drawn in; never colour alone. */
export function nodeFace(
  game: Pick<GameState, 'tech' | 'stock'>,
  id: TechId,
): { state: NodeState; text: string } {
  const node = TECH[id];
  const base = techState(game, id);
  if (base === 'done') return { state: 'done', text: '✓ Researched' };
  if (base === 'locked')
    return {
      state: 'locked',
      text: `Needs ${node.needs.map((n) => (node.tier === 4 ? TECH_SHORT[n] : TECH_NAME[n])).join(' + ')}`,
    };
  if (game.stock.scrap < node.cost) {
    return {
      state: 'short',
      text: `${thousands(game.stock.scrap)}/${thousands(node.cost)} Scrap`,
    };
  }
  return { state: 'open', text: `${thousands(node.cost)} Scrap` };
}

/** The Research button for a node: its text, whether it is greyed, its tooltip, and the fight line. */
export interface ResearchOffer {
  text: string;
  disabled: boolean;
  title: string;
  /** Shown in words under the button in a fight (a tooltip never shows on a phone). */
  wait: string;
  /** Bought: the button gives way to a "✓ Researched" line. */
  hidden: boolean;
}

export function researchOffer(
  game: Pick<GameState, 'tech' | 'stock'>,
  id: TechId,
  canBuy: boolean,
): ResearchOffer {
  const node = TECH[id];
  const face = nodeFace(game, id);
  if (face.state === 'done') return { text: '', disabled: true, title: '', wait: '', hidden: true };
  if (face.state === 'locked') {
    return { text: face.text, disabled: true, title: face.text, wait: '', hidden: false };
  }
  const short = face.state === 'short';
  return {
    text: `Research · ${face.text}`,
    disabled: !canBuy || short,
    title: !canBuy ? RESEARCH_WAIT : short ? `Needs ${thousands(node.cost)} Scrap` : '',
    wait: canBuy ? '' : RESEARCH_WAIT,
    hidden: false,
  };
}

/**
 * The confirm before a purchase; a Tier 3 or Tier 4 node repeats what it does, and so does every
 * node of the Ammo & throwables tab, the unlocks too, and Hand-loads (ID-284).
 */
export const researchQuestion = (id: TechId, cost: number, scrap: number): string => {
  const node = TECH[id];
  const repeats =
    node.tier >= 3 ||
    id === 'hand-loads' ||
    (TECH_TABS.kit as readonly TechBranch[]).includes(node.branch);
  const effect = repeats ? `${TECH_EFFECT[id]} ` : '';
  return `Research ${TECH_NAME[id]} for ${thousands(cost)} Scrap? ${effect}You have ${thousands(scrap)}.`;
};

/** What a purchase says once made. */
export const researchText = (id: TechId, cost: number, left: number): string =>
  `Researched ${TECH_NAME[id]} · ${thousands(cost)} Scrap spent, ${thousands(left)} left.`;

export interface ResearchState {
  game: GameState;
  /** Between hordes: buying is allowed. */
  canBuy: boolean;
  /** Closing resumes a fight. */
  resumes: boolean;
}

export interface ResearchOptions {
  state(): ResearchState;
  /** Buys node `id` (asks first, checks again after the answer); null when the player said no. */
  onResearch(id: TechId): Answer | Promise<Answer>;
  /** The window opened or closed (the rail's lit button follows). */
  onChange?: () => void;
}

export interface ResearchCenter {
  /** The top-bar button. */
  readonly button: HTMLButtonElement;
  /** The window's dialog: what the button controls. */
  readonly dialog: HTMLElement;
  isOpen(): boolean;
  open(from?: HTMLElement | null): void;
  close(): void;
  /** Re-reads the camp: the tab's count, the button's dot, and the chart when it is on show. */
  refresh(): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A line-drawn flask, in the text colour. */
function flask(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'research-flask');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = doc.createElementNS(SVG_NS, 'path');
  path.setAttribute(
    'd',
    'M9 3h6M10 3v6l-5.5 9.5A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-2.5L14 9V3M7.5 15h9',
  );
  svg.append(path);
  return svg;
}

/** A node's edge, in cell units: nodes sit inside their cell with a margin of about this much. */
const EDGE = 0.07;
/** How far apart the vertical trunks of the combo lines run in the gutter before the combo column. */
const TRUNK = 0.05;

/**
 * The connector lines, one per prerequisite, in a viewBox of one unit a cell (tiers by
 * branches). A Tier 1 to 3 line is straight. A Tier 4 combo's lines run at right angles and
 * through the gutters, never behind a node: a parent in the combo's own row runs straight; the
 * other leaves its parent's right edge, drops to the gap between two rows if it has to cross
 * the Tier 3 column, runs to its own vertical trunk in the gutter before Tier 4 (trunks
 * `TRUNK` apart, the line that goes furthest down on the left, so they don't merge) and enters
 * the combo from the left. A combo's lines are faint until its node is `active` (selected or
 * hovered); a researched source is solid, an open one dashed (the CSS).
 */
export function connectors(
  doc: Document,
  have: readonly TechId[] = [],
  active: TechId | null = null,
  tab: TechTab = 'upgrades',
): SVGSVGElement {
  const branches: readonly TechBranch[] = TECH_TABS[tab];
  const nodes = tabNodes(tab);
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'research-lines');
  svg.setAttribute('viewBox', `0 0 ${COLUMN_NAME[tab].length} ${branches.length}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const rowOf = (id: TechId): number => branches.indexOf(TECH[id].branch);
  // The bent combo lines, deepest target first, each given its trunk.
  const bent = nodes
    .flatMap((id) =>
      TECH[id].tier === 4
        ? TECH[id].needs
            .filter((from) => rowOf(from) !== rowOf(id))
            .map((from) => [from, id] as const)
        : [],
    )
    .sort((p, q) => rowOf(q[1]) - rowOf(p[1]));
  const trunkOf = (from: TechId, to: TechId): number => {
    const i = bent.findIndex(([f, t]) => f === from && t === to);
    return 3 + (i - (bent.length - 1) / 2) * TRUNK;
  };
  for (const id of nodes) {
    const { needs, tier } = TECH[id];
    const row = rowOf(id);
    for (const from of needs) {
      const parent = TECH[from];
      const y1 = rowOf(from) + 0.5;
      const y2 = row + 0.5;
      let shape: SVGElement;
      if (tier < 4) {
        shape = doc.createElementNS(SVG_NS, 'line');
        shape.setAttribute('x1', String(parent.tier - 0.5));
        shape.setAttribute('x2', String(tier - 0.5));
        shape.setAttribute('y1', String(y1));
        shape.setAttribute('y2', String(y2));
      } else {
        shape = doc.createElementNS(SVG_NS, 'path');
        const x1 = parent.tier - EDGE;
        const x2 = tier - 1 + EDGE;
        let d = `M ${x1} ${y1}`;
        if (y1 !== y2) {
          const trunk = trunkOf(from, id);
          // Across the Tier 3 column (the parent is left of it): down its left gutter to the
          // gap between its row and the next, then along that gap.
          if (parent.tier < 3) d += ` H ${parent.tier} V ${Math.min(y1, y2) + 0.5} H ${trunk}`;
          else d += ` H ${trunk}`;
          d += ` V ${y2}`;
        }
        d += ` H ${x2}`;
        shape.setAttribute('d', d);
        shape.dataset.combo = 'true';
        shape.dataset.active = String(id === active || from === active);
      }
      shape.dataset.from = from;
      shape.dataset.to = id;
      // Solid once its source is researched.
      shape.dataset.done = String(have.includes(from));
      svg.append(shape);
    }
  }
  return svg;
}

export function createResearchCenter(root: HTMLElement, opts: ResearchOptions): ResearchCenter {
  const doc = root.ownerDocument;
  const win = createCampWindow(root);
  if (opts.onChange) win.onChange(opts.onChange);
  let drawn: { game: GameState; can: boolean } | null = null;

  const button = el('button', 'research-button');
  button.type = 'button';
  button.setAttribute('aria-haspopup', 'dialog');
  button.title = 'Research';
  const dot = el('span', 'research-dot');
  dot.setAttribute('aria-hidden', 'true');
  dot.hidden = true;
  button.append(flask(doc), el('span', 'research-label', 'Research'), dot);
  button.setAttribute('aria-label', 'Research');
  button.addEventListener('click', () => win.open('upgrades', button));
  root.append(button);

  /** One tab: its chart (its own nodes, rows and columns), detail panel and status line. */
  interface View {
    tab: TechTab;
    nodes: TechId[];
    pane: HTMLElement;
    chart: HTMLElement;
    detail: HTMLElement;
    scroll: HTMLElement;
    status: HTMLElement;
    selected: TechId | null;
  }
  const views = {} as Record<TechTab, View>;
  for (const tab of TABS) {
    const pane = el('div', 'research-body');
    const chart = el('div', 'research-chart');
    chart.dataset.tab = tab;
    chart.setAttribute('role', 'group');
    chart.setAttribute('aria-label', tab === 'kit' ? 'Ammo and throwables chart' : 'Upgrade chart');
    const detail = el('section', 'research-detail');
    detail.setAttribute('aria-live', 'polite');
    // The chart scrolls sideways in a narrow window, the detail panel stays put.
    const scroll = el('div', 'research-scroll');
    if (tab === 'kit') scroll.append(el('p', 'menu-note research-kit-note', KIT_NOTE));
    scroll.append(chart);
    pane.append(scroll, detail);
    // A fade at the chart's inline end while more of it is out of sight (a phone).
    const cue = (): void => {
      scroll.dataset.more = String(scroll.scrollLeft + scroll.clientWidth < scroll.scrollWidth - 2);
    };
    scroll.addEventListener('scroll', cue);
    doc.defaultView?.addEventListener('resize', cue);
    const status = el('p', 'menu-note inv-status research-status');
    status.setAttribute('role', 'status');
    views[tab] = { tab, nodes: tabNodes(tab), pane, chart, detail, scroll, status, selected: null };
  }
  const say = (v: View, text: string, refused = false): void => {
    if (refused) v.status.dataset.tone = 'refused';
    else delete v.status.dataset.tone;
    v.status.textContent = text;
  };

  function pick(v: View, id: TechId): void {
    v.selected = id;
    draw(v);
    v.chart.querySelector<HTMLElement>(`[data-id="${id}"]`)?.focus({ preventScroll: true });
  }

  /** Lights the combo lines that touch a node; the rest stay faint. */
  function mark(v: View, id: TechId | null): void {
    for (const l of v.chart.querySelectorAll<SVGElement>('[data-combo]')) {
      l.dataset.active = String(id !== null && (l.dataset.from === id || l.dataset.to === id));
    }
  }

  /**
   * A node's second line. "Needs " and the " Scrap" unit are spans of their own, so the phone
   * shell can leave them out of a 96 px node (the words read the same on every other screen).
   */
  function faceEl(text: string): HTMLElement {
    const face = el('span', 'research-node-face');
    const lead = text.startsWith('Needs ') ? 'Needs ' : '';
    const unit = text.endsWith(' Scrap') ? ' Scrap' : '';
    const mid = text.slice(lead.length, text.length - unit.length);
    face.append(
      ...(lead ? [el('span', 'research-face-lead', lead)] : []),
      mid,
      ...(unit ? [el('span', 'research-face-unit', unit)] : []),
    );
    return face;
  }

  function drawChart(v: View, game: GameState): void {
    const branches: readonly TechBranch[] = TECH_TABS[v.tab];
    const nodes: Element[] = [connectors(doc, techOf(game), v.selected, v.tab)];
    COLUMN_NAME[v.tab].forEach((name, i) => {
      const head = el('span', 'research-tier', name);
      head.style.gridColumn = String(i + 2);
      nodes.push(head);
    });
    branches.forEach((branch, row) => {
      const label = el('span', 'research-branch', TECH_BRANCH_NAME[branch]);
      label.style.gridRow = String(row + 2);
      nodes.push(label);
      for (const id of v.nodes.filter((t) => TECH[t].branch === branch)) {
        const node = TECH[id];
        const face = nodeFace(game, id);
        const b = el('button', 'research-node');
        b.type = 'button';
        b.dataset.id = id;
        b.dataset.state = face.state;
        // A Tier 4 combo: its edge is purple, as its lines are.
        if (node.tier === 4) b.dataset.combo = 'true';
        b.style.gridRow = String(row + 2);
        b.style.gridColumn = String(node.tier + 1);
        b.setAttribute('aria-pressed', String(id === v.selected));
        b.append(el('span', 'research-node-name', TECH_NAME[id]), faceEl(face.text));
        b.addEventListener('click', () => pick(v, id));
        // A combo's lines light up while its node (or a parent) is hovered or focused.
        for (const on of ['pointerenter', 'focus'] as const)
          b.addEventListener(on, () => mark(v, id));
        for (const off of ['pointerleave', 'blur'] as const)
          b.addEventListener(off, () => mark(v, v.selected));
        nodes.push(b);
      }
    });
    v.chart.replaceChildren(...nodes);
    v.scroll.dispatchEvent(new Event('scroll'));
  }

  function drawDetail(v: View, game: GameState, can: boolean): void {
    if (v.selected === null) return;
    const node = TECH[v.selected];
    const have = techOf(game);
    const branch = TECH_BRANCH_NAME[node.branch];
    const needs = el('p', 'research-needs');
    if (node.needs.length === 0) needs.textContent = 'Needs: nothing';
    else {
      needs.append('Needs: ');
      node.needs.forEach((n, i) => {
        if (i > 0) needs.append(' + ');
        const done = have.includes(n);
        // The parent still missing is bold, so the one to get next stands out.
        needs.append(
          el(done ? 'span' : 'strong', 'research-parent', `${done ? '✓' : '○'} ${TECH_NAME[n]}`),
        );
      });
    }
    const next = unlocksOf(v.selected);
    const unlocks = el(
      'p',
      'research-unlocks',
      next.length === 0
        ? 'Unlocks: nothing yet'
        : `Unlocks: ${next.map((t) => TECH_NAME[t]).join(', ')}`,
    );
    const offer = researchOffer(game, v.selected, can);
    const parts: HTMLElement[] = [
      el('h3', 'research-name', TECH_NAME[v.selected]),
      el(
        'p',
        'research-meta',
        `${v.tab === 'kit' ? COLUMN_NAME.kit[node.tier - 1]! : `Tier ${node.tier}`} · ${branch}`,
      ),
      el('p', 'research-effect', TECH_EFFECT[v.selected]),
      needs,
      unlocks,
    ];
    if (offer.hidden) {
      parts.push(el('p', 'research-done', '✓ Researched'));
    } else {
      const go = el('button', 'hud-button btn-primary research-go', offer.text);
      go.type = 'button';
      go.disabled = offer.disabled;
      go.title = offer.title;
      const id = v.selected;
      go.addEventListener('click', () => void buy(v, id));
      parts.push(go);
      if (offer.wait) parts.push(el('p', 'research-wait', offer.wait));
    }
    v.detail.replaceChildren(...parts);
  }

  /** Each tab's name with its count. */
  function relabel(game: GameState): void {
    for (const tab of TABS) win.relabel(tab, labelFor(tab, game));
  }

  function draw(v: View): void {
    const { game, canBuy } = opts.state();
    drawn = { game, can: canBuy };
    // First time on show: the first node that can be bought, else the first node.
    v.selected ??= v.nodes.find((id) => techState(game, id) === 'open') ?? v.nodes[0]!;
    drawChart(v, game);
    drawDetail(v, game, canBuy);
    relabel(game);
  }

  async function buy(v: View, id: TechId): Promise<void> {
    const answer = await opts.onResearch(id);
    if (answer === null) return;
    say(v, answer.ok ? answer.text : refusedText(answer), !answer.ok);
    if (win.isOpen()) draw(v);
  }

  /** The tab on show, or null with the window closed. */
  const shownView = (): View | null => {
    const id = win.current();
    return id !== null && Object.hasOwn(views, id) ? views[id as TechTab] : null;
  };

  const game0 = opts.state().game;
  for (const tab of TABS) {
    const v = views[tab];
    win.add({
      id: tab,
      label: labelFor(tab, game0),
      panel: v.pane,
      status: v.status,
      button,
      show() {
        say(v, '');
        draw(v);
        win.setResumes(opts.state().resumes);
      },
      hide() {},
    });
  }

  return {
    button,
    dialog: win.dialog,
    isOpen: () => win.isOpen(),
    open(from) {
      win.open('upgrades', from);
    },
    close: () => win.close(),
    refresh() {
      const { game, canBuy, resumes } = opts.state();
      const ready = techReady(game) && canBuy;
      dot.hidden = !ready;
      const name = ready ? 'Research, an upgrade is affordable' : 'Research';
      if (button.getAttribute('aria-label') !== name) {
        button.setAttribute('aria-label', name);
        button.title = name;
      }
      button.dataset.ready = String(ready);
      relabel(game);
      const v = shownView();
      if (!v) return;
      win.setResumes(resumes);
      if (drawn && game === drawn.game && canBuy === drawn.can) return;
      draw(v);
    },
  };
}
