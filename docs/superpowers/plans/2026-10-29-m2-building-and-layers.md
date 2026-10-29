# Milestone 2 — Building and Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A base that lasts between hordes: up to 3 barrier layers on a fixed grid, each a row of 5 wall or gate segments in one of four tiers, with tower, wall-walk and ground posts. Between hordes the player builds, upgrades and repairs with materials, then picks the start defender and post. Damage carries over. In a fight the player can move defenders between posts (they walk), and defenders on a breaking wall drop to a ground post behind it.

**Architecture:** A new pure `src/core/base.ts` holds the persistent base and its build actions. Each action returns a new `{ base, stock }` or a refusal with a reason; inputs are never changed. `newHorde` builds its layers and posts from a `Base` instead of the M1 `WALL`/`POSTS` constants, and `baseAfter` writes the fight's damage back. A small `src/core/game.ts` runs the loop between hordes (horde number, stock, roster). The UI gets a build mode over the same canvas, and in-fight defender moves.

**Tech Stack:** TypeScript, Vite, Vitest, Canvas 2D, plain DOM (unchanged).

**Spec:** `docs/design.md` §3 (base, posts and positioning), §4 (start: 1 defender, the player picks who and where), §11 (materials, start state), §14 step 3.

## Roadmap

M2 = ID-003 (core base model) + ID-004 (build mode and the loop between hordes) + ID-005 (moving and dropping defenders mid-horde). M3 (ID-006…ID-009) brings the real horde rules, rewards and save.

**M2 stand-ins** (replaced in M3):
- **Payout:** a simple payout per horde (`standInPayout`) instead of ID-006's rewards and scaled loss payout, so the build loop can be played.
- **No save:** the game state lives in memory until ID-008; a page reload starts a new game.
- **Camp HP loss rule:** stays from M1 until ID-006.

**Out of scope for M2:**
- Turret mounts and traps (M5).
- Melee and Engineer adjacency (M4). Ground and wall-walk posts are built now, and M2 applies only the ranged range modifiers.
- Research tier unlocks (M9): unlocked tiers are a parameter, wood by default.
- Base expansion beyond 3 columns.
- Demolishing.
- Horde cash repairs (M5).

## Global Constraints

- Everything from the M1 plan's Global Constraints still holds:
  - core is pure;
  - RNG only via `rng.ts`;
  - text only via `textContent`;
  - every number lives in `data.ts`;
  - no new runtime dependency;
  - public repo rules.
- Build actions never throw for a player mistake (short of stock, slot taken, tier locked). They return `{ ok: false, reason }` and leave inputs untouched. They throw `RangeError` only for programmer errors (a non-integer or out-of-range column, row or post id), like `setFocus`.
- No untrusted data enters core in M2. Clicks reach core only as finite, in-range grid coordinates. Save parsing and its allow-list come with ID-008. The CLAUDE.md injection audit is therefore not triggered, and each PR body says so.
- Workflow per CLAUDE.md:
  - one issue branch and worktree per ticket;
  - QA from a clean install;
  - senior review;
  - **PM approval before each commit**.
- Versions: ID-003 → `0.2.2`, ID-004 → `0.2.3`, ID-005 → `0.3.0` (milestone done).
- **Ticket order:** each ticket builds on the previous one's code. Cut the ID-004 branch from `origin/main` only after the ID-003 PR merges, and ID-005 only after ID-004.

## Grid and numbers (all in `data.ts`)

- **Columns:** `COLUMNS = [500, 760, 1020]` give the wall `x` of each buildable layer, left (inner) to right (outer). Column 0 is the M1 wall position. `WALL = { depth: 20 }`.
- **Segments:** `SEGMENTS = 5` per layer, and `SEGMENT_HEIGHT = FIELD.height / SEGMENTS` (80). Row `r` covers `y` in `[80r, 80r + 80)`, with its centre at `40 + 80r`.
- **Post slots for column `c` (x = `COLUMNS[c]`) and row `r` (y = row centre):**
  - `wall-walk`: on the segment, at `x + WALL.depth / 2`. A wall-walk post on a gate segment is the gate post (same stats).
  - `tower`: behind the wall, at `x − 80`. Needs at least one built segment in column `c`.
  - `ground`: between layers, at `x − 160`. Like a tower, it needs at least one built segment in column `c`, so a ground post can't stand alone ahead of the base.
