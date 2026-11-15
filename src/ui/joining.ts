// Joining the camp in words (ID-150): each survivor asking to join as a card (name,
// profession, level, gun), the confirm for leaving the screen without answering, the confirm
// for letting a survivor go, and the lines said after each answer. Pure: no DOM.
import type { OwnedWeapon } from '../core/armoury.ts';
import { JOBS, MAX_COUNT } from '../core/data.ts';
import type { GameState, RosterDefender } from '../core/game.ts';
import { joiningOf } from '../core/hordeonly.ts';
import { levelOf } from '../core/stats.ts';
import { gunName, heldGunOf } from './gunpick.ts';
import { jobLine } from './jobtext.ts';

/** One survivor asking to join, as the offer tile shows them. */
export interface JoinCard {
  id: string;
  name: string;
  /** "Lv 1 · Hunter · Pistol" */
  sub: string;
  /** What their profession brings (`jobLine`). */
  job: string;
}

/** Everyone asking to join, oldest first: none when nobody is. */
export const joinCards = (game: Pick<GameState, 'joining'>): JoinCard[] =>
  joiningOf(game).map((d) => {
    const level = levelOf(d.xp).level;
    return {
      id: d.id,
      name: d.name,
      sub: `Lv ${level} · ${JOBS[d.job].name} · ${gunName(heldGunOf(d))}`,
      job: jobLine(d.job, level),
    };
  });

/** Under the offer tile's label, before any answer (ID-150): Refuse can't be undone. */
export const REFUSE_NOTE = 'Refused survivors are gone for good.';

/** The offer tile's label: "Asks to join" / "2 ask to join". */
export const joinLabel = (n: number): string => (n === 1 ? 'Asks to join' : `${n} ask to join`);

/** "Ava (Hunter) asks to join the camp": the result screen's line for each. */
export const askLine = (d: RosterDefender): string =>
  `${d.name} (${JOBS[d.job].name}) asks to join the camp`;

/** The confirm for leaving with someone still asking (ID-150): leaving refuses them. */
export function leaveJoinQuestion(game: Pick<GameState, 'joining'>): string | null {
  const names = joiningOf(game).map((d) => d.name);
  if (names.length === 0) return null;
  const who = names.join(' and ');
  return `${who} ${names.length === 1 ? 'is' : 'are'} still asking to join. Go on without answering? ${
    names.length === 1 ? 'They are' : 'Both are'
  } refused and gone for good.`;
}

/** What is said after an answer: who went where, or who went on their way. */
export const answerText = (name: string, where: 'squad' | 'bench' | null): string =>
  where === 'squad'
    ? `${name} joins the squad.`
    : where === 'bench'
      ? `${name} joins the camp and waits on the bench.`
      : `${name} is turned away for good.`;

/**
 * The confirm for letting `d` go (ID-150): for good, their gun back to the stash, and what
 * a full stash throws away for it (`thrown`).
 */
export function letGoQuestion(d: RosterDefender, thrown: readonly OwnedWeapon[]): string {
  const held = heldGunOf(d);
  const gun =
    typeof held === 'object'
      ? ` Their ${gunName(held)} goes back to the stash.`
      : ' They leave their pistol.';
  const lost =
    thrown.length > 0
      ? ` The stash is full: ${thrown.map((w) => gunName(w)).join(', ')} will be thrown away.`
      : '';
  return `Let ${d.name} go? They leave the camp for good.${gun}${lost}`;
}

/** What the Roster says once `name` has gone. */
export const letGoText = (name: string): string => `${name} has left the camp.`;

/**
 * The confirm for `keeper` taking in `fed` (ID-170): who leaves for good, the XP and levels
 * the keeper gains, where the gun goes, and what a full stash throws away for it.
 */
export function combineQuestion(
  keeper: RosterDefender,
  fed: RosterDefender,
  xp: number,
  thrown: readonly OwnedWeapon[],
): string {
  const held = heldGunOf(fed);
  const from = levelOf(keeper.xp).level;
  const to = levelOf(Math.min(MAX_COUNT, keeper.xp + xp)).level;
  const levels = to > from ? ` (Lv ${from} → ${to})` : ` (stays Lv ${from})`;
  const gun =
    typeof held === 'object'
      ? ` ${fed.name}'s ${gunName(held)} goes back to the stash.`
      : ' The free pistol goes with them.';
  const lost =
    thrown.length > 0
      ? ` The stash is full: ${thrown.map((w) => gunName(w)).join(', ')} will be thrown away.`
      : '';
  return `Combine ${fed.name} into ${keeper.name}? ${fed.name} (Lv ${levelOf(fed.xp).level}) leaves the camp for good. ${keeper.name} gains ${xp} XP${levels}.${gun}${lost}`;
}

/** What the Roster says once `keeper` has taken in `fed` (ID-170). */
export const combineText = (keeper: string, fed: string, xp: number): string =>
  `${keeper} took in ${fed}: +${xp} XP.`;
