# Milestone 3 — Horde Rules, Save and Balance Plan

**Goal:** Real horde rules in place of the M1 camp-HP stand-in. Defenders have HP and get injured. The horde is lost when the camp falls: an enemy is inside and no defender is left, for 10 s. A win pays Scrap, Wood and defender XP. A loss pays a little, scaled by the wave reached. The injured are replaced between waves and rest 2 h of real time. Then come the result screens, saving and the balance simulator.

**Spec:** `docs/design.md` §2 (core loop: win, loss, payout), §4 (defender HP, injury, inside the camp, replacements), §11 (recovery).

## Roadmap

M3 = ID-006 (horde rules) + ID-007 (victory and defeat screens) + ID-008 (save) + ID-009 (balance simulator). Each ticket's acceptance criteria are written here before it starts.

**M3 stand-ins and later work:**
- **Grit:** defender HP is a flat 100 until ID-011 adds +5 per Grit point.
- **Food and Medicine:** recovery is the 2 h timer only; ID-031 adds Food and Medicine cutting it.
- **Recovery while closed:** works from the stored `injuredUntil` timestamp once ID-008 saves the game.
- **Mutated Genes and loot drops:** not in the win reward yet (ID-025, ID-013).
- **Spitters:** only enemies inside the camp hurt defenders until ID-023.

## Global Constraints

- Everything from the M1 and M2 plans' Global Constraints still holds: core is pure, RNG only via `rng.ts`, text only via `textContent`, every number in `data.ts`, no new runtime dependency, public repo rules.
- **Real time:** the core never reads a clock. The UI passes `now` (ms since the epoch) into `startHorde`, `finishHorde` and `recover`; a non-finite `now` is a `RangeError`.
- Player mistakes return `{ ok: false, reason }`; programmer errors throw `RangeError` (as in M2).
- No untrusted data enters core in ID-006 (clicks reach core only as in-range ids). The CLAUDE.md injection audit is first triggered by ID-008's save parsing.
- Versions: ID-006 → `0.3.1`, ID-007 → `0.3.2`, ID-008 → `0.3.3`, ID-009 → `0.4.0` (milestone done).

## Numbers (all in `data.ts`)

- `DEFENDER_HP = 100`.
- `MELEE_REACH = 2 × ENEMY_RADIUS` (24 px): an enemy in the camp this close to a defender hits it.
- `FALL_WARNING = 10` s.
- `HORDE_PAYOUT`: a win pays `15 + 5n` Scrap and `20 + 10n` Wood (n = horde number). A loss pays `floor(win × 0.25 × wave reached / wave count)`.
- `DEFENDER_XP`: `10 + 5n` per defender who took part in a win.
- `RECOVERY_MS = 2 h`, from the injury. The sim has no clock, so `finishHorde` counts the injury time back from `now` in fight time. Fight time stops during offers, so the rest can end a little late, never early.
- The camp keeps only its line, `CAMP.x`; camp HP is gone.

## Review Focus

1. **Inside the camp is sticky:** an enemy that crossed every layer keeps hunting even after walking back over a wall to reach an outer defender; it never turns round to hit a wall from the camp side.
2. **A crowd can't hold off a hit:** reach is judged when the enemy moves, before separation pushes it.
3. **Injury frees the post or the reservation at once**, and the injured never reach the bench (no recruit card, no replacement of themselves).
4. **Pauses:** a card offer or a replacement offer stops the sim, the falling timer and walking. A card pick earned during a replacement offer opens once it closes.
5. **Falling timer:** runs only with an enemy inside and nobody in the fight; resets otherwise; a win in the same step wins.
6. **Payout edges:** a loss always pays at least 1 of each at horde 1 and never more than a quarter of a win.

---

## ID-006 — Horde rules

**Acceptance criteria:** on issue #6.

