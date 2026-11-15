export interface PaceRow {
  from: number;
  interval: number;
  break: number;
  overlap: number;
}
export type Pace = Omit<PaceRow, 'from'>;
export interface Run {
  outcome: string;
  injured: number;
  wallLeft: number;
  band: 'few' | 'some' | 'heavy';
}
export interface Stats {
  tries: number;
  won: number;
  lost: number;
  injured: number;
  wallLoss: number;
  bands: { few: number; some: number; heavy: number };
  someLost: number;
}
export interface Miss {
  horde: number;
  kind: 'lost' | 'injured' | 'some';
  excess: number;
}
export const TARGETS: { lost: number; injured: number };
export function hordeStats(runs: Run[]): Stats;
export function misses(stats: Stats[], from: number, to: number): Miss[];
export function warnings(stats: Stats[], from: number, to: number): string[];
export function parseArgs(argv: string[]): {
  from: number;
  to: number;
  cap: number;
  apply: boolean;
};
export function measuredLines(stats: Stats[], from: number, to: number): string[];
export function applyTable(source: string, rows: PaceRow[], comments: string[]): string;
export function withTable<T>(table: PaceRow[], rows: PaceRow[], fn: () => T): T;
export function score(found: Miss[], change: number): number[];
export function better(a: number[], b: number[]): boolean;
export function perHorde(rows: PaceRow[], last: number): (Pace | null)[];
export function toRows(paces: (Pace | null)[]): PaceRow[];
export function tableProblems(rows: PaceRow[]): string[];
export function changeSize(base: PaceRow[], rows: PaceRow[], last: number): number;
export function candidates(
  rows: PaceRow[],
  h: number,
  last: number,
): { rows: PaceRow[]; move: string }[];
export function tableKey(rows: PaceRow[]): string;
export function formatTable(rows: PaceRow[]): string;
export function formatStats(stats: Stats[], from: number, to: number, found: Miss[]): string;
