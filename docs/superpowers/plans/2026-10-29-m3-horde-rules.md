# Milestone 3 — Horde Rules, Save and Balance Plan

**Goal:** Real horde rules in place of the M1 camp-HP stand-in. Defenders have HP and get injured. The horde is lost when the camp falls: an enemy is inside and no defender is left, for 10 s. A win pays Scrap, Wood and defender XP. A loss pays a little, scaled by the wave reached. The injured are replaced between waves and rest 2 h of real time. Then come the result screens, saving and the balance simulator.

**Spec:** `docs/design.md` §2 (core loop: win, loss, payout), §4 (defender HP, injury, inside the camp, replacements), §11 (recovery).

## Roadmap

M3 = ID-006 (horde rules) + ID-007 (victory and defeat screens) + ID-008 (save) + ID-009 (balance simulator). Each ticket's acceptance criteria are written here before it starts; ID-006's are below.

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