**Files:**
- Modify `src/core/data.ts`: the numbers above; `STAND_IN_PAYOUT` and `CAMP.maxHp` removed.
- Modify `src/core/horde.ts`: `Enemy.inCamp`, `Defender.hp/maxHp`, `HordeState.injured`, `tookPart`, `fallingFor` and `replace` (camp HP removed); the hunt, attack, injure and fall steps; `moveDefender` refuses during a replacement.
- Create `src/core/replace.ts`: `openReplace`, `replacePosts`, `replaceInjured`, `skipReplace`.
- Modify `src/core/cards.ts`: a recruit counts as taking part; `levelUp` waits behind a replacement.
- Modify `src/core/game.ts`: `RosterDefender` (`xp`, `injuredUntil`), `available`, `recover`, `hordePayout`, `hordeXp`, `xpGains`; `startHorde` and `finishHorde` take `now`.
- UI: the falling warning, the replacement panel and the result lines in `hud.ts`; injured defenders kept off the start picker and listed with their return time in `build.ts`; defender HP bars in `render.ts`.
- Tests: `src/core/rules.test.ts` (new), `game.test.ts`, `horde.test.ts`, `hud.test.ts`, `build.test.ts`.
- `docs/design.md` §4: enemies inside the camp and replacing the injured.

---

## ID-007 — Victory and defeat screens

**Acceptance criteria:** on issue #7.

**Files:**
- Modify `src/core/horde.ts`: `HordeState.breaches` (first crossing of each layer from outside: column, row, wave, through `wall` / `gate` / `gap`), recorded as enemies move; `Injury.by` (the kind of enemy that landed the last hit, carried on `Defender.hitBy`).
- Modify `src/core/game.ts`: `injuredUntil(horde, injury, now)`, used by `finishHorde`.
- Modify `src/ui/hud.ts`: `resultScreen(game, horde, now)` builds both screens' text; the HUD shows it.
- Modify `src/ui/app.ts`: reads the clock once when the horde ends and passes that `now` to the screen and to `finishHorde`.
- Tests: `src/core/rules.test.ts`, `game.test.ts`, `hud.test.ts`.

---

## ID-008 — Save

