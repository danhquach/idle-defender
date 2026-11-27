// The Research Center (ID-263): a chart of the Scrap upgrades, branches as rows and tiers
// left to right, with a detail panel beside it, in a window of its own (a camp window with
// one tab, "Upgrades"; cosmetics come as a second tab later). Browsing works any time; buying
// only between hordes. The buying rules live in core/techtree.ts; this file is the view. Text
// reaches the page only through textContent, and the connector lines are SVG built from the
// table's numbers.
import { TECH, TECH_BRANCHES, TECH_IDS, type TechId } from '../core/data.ts';
import type { GameState } from '../core/game.ts';
import { techOf, techReady, techState, unlocksOf } from '../core/techtree.ts';
import { createCampWindow } from './campwindow.ts';
import type { Answer } from './confirm.ts';
import { el, thousands } from './hud.ts';

/** Why Research is greyed in a fight. */
export const RESEARCH_WAIT = 'Research between hordes';

/** The tab's name with what is done: "Upgrades · 3/11". */
export const upgradesLabel = (done: number, total: number): string => `Upgrades · ${done}/${total}`;

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
  if (base === 'locked') return { state: 'locked', text: `Needs ${TECH[node.needs!].name}` };
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

/** The confirm before a purchase; a Tier 3 node repeats what it does. */
export const researchQuestion = (id: TechId, cost: number, scrap: number): string => {
  const node = TECH[id];
  const effect = node.tier === 3 ? `${node.effect} ` : '';
  return `Research ${node.name} for ${thousands(cost)} Scrap? ${effect}You have ${thousands(scrap)}.`;
};

/** What a purchase says once made. */
export const researchText = (id: TechId, cost: number, left: number): string =>
  `Researched ${TECH[id].name} · ${thousands(cost)} Scrap spent, ${thousands(left)} left.`;

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
}

export interface ResearchCenter {
  /** The top-bar button. */
  readonly button: HTMLButtonElement;
  isOpen(): boolean;
  open(from?: HTMLElement | null): void;
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

/** The connector lines, one per prerequisite, in a viewBox of one unit a cell (tiers by branches). */
export function connectors(doc: Document, have: readonly TechId[] = []): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'research-lines');
  svg.setAttribute('viewBox', `0 0 3 ${TECH_BRANCHES.length}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  for (const id of TECH_IDS) {
    const { needs, tier, branch } = TECH[id];
    if (needs === null) continue;
    const row = TECH_BRANCHES.findIndex((b) => b.id === branch);
    const line = doc.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', String(tier - 1.5));
    line.setAttribute('x2', String(tier - 0.5));
    line.setAttribute('y1', String(row + 0.5));
    line.setAttribute('y2', String(row + 0.5));
    line.dataset.from = needs;
    line.dataset.to = id;
    // Green once its source is researched.
    line.dataset.done = String(have.includes(needs));
    svg.append(line);
  }
  return svg;
}

export function createResearchCenter(root: HTMLElement, opts: ResearchOptions): ResearchCenter {
  const doc = root.ownerDocument;
  const win = createCampWindow(root);
  let opened = false;
  let selected: TechId | null = null;
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

  const pane = el('div', 'research-body');
  const chart = el('div', 'research-chart');
  chart.setAttribute('role', 'group');
  chart.setAttribute('aria-label', 'Upgrade chart');
  const detail = el('section', 'research-detail');
  detail.setAttribute('aria-live', 'polite');
  // The chart scrolls sideways in a narrow window, the detail panel stays put.
  const scroll = el('div', 'research-scroll');
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
  const say = (text: string, refused = false): void => {
    if (refused) status.dataset.tone = 'refused';
    else delete status.dataset.tone;
    status.textContent = text;
  };

  function pick(id: TechId): void {
    selected = id;
    draw();
    chart.querySelector<HTMLElement>(`[data-id="${id}"]`)?.focus({ preventScroll: true });
  }

  function drawChart(game: GameState): void {
    const nodes: Element[] = [connectors(doc, techOf(game))];
    for (let t = 1; t <= 3; t++) {
      const head = el('span', 'research-tier', `Tier ${t}`);
      head.style.gridColumn = String(t + 1);
      nodes.push(head);
    }
    TECH_BRANCHES.forEach((branch, row) => {
      const label = el('span', 'research-branch', branch.name);
      label.style.gridRow = String(row + 2);
      nodes.push(label);
      for (const id of TECH_IDS.filter((t) => TECH[t].branch === branch.id)) {
        const node = TECH[id];
        const face = nodeFace(game, id);
        const b = el('button', 'research-node');
        b.type = 'button';
        b.dataset.id = id;
        b.dataset.state = face.state;
        b.style.gridRow = String(row + 2);
        b.style.gridColumn = String(node.tier + 1);
        b.setAttribute('aria-pressed', String(id === selected));
        b.append(
          el('span', 'research-node-name', node.name),
          el('span', 'research-node-face', face.text),
        );
        b.addEventListener('click', () => pick(id));
        nodes.push(b);
      }
    });
    chart.replaceChildren(...nodes);
    cue();
  }

  function drawDetail(game: GameState, can: boolean): void {
    if (selected === null) return;
    const node = TECH[selected];
    const have = techOf(game);
    const branch = TECH_BRANCHES.find((b) => b.id === node.branch)!.name;
    const needs = el('p', 'research-needs');
    needs.textContent =
      node.needs === null
        ? 'Needs: nothing'
        : `Needs: ${have.includes(node.needs) ? '✓' : '○'} ${TECH[node.needs].name}`;
    const next = unlocksOf(selected);
    const unlocks = el(
      'p',
      'research-unlocks',
      next.length === 0
        ? 'Unlocks: nothing yet'
        : `Unlocks: ${next.map((t) => TECH[t].name).join(', ')}`,
    );
    const offer = researchOffer(game, selected, can);
    const parts: HTMLElement[] = [
      el('h3', 'research-name', node.name),
      el('p', 'research-meta', `Tier ${node.tier} · ${branch}`),
      el('p', 'research-effect', node.effect),
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
      const id = selected;
      go.addEventListener('click', () => void buy(id));
      parts.push(go);
      if (offer.wait) parts.push(el('p', 'research-wait', offer.wait));
    }
    detail.replaceChildren(...parts);
  }

  function draw(): void {
    const { game, canBuy } = opts.state();
    drawn = { game, can: canBuy };
    // First time on show: the first node that can be bought, else the first node.
    selected ??= TECH_IDS.find((id) => techState(game, id) === 'open') ?? TECH_IDS[0]!;
    drawChart(game);
    drawDetail(game, canBuy);
    win.relabel('upgrades', upgradesLabel(techOf(game).length, TECH_IDS.length));
  }

  async function buy(id: TechId): Promise<void> {
    const answer = await opts.onResearch(id);
    if (answer === null) return;
    say(answer.ok ? answer.text : answer.reason, !answer.ok);
    if (opened) draw();
  }

  win.add({
    id: 'upgrades',
    label: upgradesLabel(0, TECH_IDS.length),
    panel: pane,
    status,
    button,
    show() {
      opened = true;
      say('');
      draw();
      win.setResumes(opts.state().resumes);
    },
    hide() {
      opened = false;
    },
  });

  return {
    button,
    isOpen: () => opened,
    open(from) {
      win.open('upgrades', from);
    },
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
      win.relabel('upgrades', upgradesLabel(techOf(game).length, TECH_IDS.length));
      if (!opened) return;
      win.setResumes(resumes);
      if (drawn && game === drawn.game && canBuy === drawn.can) return;
      draw();
    },
  };
}