- **Range by post kind:** `POST_RANGE = { tower: 1.25, 'wall-walk': 1, ground: 0.75 }`. This replaces `TOWER_RANGE_BONUS`.
- **Tiers:** `TIERS` (order = upgrade order):

  | Tier | Segment HP | Cost per segment |
  |---|---|---|
  | `wood` | 200 | 10 wood + 5 scrap |
  | `metal` | 400 | 10 metal + 10 scrap |
  | `concrete` | 800 | 10 concrete + 15 scrap |
  | `reinforced` | 1600 | 10 concrete + 10 metal + 20 scrap |

- **Gates:** `GATE_HP = 0.75` (a gate has 0.75× its tier's HP and costs the same). At most one gate per layer.
  - Gates have no use yet (patrols leave by the gate in M7), so in M2 they exist only in the model and the starting base.
  - The ID-004 build menu offers walls only. A note goes on the M7 ticket to add gates to the build menu.
- **Post costs:** `POST_COST = { tower: { wood: 20, scrap: 10 }, 'wall-walk': { wood: 5, scrap: 5 }, ground: { wood: 5 } }`.
- **Resources (M2 subset of §11):** `type Material = 'scrap' | 'wood' | 'metal' | 'concrete'`, and `type Stock = Record<Material, number>`.
- **Start (§11):**
  - `START_STOCK = { scrap: 60, wood: 60, metal: 0, concrete: 0 }`, enough for a second full wood layer.
  - Starting base: column 0 with wood segments in rows 0–4, row 2 a gate, and tower posts at rows 1 and 3 (the M1 positions `(420, 120)` and `(420, 280)`).
  - `START_TIERS = ['wood']`.
- **Stand-in payout:** `standInPayout(hordeNumber, outcome): Stock`. A win pays `{ scrap: 15 + 5n, wood: 20 + 10n }` (n = horde number), so it keeps pace with the horde scaling. A loss pays a quarter of that, rounded down, matching design §2's cap.
- **Walking:** `WALK_SPEED = 80` (px/s).

## Review Focus

1. **Reinforce card, then write-back:** the card raises segment max HP in the fight. `baseAfter` must clamp to the base's max HP, so a fight can never permanently raise HP. A segment left at 0.5 HP stays standing: round up, never down to 0.
2. **Unbuilt slot = open gap:** a layer with an unbuilt row lets enemies straight through, and nearby enemies steer into it like a breach. No crash on a layer with 0 built segments.
3. **Refusals change nothing:** after any refused action, the input base and stock deep-equal their snapshots, and every action leaves its inputs untouched.
4. **Repair cost:** `ceil(cost × missing / max)` per material. One missing HP still costs ≥ 1 of each material in the tier cost, and a full-HP segment is refused ("nothing to repair").
5. **Two defenders drop onto one ground post:** reservations are taken in `defenders` array order, so the second goes to the next-nearest free ground post. With none free, the defender goes to the bench.
6. **Wall breaks under a walking defender's target:** the defender re-targets as if dropped. A move or recruit can never land on a post whose segment is broken or unbuilt.
7. **Moves while paused or finished:** `moveDefender` refuses during a card offer or after the outcome. Walking never advances while paused.
8. **M1 behaviour kept:** with the starting base, every M1 horde test passes after only setup changes (same wall `x`, same tower positions, same seed results). The one exception is row 2's HP, because row 2 is now the gate.

---

## ID-003 — Base model (core)

**Acceptance criteria (to go on the issue):**
- `Base` holds up to `COLUMNS.length` layers. Each layer has `SEGMENTS` slots, and each slot is either unbuilt or `{ kind: 'wall' | 'gate', tier, hp, maxHp }`. Posts sit only on grid slots, and each slot holds at most one post.
- Tiers wood → metal → concrete → reinforced use the HP and costs in the table above. A gate has 0.75× HP, and a layer has at most one gate.
- `buildSegment`, `upgradeSegment`, `repairSegment`, `repairAll` and `buildPost` follow these rules:
  - each is pure;
  - each refuses with a reason when the action isn't allowed (short of stock, tier locked, slot taken, nothing to repair, no wall under a wall-walk post, no wall in the column of a tower or ground post);
  - a wall-walk post may go on a broken (0 HP) segment; only an unbuilt row is refused;
  - each charges exactly the stated cost.
- Upgrade pays the next tier's full cost and refills the segment. Repair costs `ceil(cost × missing / max)` per material. A broken segment is repaired, not rebuilt.
- `newBase()` is the §11 starting base.
- `newHorde` builds from a `Base` and a chosen start post. `baseAfter(base, horde)` writes the damage back (clamped to max HP, rounded up), so damage carries over.
- Range depends on post kind (tower 1.25, wall-walk 1, ground 0.75).
- All M1 tests stay green; there are new tests for every action and refusal and for the write-back round trip.
- Version `0.2.2`.

### Task 1: Base data, types and build actions

**Files:**
- Modify: `src/core/data.ts`:
  - add the grid, tiers, costs, start values and walk speed above;
  - remove `WALL.x`, `WALL.segmentHp`, `WALL.segments`, `POSTS` and `TOWER_RANGE_BONUS` in Task 2, once nothing uses them.
- Create: `src/core/base.ts`
- Test: `src/core/base.test.ts`

**Interfaces (`base.ts`):**

```ts
export type Tier = 'wood' | 'metal' | 'concrete' | 'reinforced';
export type PostKind = 'tower' | 'wall-walk' | 'ground';
export interface BaseSegment { kind: 'wall' | 'gate'; tier: Tier; hp: number; maxHp: number }
export interface BaseLayer { column: number; slots: (BaseSegment | null)[] }   // SEGMENTS long; null = unbuilt
export interface BasePost { kind: PostKind; column: number; row: number }
export interface Base { layers: BaseLayer[]; posts: BasePost[] }               // layers by column; posts sorted (column, kind, row)
export type Result = { ok: true; base: Base; stock: Stock } | { ok: false; reason: string };
export function newBase(): Base
export function segmentMaxHp(kind: 'wall' | 'gate', tier: Tier): number
export function postXY(post: BasePost): { x: number; y: number }
export function buildSegment(base: Base, stock: Stock, tiers: readonly Tier[], column: number, row: number, kind: 'wall' | 'gate', tier: Tier): Result
export function upgradeSegment(base: Base, stock: Stock, tiers: readonly Tier[], column: number, row: number): Result
export function repairCost(seg: BaseSegment): Stock
export function repairSegment(base: Base, stock: Stock, column: number, row: number): Result
export function repairAllCost(base: Base): Stock
export function repairAll(base: Base, stock: Stock): Result          // all or nothing
export function buildPost(base: Base, stock: Stock, post: BasePost): Result
```

Refusal reasons are short player-facing strings, for example `Not enough wood`, `Metal is locked`, `Slot taken`, `Already at the top tier`, `Nothing to repair`, `A wall-walk post needs a wall`, `A tower needs a wall in front` and `This layer already has a gate`. The UI shows them as-is. A `RangeError` is thrown for a column outside `0…COLUMNS.length − 1`, a row outside `0…SEGMENTS − 1`, an unknown tier or kind, or a non-integer.

- [ ] **Step 1: Write the failing tests** in `base.test.ts`:
  - `newBase` matches the §11 start: column 0, 5 wood segments, row 2 a gate with 150 HP, the others 200 HP, and towers at rows 1 and 3 at `(420, 120)` and `(420, 280)`.
  - **Build:**
    - building a wood wall at column 1, row 0 charges 10 wood and 5 scrap and creates the layer;
    - building into a taken slot is refused;
    - building metal with `['wood']` is refused (`Metal is locked`);
    - building with 9 wood is refused;
    - a second gate in a layer is refused.
  - **Upgrade:**
    - upgrading a damaged wood segment (50/200) to metal charges metal's cost and gives 400/400;
    - upgrading reinforced is refused;
    - a gate stays a gate (300/300 at metal).
  - **Repair:**
    - repairing 1 missing HP costs `{ wood: 1, scrap: 1 }`;
    - repairing 0/200 costs `{ wood: 10, scrap: 5 }` and restores 200;
    - a full segment is refused;
    - `repairAll` with stock short by 1 is refused and charges nothing.
  - **Posts:**
    - a tower or ground post at a column with no wall is refused;
    - a wall-walk post on a broken (0 HP) segment is allowed;
    - a wall-walk on an unbuilt row is refused;
    - a second post on the same slot is refused;
    - posts stay sorted.
  - **Purity:** for one success and one refusal of each action, the input base and stock deep-equal their snapshots afterwards.
  - **Bad arguments:** a `RangeError` for column `3`, row `-1`, row `1.5` and `NaN`.
- [ ] **Step 2: Run** `npx vitest run src/core/base.test.ts` and expect FAIL.
- [ ] **Step 3: Implement** `data.ts` additions and `base.ts`, with `structuredClone` on success only.
- [ ] **Step 4: Run** the file and expect PASS; `npm run lint` is clean.
- [ ] **Step 5: Commit** (after approval): `Base model: tiers, costs, grid and build actions`

### Task 2: Horde fights on the base; damage carries over

**Files:**
- Modify: `src/core/horde.ts`, `src/core/cards.ts` (recruit post choice), `src/core/horde.test.ts`, `src/core/cards.test.ts`, `src/ui/app.ts`, `src/ui/render.ts` (minimal changes to keep the build green), `package.json` and `package-lock.json` (`0.2.2`)

**Interfaces:**
- `HordeSetup` becomes `{ hordeNumber; roster; startDefenderId; base: Base; startPostId: number }`. `startPostId` indexes `base.posts`.
- `Segment` gains `kind: 'wall' | 'gate' | null` and `tier: Tier | null`. An unbuilt slot is `{ kind: null, tier: null, hp: 0, maxHp: 0 }`, so the existing gap logic treats it as open.
- `Layer` gains `column`.
- `Post.kind` becomes `PostKind`, and a post gains `column` and `row`.
- `export function baseAfter(base: Base, horde: HordeState): Base` sets each built slot's `hp = min(base maxHp, ceil(fight hp))`. It throws `RangeError` if the horde's layers don't match the base's columns or slots.
- `defenderRange` uses `POST_RANGE[post.kind]`.
- **Recruit placement:** a recruit takes the free, usable post with the largest `x` (ties → lowest id), so it reaches furthest. A post is usable when it's not a wall-walk post over a broken or unbuilt segment. With the starting base, both towers are at `x = 420`, so post 0 still wins and M1 behaviour is kept.

- [ ] **Step 1: Update tests:**
  - M1 horde and cards tests use `setup()` with `base: newBase(), startPostId: 0`. The only expectation change: row 2 is now the starting gate (150 HP), so "enemies stop at the wall" expects 140, not 190.
  - New: "an unbuilt row is an open gap": with column 0 row 4 unbuilt, an enemy at `(530, 360)` reaches the camp.
  - New: "a layer with no segments is no wall".
  - New: "two layers: enemies stop at the outer one first".
  - New: "start post is the chosen one".
  - New: a `RangeError` for an unknown `startPostId` and for a wall-walk start post over a broken segment.
  - New: "ground post range is 0.75×".
  - New: "recruit skips a wall-walk post over a broken segment".
  - New: "recruit takes the furthest-forward free post" (a column-1 tower beats a column-0 ground post).
  - New: `baseAfter` round trip. After a fight that damages row 2, the returned base has that HP. The reinforce card plus a full patch-up write back exactly max HP, and a fight HP of 0.4 writes back 1.
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement.** Layers come from `base.layers` (x = `COLUMNS[column]`), and posts come from `base.posts` via `postXY`. Replace every `WALL.segments` with `SEGMENTS`, and remove the unused M1 constants. The app passes `newBase()` and post 0, so the page plays as before.
- [ ] **Step 4: QA:**
  - `npm ci && npm run lint && npm test && npm run build && npm run check:version` is all green;
  - run the page once to check it still plays like M1 (stop the dev server after).
- [ ] **Step 5: Commit** (after approval): `ID-003 Horde fights on the base; damage carries over`

---

## ID-004 — Build mode and the loop between hordes

**Acceptance criteria (to go on the issue):**
- The page opens in **build mode** on the starting base and stock.
- A stock bar shows scrap, wood, metal and concrete.
- Clicking an empty slot offers what can go there (a wall in each tier, or a post kind), each with its cost. Gates aren't offered in M2. Options that aren't allowed are shown disabled with the refusal reason.
- Clicking a built segment shows its HP and offers:
  - Upgrade (next tier and cost);
  - Repair (cost);
  - Wall-walk post (cost), if the segment doesn't have one yet.

  The wall-walk post slot is the segment itself, so it's reached through this menu.
- A "Repair all (cost)" button repairs everything or refuses with the reason.
- The player picks the start defender (from the roster) and a free, usable post, then clicks **Start Horde N**.
- After the result screen, the player returns to build mode:
  - damage has carried over;
  - the stand-in payout has been added;
  - a win raises the horde number and a loss keeps it.
- All text goes through `textContent`. Only finite, in-range grid coordinates reach core.
- Version `0.2.3`.

### Task 3: Game loop state (core)

**Files:**
- Create: `src/core/game.ts`
- Test: `src/core/game.test.ts`

**Interfaces:**

```ts
export interface GameState { hordeNumber: number; base: Base; stock: Stock; tiers: Tier[]; roster: DefenderSpec[] }
export function newGame(): GameState      // horde 1, newBase(), START_STOCK, START_TIERS, starter roster (moved from app.ts)
export function startHorde(game: GameState, seed: number, defenderId: string, postId: number): HordeState
export function finishHorde(game: GameState, horde: HordeState): GameState   // baseAfter + standInPayout + horde number
```

- `finishHorde` throws `RangeError` for a horde that is still `fighting`.
- A `build(game, result)` helper isn't needed: the UI applies a `Result` by setting `base` and `stock`.

- [ ] **Step 1: Write the failing tests:**
  - a win at horde 1 → horde 2, with + 20 scrap and + 30 wood, and damage carried;
  - a loss at horde 1 → horde 1, with + 5 scrap and + 7 wood;
  - a win at horde 4 pays + 35 scrap and + 60 wood;
  - finishing a fighting horde throws;
  - inputs are untouched.
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** and expect PASS; lint is clean.
- [ ] **Step 5: Commit** (after approval): `Game loop state between hordes`

### Task 4: Build mode UI

**Files:**
- Create: `src/ui/build.ts`. It builds a DOM panel: stock bar, slot menu, repair-all button, start defender and post pickers, and the Start button.
- Modify:
  - `src/ui/app.ts`: modes `build` → `fight` → `result` → `build`.
  - `src/ui/render.ts`: draws empty slots as faint outlines in build mode, tiers in distinct muted colours, unbuilt rows as nothing, gates with a gate mark, and posts by kind.
  - `src/ui/projection.ts`: add `slotAt(x, y)` to hit-test the grid. It returns `{ column, row, what: 'segment' | 'tower' | 'ground' } | null`. The wall band is always `'segment'`, because a wall-walk post sits on the segment and is built from the segment's menu.
  - `src/page.css`.
  - `README.md` "Status".
  - `package.json` and `package-lock.json` (`0.2.3`).
- Test: `src/ui/projection.test.ts` (`slotAt` hits each slot kind and misses between slots).

- [ ] **Step 1: Write the failing `slotAt` tests**, run them and expect FAIL. Then implement them and expect PASS.
- [ ] **Step 2: Implement** build mode and the mode loop.
- [ ] **Step 3: QA** from a clean install; all green.
- [ ] **Step 4: Verify in the browser:**
  - **Build:** a wood wall in column 1 lowers wood by 10. Spend wood until a wall costs more than you have; its option is then disabled with "Not enough wood". Locked tiers are shown as locked, and no gate option appears.
  - **Repair:** fight and lose some HP; back in build mode the HP is lower; Repair charges the shown cost.
  - **Start:** start from a ground post; the defender fires with a visibly shorter range.
  - **Results:** a win shows Horde 2 next, and a loss shows Horde 1 again.
  - Stop the dev server.
- [ ] **Step 5: Commit** (after approval): `ID-004 Build mode: place, upgrade and repair between hordes`

---

## ID-005 — Moving and dropping defenders mid-horde

**Acceptance criteria (to go on the issue):**
- In a fight, clicking one of your defenders selects it, and clicking a post sends it there.
- The defender leaves its post at once (the post is free) and walks in a straight line at `WALK_SPEED`. It doesn't fire while walking and takes the post on arrival.
- The target post is reserved while the defender walks.
- A move is refused when:
  - the post is taken or reserved;
  - it's a wall-walk post over a broken or unbuilt segment;
  - it's the defender's own post;
  - a card offer is open;
  - the fight is over.
- When a segment breaks, each defender on a wall-walk post on it drops:
  - in `defenders` array order, each walks to the nearest free ground post behind that layer (smaller `x`);
  - with none free, the defender goes to the bench and can come back by a recruit card.
- A defender walking to a post whose segment breaks re-targets the same way.
- Escape or clicking empty ground clears the selection. Clicking an enemy still sets focus.
- Version `0.3.0`.

### Task 5: Moves, walking and dropping (core)

**Files:**
- Modify: `src/core/horde.ts`, `src/core/horde.test.ts`

**Interfaces:**
- `Defender` gains `x`, `y`, `postId: number | null` and `walking: boolean`. `Post.defenderId` means "occupied or reserved by".
- `export function moveDefender(state: HordeState, defenderId: string, postId: number): { ok: true; state: HordeState } | { ok: false; reason: string }`. It throws `RangeError` for an unknown defender or post id.
- **Step order:**
  1. spawn
  2. **walk**
  3. fire (skips walking defenders)
  4. remove dead
  5. move
  6. separate
  7. attack (a segment that reaches 0 triggers **drop** within the same step)
  8. wave
  9. outcome

- [ ] **Step 1: Write the failing tests:**
  - **Move:** a move frees the old post, reserves the new one, and arrives after `distance / WALK_SPEED` s (±1 step); the defender doesn't fire while walking.
  - **Refused moves** (each leaves the state deep-equal):
    - to a taken post;
    - to a reserved post;
    - to a wall-walk post over a broken segment;
    - to its own post;
    - during an offer;
    - after the outcome.
  - **Drop:** a segment breaking under 2 wall-walk defenders sends them to the 2 nearest free ground posts behind that layer, in id order. With no ground post free, the defender goes to the bench.
  - **Re-target:** a walker whose target segment breaks re-targets.
  - **Determinism:** the same seed and the same moves at the same times give deep-equal states.
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** and expect PASS; lint is clean.
- [ ] **Step 5: Commit** (after approval): `Defenders walk between posts and drop when a wall breaks`

### Task 6: In-fight move UI

**Files:**
- Modify:
  - `src/ui/app.ts`: click order is own defender → select; then a post when a defender is selected → `moveDefender`, showing the refusal reason as a short HUD toast; then an enemy → focus; then empty ground → clear both.
  - `src/ui/render.ts`: selected ring, walking defenders drawn at `x, y`, reserved posts marked.
  - `src/ui/hud.ts`: toast.
  - `README.md`.
  - `package.json` and `package-lock.json` (`0.3.0`).

- [ ] **Step 1: Implement.**
- [ ] **Step 2: QA** from a clean install; all green.
- [ ] **Step 3: Verify in the browser:**
  - **Move:** build a wall-walk post, start a fight, and move a defender to it; the walk is visible and firing starts on arrival.
  - **Drop:** build a ground post in column 0 first, then let the wall-walk segment break; the defender drops to that ground post.
  - **Refusal:** move to a taken post; the toast shows the reason.
  - **Clicks:** focus clicks still work; a drag still pans.
  - Stop the dev server.
- [ ] **Step 4: Commit** (after approval): `ID-005 Move defenders mid-horde; drop when a wall breaks`