**Acceptance criteria** (also on issue #8):

**Saving**
- The game between hordes is saved to browser storage as versioned JSON (`v: 1`, `savedAt`, `game`) after every change: a build action, a finished horde, a recovery, a loaded backup code.
- A fight is not saved. A reload mid-horde comes back to the build screen with the camp as it was before that horde (PM decision, 2026-10-29).
- Against an accidental refresh: while a horde is on or its result screen is up, leaving the page (reload, closing the tab, navigating away) shows the browser's "Leave site?" warning. In build mode it doesn't (PM decision, 2026-10-29).
- A reload restores horde number, base (layers, segments with HP, posts), stock, tiers and roster (XP, `injuredUntil`).
- Rest uses real time: a defender injured before closing the page is back at the same clock time after reopening; one whose time passed while closed is fit.
- Storage that throws or is missing: the game still plays and the build panel says "Saving is off…"; a refused write says "Couldn't save…", and the next write that works says "Saved.". A build action clears an old line.

**Loading untrusted data** (the save and the backup code)
- Size-checked before parsing (save ≤ 50,000 chars; paste ≤ twice the longest code).
- Read through an allow-list that builds a new game field by field: exact keys (`__proto__`, `constructor` and extras refused), whole numbers in range, known tier, post and weapon ids compared exactly, ids `[a-z][a-z0-9-]{0,31}`, names `[A-Za-z][A-Za-z' -]{0,23}` (no HTML, bidi, zero-width or look-alike characters), and the build rules a real camp keeps (layer order, one gate per layer, unlocked tiers only, post order, posts on or behind a wall, unique roster ids).
- Not refused, so clock skew and retuning never lose a camp: segment max HP is taken from today's numbers by kind and tier, and HP above it is cut to it; a rest later than 2 h past `savedAt` (a clock set back, a code from a device whose clock runs ahead) is cut to that.
- A save that fails: a new camp starts, the bad one is kept under a second key (not overwritten), and the build panel says so.
- No save data reaches a URL, the page title, a log line or a network call.

**Backup code**
- The build panel shows the camp's code (`ID1:` + base64 of the save JSON) in a read-only box that selects on focus.
- Pasting a code and pressing "Load code": ASCII spaces and line breaks are ignored; empty, too long and unreadable codes each say why and change nothing; a good code asks to confirm, then replaces the camp and saves it.

**General**
- Text only via `textContent`; no new runtime dependency; core stays pure (storage lives in `src/storage/**`).
- Tests: round-trip of a new and a played game; rest across a reload; storage that throws; a rejected save kept aside; hostile payloads through every path (prototype keys, extra/missing keys, out-of-range, fractional, text and overflowing numbers, look-alike and padded ids, HTML/bidi/zero-width names, every build rule, deep nesting and long arrays, oversized and ReDoS-shaped input, broken base64 and UTF-8, hidden marks in a code).
- `security-devops` injection audit passes. Existing tests stay green. Version `0.3.3`.

**Files:**
- Create `src/storage/validate.ts` (allow-list readers), `src/storage/save.ts` (encode, decode, load, write), `src/storage/code.ts` (backup code), `src/storage/testing.ts`, `save.test.ts`, `code.test.ts`.
- Modify `src/ui/app.ts`: load at start, `commit` saves after each change, notices.
- Modify `src/ui/build.ts`: the backup section; `src/page.css`.
- Modify `vitest.config.ts` (storage tests), `docs/design.md` §12.

---

## ID-009 — Balance simulator and balance tests

**Acceptance criteria** (also on issue #9):

**Simulator** (`src/core/sim.ts`, pure and seeded like the rest of core)
- `playHorde(game, seed, now)` plays the game's next horde to the end with a fixed scripted player: the first fit defender starts on the usable post furthest forward; a recruit card is taken when offered, else the first card; every replacement is taken (first bench defender, first allowed post); no focus, no cash. A horde still on after an hour of fight time throws (a stuck fight is a bug, not a result).
- `summarise` reads a finished horde: outcome, wave reached, fight seconds, who took part, who was injured, share of wall HP left.
- `playCampaign(seed, hordes)` chains hordes from a new game through `finishHorde`: it waits until the whole roster is fit, repairs segments most damaged first while the stock covers them, and retries a lost horde. It never builds.
- The same seed always gives the same result.

**Report**
- `npm run balance -- [seeds] [hordes]` (each a whole number 1–100, else a one-line error) prints, for each horde on the starting base, the win rate, wave reached, length (min / median / max minutes) and injuries, then how far a campaign gets per seed. Plain text; runs on Node's type stripping (Node 22.6 or later), no new dependency.

**Balance tests** (`src/core/balance.test.ts`, 20 seeds, hordes 1–8 on the starting base)
- Horde 1 (the tutorial) is won on every seed with nobody injured; Horde 2 is won on every seed.
- Hordes 1 and 2 last 3–5 minutes (design §4).
- The win rate never rises from one horde to the next.
- The starting base wins nothing from Horde 5 on: past that the camp must grow (design §2).
- A win's payout covers repairing that horde's damage (checked on at least one damaged win).
- A campaign without building reaches Horde 4 on every seed and stalls before Horde 6.

**General**
- Design §16 says where the simulator and report live. Unit tests for the scripted player's start, card and replacement choices, the stuck-fight limit, the summary, repairs (most damaged first, skipping what it can't afford), waiting out injuries, never building, and the campaign. Existing tests stay green. Version `0.4.0`.

**Files:**
- Create `src/core/sim.ts`, `src/core/sim.test.ts`, `src/core/balance.test.ts`, `tools/balance.mjs`.
- Modify `package.json` (`balance` script, version), `docs/design.md` §16.
