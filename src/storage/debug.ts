// Debug mode (ID-197): the URL flag that turns it on, and the save slot of its own it uses,
// so a tester's camp never reads or overwrites the player's.
import { REJECTED_KEY, SAVE_KEY, type SaveStorage } from './save.ts';

export const DEBUG_SAVE_KEY = 'idle-defender.debug.save';
export const DEBUG_REJECTED_KEY = 'idle-defender.debug.save.rejected';

/** The longest query string read for the flag; a longer one is refused whole. */
const MAX_QUERY = 200;

/**
 * Whether the page's query string (`location.search`) turns debug mode on: one `debug`
 * parameter, exactly `1`. Anything else (another value, the flag twice, a query too long
 * to read) is off.
 */
export function debugFlag(search: string): boolean {
  if (typeof search !== 'string' || search.length > MAX_QUERY) return false;
  let values: string[];
  try {
    values = new URLSearchParams(search).getAll('debug');
  } catch {
    return false;
  }
  return values.length === 1 && values[0] === '1';
}

/** `storage` with the save's keys moved to the debug slot; every other key (settings) as it is. */
export function debugStorage(storage: SaveStorage): SaveStorage {
  const key = (k: string): string =>
    k === SAVE_KEY ? DEBUG_SAVE_KEY : k === REJECTED_KEY ? DEBUG_REJECTED_KEY : k;
  return {
    getItem: (k) => storage.getItem(key(k)),
    setItem: (k, v) => storage.setItem(key(k), v),
  };
}
