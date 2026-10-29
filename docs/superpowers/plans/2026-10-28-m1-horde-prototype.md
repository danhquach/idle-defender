# Milestone 1 — Horde Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable single horde in the browser: a fake-3D base view with a camp on the left, one wood wall layer, Gunners on two tower posts, a crowd of shamblers rushing in from the right in waves (no lanes), closest-first targeting with click-to-focus, in-fight XP with 1-of-3 upgrade/recruit cards, and a win/lose result.

**Architecture:** A pure, deterministic simulation in `src/core/**` (`newHorde` → `tick(state, dt)` → `chooseCard` / `setFocus`) running on a fixed 1/30 s internal step, so results never depend on frame rate. The world is an open 2D field (`x` left→right, `y` top→bottom); there are no lanes. The UI in `src/ui/**` projects it into an angled overhead view on a plain Canvas 2D (no engine, no new dependency), and shows HUD, card offers and the result as DOM built with `textContent`.

**Tech Stack:** TypeScript, Vite, Vitest, Canvas 2D, plain DOM.

**Spec:** `docs/design.md` (§2, §3, §4, §8, §9, §14 steps 1–2, §16).

## Roadmap

Phases, milestones and tickets live on GitHub (milestones M1–M11, tickets ID-001…ID-040). One plan per milestone, written when the previous milestone lands. This plan is M1 = ID-001 + ID-002.

**M1 stand-in:** the design's loss rule (every layer broken at any one gap + every field defender injured, design §2/§4) needs defender HP and enemies attacking defenders; that arrives in ID-006. Until then M1 uses a simple **camp HP** stand-in: enemies past the wall hit the camp, and camp HP 0 loses.

## Global Constraints

- `src/core/**` stays pure: no DOM, storage or UI imports (ESLint enforces it). The UI imports core, never the reverse.
- Randomness only through `src/core/rng.ts` (`rngFrom`, `int`, `pick`, `chance`); never `Math.random`.
- Text reaches the page only through `textContent` / DOM nodes; no `innerHTML` or other HTML sinks.
- No new runtime dependency: Canvas 2D only (this plan's call for design §16's open rendering choice: a few hundred sprites with depth sorting fit Canvas 2D, and it keeps the CSP `script-src 'self'` with no `unsafe-eval`).
- Every number lives in `src/core/data.ts`; every number there is a design "starting point".
- Desktop browser, landscape, mouse and keyboard (§16).
- Naming: `hordeNumber` = the progress level (Horde 1, 2, 3 …); `level`/`xp` = the fight level that triggers card picks (design §2/§4).
- Public repo: no commercial game names, no local paths, no secrets (CLAUDE.md).
- Workflow per CLAUDE.md: work on an issue branch in its own worktree; `npm ci && npm run lint && npm test && npm run build` green; senior review; **PM approval before each commit** (the PM may approve a batch of task commits up front); version in `package.json` raised over main's before each PR. Tickets: Tasks 1–4 = ID-001 (bump to `0.1.1` with Task 4), Tasks 5–6 = ID-002 (bump to `0.2.0` in Task 6).

## Review Focus

1. **Tab hidden or a long frame** → the fight must not jump ahead or fire a burst of events: the UI clamps dt to 0.1 s and pauses while the tab is hidden; the camp runs any dt in fixed steps (Task 2 test "same result for one big tick and many small ticks").
2. **Two level-ups from one kill burst** → one offer at a time; the second offer opens right after the first is chosen, and no XP is lost (Task 4 test "queues a second level-up").
3. **Recruit card with nowhere to go** → never offered when every post is taken or the bench is empty (Task 4 test "offers no recruit without a free post or bench").
4. **One wall segment breaks** → enemies in front of it walk through, enemies near the wall slide into the gap, enemies far out keep walking straight; nobody crosses a standing segment (Task 2 tests "a breach pulls nearby enemies through" and "far enemies don't steer yet").
5. **Last enemy dies as the camp takes its last hit** → defenders fire before enemies attack in a step, so a killed enemy never deals damage that step; core HP 0 is always `lost` (Task 3 tests "a killed enemy deals no damage that step" and "camp at 0 HP loses even with no enemies left").
6. **Crowd piles on one spot** → separation pushes enemies apart along `y` only (never along `x`, so it can't push one through a wall), order-independent and capped per step, and clamped to the field (Task 2 test "enemies push apart").
7. **Focus target dies, leaves range or was never valid** → focus clears on death; a defender out of range of it falls back to closest-first without clearing it; `setFocus` rejects unknown ids (Task 3 focus tests).

---

### Task 1: Data, wave plan and XP curve

**Files:**
- Create: `src/core/data.ts`
- Create: `src/core/waves.ts`
- Test: `src/core/waves.test.ts`

**Interfaces:**
- Produces (`data.ts`), exact values:
  - `STEP = 1 / 30`
  - `FIELD = { right: 1600, height: 400 }` (open field, `y` in `0…height`)
  - `CAMP = { x: 120, maxHp: 500 }`
  - `WALL = { x: 500, depth: 20, segmentHp: 200, segments: 5 }` (segments split the wall top to bottom; `SEGMENT_HEIGHT = FIELD.height / WALL.segments` = 80, segment `i` covers `y` in `[i * 80, (i + 1) * 80)`)
  - `ENEMY_RADIUS = 12`, `SEPARATION_SPEED = 60`, `GAP_SENSE = 200`
  - `POSTS: readonly { x: number; y: number; kind: 'tower' }[] = [{ x: 420, y: 120, kind: 'tower' }, { x: 420, y: 280, kind: 'tower' }]`
  - `TOWER_RANGE_BONUS = 1.25`
  - `type WeaponId = 'pistol'`; `WEAPONS: Record<WeaponId, { damage: number; fireInterval: number; range: number }> = { pistol: { damage: 6, fireInterval: 0.6, range: 600 } }`
  - `type EnemyKind = 'shambler'`; `ENEMIES: Record<EnemyKind, { hp: number; speed: number; damage: number; attackInterval: number; xp: number }> = { shambler: { hp: 20, speed: 30, damage: 5, attackInterval: 1, xp: 1 } }`
  - `SPAWN_INTERVAL = 0.8`, `WAVE_BREAK = 3`, `SHOT_TRAIL = 0.15`
  - `RECRUIT_CHANCE = { small: 0.3, large: 0.15, largeFrom: 3 }` (squad size ≥ `largeFrom` uses `large`)
- Produces (`waves.ts`):
  - `waveCount(hordeNumber: number): number` = `min(10, 5 + floor((hordeNumber - 1) / 2))`
  - `waveSize(hordeNumber: number, wave: number): number` = `round((8 + 4 * (wave - 1)) * 1.1 ** (hordeNumber - 1))`
  - `enemyHp(kind: EnemyKind, hordeNumber: number, wave: number): number` = `round(ENEMIES[kind].hp * 1.10 ** (wave - 1) * 1.15 ** (hordeNumber - 1))` (design §9 scaling)
  - `xpToNext(level: number): number` = `round(10 * 1.4 ** (level - 1))`
  - All four throw `RangeError` for a non-integer or < 1 argument.

- [ ] **Step 1: Write the failing tests** in `src/core/waves.test.ts`:
  - `waveCount`: `waveCount(1) === 5`, `waveCount(3) === 6`, `waveCount(20) === 10`.
  - `waveSize`: `waveSize(1, 1) === 8`, `waveSize(1, 5) === 24`, `waveSize(2, 1) === 9`.
  - `enemyHp`: `enemyHp('shambler', 1, 1) === 20`, `enemyHp('shambler', 1, 2) === 22`, `enemyHp('shambler', 2, 1) === 23`.
  - `xpToNext`: `[1, 2, 3, 4].map(xpToNext)` equals `[10, 14, 20, 27]`.
  - Each function throws `RangeError` for `0`, `1.5` and `NaN`.
- [ ] **Step 2: Run** `npx vitest run src/core/waves.test.ts` — expect FAIL (module not found).
- [ ] **Step 3: Implement** `data.ts` (constants only, all `as const`/`readonly`) and the four functions in `waves.ts`.
- [ ] **Step 4: Run** `npx vitest run src/core/waves.test.ts` — expect PASS; `npm run lint` clean.
- [ ] **Step 5: Commit** (after approval): `git add src/core/data.ts src/core/waves.ts src/core/waves.test.ts && git commit -m "Horde data, wave plan and XP curve"`

---

### Task 2: Horde state, spawning, movement, wall and camp damage

**Files:**
- Create: `src/core/horde.ts`
- Test: `src/core/horde.test.ts`

**Interfaces:**
- Consumes: Task 1 (`data.ts`, `waves.ts`), `rng.ts`.
- Produces (`horde.ts`):

```ts
export interface DefenderSpec { id: string; name: string; weapon: WeaponId }
export interface HordeSetup { hordeNumber: number; roster: DefenderSpec[]; startDefenderId: string }
export interface Enemy { id: number; kind: EnemyKind; x: number; y: number; hp: number; maxHp: number; nextAttackAt: number }
export interface Segment { index: number; hp: number; maxHp: number }
export interface Layer { x: number; segments: Segment[] }        // WALL.segments, top to bottom
export interface Post { id: number; x: number; y: number; kind: 'tower'; defenderId: string | null }
export interface Defender extends DefenderSpec { nextShotAt: number }
export interface Shot { fromX: number; fromY: number; toX: number; toY: number; at: number }
export interface Mods { damage: number; fireRate: number; range: number }   // multipliers, start at 1
export type Card = { kind: 'upgrade'; id: UpgradeId } | { kind: 'recruit'; defender: DefenderSpec }
export type Outcome = 'fighting' | 'won' | 'lost';
export interface HordeState {
  time: number; acc: number; rng: RngState;
  hordeNumber: number; wave: number; waveCount: number;
  toSpawn: number; nextSpawnAt: number; breakUntil: number;
  enemies: Enemy[]; nextEnemyId: number;
  layers: Layer[]; camp: { hp: number; maxHp: number };
  posts: Post[]; defenders: Defender[]; bench: DefenderSpec[];
  xp: number; level: number; offer: Card[] | null; mods: Mods;
  focusId: number | null;   // player-picked target (Task 3); null = closest-first
  shots: Shot[]; outcome: Outcome;
}
export function newHorde(seed: number, setup: HordeSetup): HordeState
export function tick(state: HordeState, dt: number): HordeState   // returns a new state; `state` untouched
```

`UpgradeId` is declared in Task 4's `cards.ts`; in this task declare it in `horde.ts` as `export type UpgradeId = 'sharpshooter' | 'rapid-fire' | 'long-sight' | 'patch-up' | 'reinforce'` and have Task 4 import it from here.

Behaviour this task pins:
- `newHorde`: wave 1, `toSpawn = waveSize(h, 1)`, `nextSpawnAt = 0`; one layer at `WALL.x` with `WALL.segments` segments (index 0…) of `WALL.segmentHp`; camp at `CAMP.maxHp`; posts from `POSTS` with ids 0…; the start defender on post 0; the rest of the roster on `bench`; `level = 1`, `xp = 0`, mods all 1, `focusId = null`, outcome `fighting`. Throws `RangeError` if `startDefenderId` is not in the roster.
- `tick`: throws `RangeError` for negative or non-finite dt. Adds dt to `acc` and runs whole `STEP`s, counting `acc >= STEP - 1e-9` as a whole step and then `acc = max(0, acc - STEP)`, so float error never drops or adds a step; `time += STEP` per step. Leftover stays in `acc`. Does nothing (and keeps `acc` at 0) while `offer !== null` or `outcome !== 'fighting'`.
- Each step, in this order: spawn → defenders fire (Task 3) → remove dead (Task 3) → enemies move → enemies separate → enemies attack → wave progression (Task 3) → outcome.
- **Spawn:** while `toSpawn > 0` and `time >= nextSpawnAt` and `time >= breakUntil`: one enemy at `x = FIELD.right`, `y = int(rng, ENEMY_RADIUS, FIELD.height - ENEMY_RADIUS)`, hp `enemyHp('shambler', h, wave)`; `nextSpawnAt = time + SPAWN_INTERVAL`.
- **Segment under an enemy:** `segmentAt(y) = min(WALL.segments - 1, floor(y / SEGMENT_HEIGHT))`. Walls ignore the enemy's radius.
- **Move** (per enemy, in id order, no full path-finding — design §3):
  - Its **next layer** is the one with the largest `x` among layers with `layer.x + WALL.depth <= enemy.x` (not yet crossed). With none, its stop line is `CAMP.x`.
  - If the next layer's segment at `segmentAt(y)` has `hp > 0`, the stop line is `layer.x + WALL.depth`; otherwise the enemy is in a gap and walks on (to the next layer or the camp).
  - **Steer into a gap:** if the segment ahead is standing, the layer has a broken segment, and `enemy.x - stopLine <= GAP_SENSE`, the enemy slides along `y` toward the centre of the nearest broken segment (ties → lower index) by up to `speed * STEP`, and stops sliding as soon as `segmentAt(y)` is that broken segment.
  - It moves left by `speed * STEP` and never past its stop line.
- **Separate:** for every pair closer than `2 * ENEMY_RADIUS` (by `hypot`), each is pushed apart along `y` only by half the overlap, capped at `SEPARATION_SPEED * STEP` per step; the lower id goes up (smaller `y`), and on equal `y` too. Pushes are computed from the positions before any push is applied (order-independent), summed per enemy, then `y` is clamped to `[ENEMY_RADIUS, FIELD.height - ENEMY_RADIUS]`. Never along `x`, so separation can't carry an enemy through a wall. O(n²) is fine for a few hundred enemies.
- **Attack:** an enemy at its stop line with `time >= nextAttackAt` deals `damage` to the standing segment at `segmentAt(y)` (or the camp) and sets `nextAttackAt = time + attackInterval`. HP floors at 0.

- [ ] **Step 1: Write the failing tests** in `src/core/horde.test.ts` (helper `setup()` = horde 1, roster of three pistol defenders `a`, `b`, `c`, start `a`):
  - `newHorde` "starts wave 1 with one defender on post 0": `wave === 1`, `toSpawn === 8`, `posts[0].defenderId === 'a'`, `posts[1].defenderId === null`, `bench.map(d => d.id)` equals `['b', 'c']`, `layers[0].segments.length === 5`, `camp.hp === 500`.
  - "rejects an unknown start defender": `newHorde(1, { ...setup(), startDefenderId: 'x' })` throws `RangeError`.
  - "rejects bad dt": `tick(s, -1)` and `tick(s, NaN)` throw `RangeError`.
  - "same seed, same result": two `newHorde(1, setup())` states each given `tick(·, 5)` deep-equal.
  - "leaves the input state untouched": deep-equal snapshot of `s` before and after `tick(s, 1)`.
  - "same result for one big tick and many small ticks": with posts emptied (`defenders: []`, all `defenderId: null`) so nothing dies, `tick(s, 2)` deep-equals 120 calls of `tick(·, 1/60)` (compare all fields except `acc`, which may differ by float error < 1e-9).
  - Movement tests below (from "enemies stop at the wall" on) run with posts emptied (no defenders) and `toSpawn = 0`, so only the placed enemies move and nobody shoots them.
  - "spawns at the right edge every 0.8 s": with no defenders, after `tick(s, 1)` there are 2 enemies (spawned at t=0 and t=0.8), both at `x <= 1600` and `y` in 12…388.
  - "enemies stop at the wall and hit their segment": no defenders, spawning off (`toSpawn = 0`, one enemy kept so the wave doesn't end), one enemy at `x = 530, y = 200` (segment 2) built with `nextAttackAt: 0`; after `tick(s, 1.5)` its `x === 520`, `y === 200` and `layers[0].segments[2].hp === 190` (hits on arrival at t≈0.33 and at t≈1.33); the other segments are untouched.
  - "a breach pulls nearby enemies through": segment 2 hp 0; enemy A at `x = 530, y = 200` (in the gap) and enemy B at `x = 530, y = 300` (segment 3, standing); after `tick(s, 15)` A has `x === 120` and the camp has taken damage; B has slid to `y < 240` and is at `x < 500`; `layers[0].segments[3].hp === 200`.
  - "far enemies don't steer yet": segment 2 hp 0; one enemy at `x = 900, y = 300`; after `tick(s, STEP)` its `y === 300` and `x` is close to 899 (`toBeCloseTo`).
  - "nobody crosses a standing segment": all segments standing; 20 enemies at `x = 530` spread over `y` 20…380; after `tick(s, 10)` every enemy has `x >= 520`.
  - "enemies push apart": two enemies at `x = 520, y = 200` (ids 0 and 1, wall standing); after `tick(s, 1)` enemy 0 has the smaller `y`, `|y0 − y1| >= 24 − 1e-6`, and both `y` stay in 12…388; with both at `y = 12`, after `tick(s, 1)` neither has `y < 12`.
  - "the camp floors at 0 and the horde is lost": core hp 3, enemy at `x = 120` past a broken segment, after `tick(s, 1)` `camp.hp === 0` and `outcome === 'lost'`; a further `tick` changes nothing.
- [ ] **Step 2: Run** `npx vitest run src/core/horde.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** `newHorde` and `tick` (spawn, move with gap steering, separate, attack, outcome `lost`) in `horde.ts`. Clone with `structuredClone` once per `tick`; step with a private `step(s: HordeState, rng: Rng): void`. Leave fire/remove/wave progression as no-ops for Task 3.
- [ ] **Step 4: Run** the test file — PASS; `npm run lint` clean.
- [ ] **Step 5: Commit** (after approval): `git commit -m "Horde sim: spawning, movement, wall and camp damage"`

---

### Task 3: Defenders fire, focus, kills, XP, waves and winning

**Files:**
- Modify: `src/core/horde.ts`
- Test: `src/core/horde.test.ts` (new `describe('combat')` and `describe('focus')`)

**Interfaces:**
- Consumes: Task 2 types; `WEAPONS`, `TOWER_RANGE_BONUS`, `SHOT_TRAIL`, `WAVE_BREAK`, `ENEMY_RADIUS`, `waveSize`, `waveCount`, `xpToNext`.
- Produces:
  - `export function defenderRange(state: HordeState, post: Post, defender: Defender): number` = `WEAPONS[weapon].range * (post.kind === 'tower' ? TOWER_RANGE_BONUS : 1) * mods.range`.
  - `export function setFocus(state: HordeState, enemyId: number | null): HordeState` — returns a new state with `focusId` set (or cleared with `null`); throws `RangeError` (input untouched) for an id that is not a living enemy or not a safe integer. Works while an offer is open or the horde is over (it only sets the field).
  - `export function enemyAt(state: HordeState, x: number, y: number): number | null` — id of the living enemy nearest to `(x, y)` within `2 * ENEMY_RADIUS` (ties → lowest id), else `null`; non-finite input → `null`. The UI's click picking.

Behaviour (design §4 Targeting):
- **Fire:** for each post with a defender whose `time >= nextShotAt`, distance = `hypot(enemy.x - post.x, enemy.y - post.y)`:
  - if `focusId` is a living enemy within range → shoot it;
  - else shoot the living enemy **closest to the post** within range; ties → lowest `id`.
  - Hit for `damage * mods.damage`; `nextShotAt = time + fireInterval / mods.fireRate`; push a `Shot` (post → enemy). No target → no shot, `nextShotAt` unchanged. `shots` older than `SHOT_TRAIL` are dropped each step.
- **Remove dead:** enemies at hp ≤ 0 are removed; if one was the focus, `focusId = null`; each gives `ENEMIES[kind].xp`. While `xp >= xpToNext(level)` and no offer is open: `xp -= xpToNext(level)`, `level += 1`, open an offer (Task 4; in this task leave `offer` null and only count levels).
- **Wave progression:** when `toSpawn === 0` and no enemies remain: if `wave === waveCount` → `outcome = 'won'`; else `wave += 1`, `toSpawn = waveSize(h, wave)`, `breakUntil = time + WAVE_BREAK`.
- **Outcome:** `camp.hp === 0` → `lost`, checked after attacks, and it beats `won`.

- [ ] **Step 1: Write the failing tests:**
  - "tower range is 750 for a pistol": `defenderRange(s, s.posts[0], s.defenders[0]) === 750`.
  - "shoots the enemy closest to the defender": post 0 at `(420, 120)`; enemy P at `(800, 390)` (distance ≈ 466, smaller `x`) and enemy Q at `(850, 120)` (distance 430); after one `tick(s, STEP)` Q has `hp === 14` and P `20` (closest to the defender wins, not closest to the camp).
  - "doesn't shoot out of range": a lone enemy at `(1300, 120)` → after `tick(s, STEP)` its hp is 20 and `shots` is empty.
  - "a shot line runs post → target": after the closest-first shot above, `shots[0]` is `{ fromX: 420, fromY: 120, toX: 850, toY: 120 }` plus `at`.
  - "fires every 0.6 s": one enemy with hp 1000 in range; after `tick(s, 1.25)` its hp is `1000 - 6 * 3`.
  - "a kill gives XP and levels up at 10": 10 enemies with hp 1 in range; after enough ticks to kill all, `level === 2`, `xp === 0`.
  - "next wave after a 3 s break": clear wave 1 (no enemies, `toSpawn = 0`), `tick(s, STEP)` → `wave === 2`, `toSpawn === 12`; after `tick(s, 2.9)` no enemy has spawned; after `tick(s, 0.2)` one has.
  - "wins after the last wave": `wave = waveCount`, `toSpawn = 0`, no enemies → `outcome === 'won'`.
  - "a killed enemy deals no damage that step": enemy hp 1 at its stop line with `nextAttackAt = 0`, in range → after `tick(s, STEP)` segment hp is unchanged.
  - "camp at 0 HP loses even with no enemies left": `camp.hp = 0`, last wave cleared → `outcome === 'lost'`.
  - Focus (same P/Q setup):
    - "focus beats closest": `setFocus(s, P.id)` then `tick(·, STEP)` → P `hp === 14`, Q `20`.
    - "focus out of range falls back to closest": a third enemy R at `(1300, 120)`; `setFocus(s, R.id)` then `tick(·, STEP)` → Q is hit, R untouched, `focusId === R.id` still.
    - "focus clears when the target dies": P at hp 1, focused → after `tick(·, STEP)` P is gone and `focusId === null`.
    - "setFocus validates": unknown id, `NaN`, `1.5` and `-1` throw `RangeError` with the input untouched; `setFocus(s, null)` clears; the input state of a valid call is untouched.
    - "enemyAt picks the nearest within reach": `enemyAt(s, 852, 118) === Q.id`; `enemyAt(s, 600, 250) === null`; `enemyAt(s, NaN, 0) === null`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** fire with focus, `setFocus`, `enemyAt`, remove-dead, wave progression and outcome precedence in `horde.ts`.
- [ ] **Step 4: Run** `npm test` — PASS (Task 2 tests still pass); `npm run lint` clean.
- [ ] **Step 5: Commit** (after approval): `git commit -m "Horde sim: closest-first fire, click focus, XP, waves, win and loss"`

---

### Task 4: Cards — offers, pause, upgrades and recruits

**Files:**
- Create: `src/core/cards.ts`
- Modify: `src/core/horde.ts` (open an offer on level-up)
- Test: `src/core/cards.test.ts`

**Interfaces:**
- Consumes: `HordeState`, `Card`, `UpgradeId`, `DefenderSpec` (Task 2), `RECRUIT_CHANCE`.
- Produces:
  - `export const UPGRADES: Record<UpgradeId, { name: string; text: string }>` — names/text: `sharpshooter` "Sharpshooter" "+20% damage"; `rapid-fire` "Rapid Fire" "+15% fire rate"; `long-sight` "Long Sight" "+15% range"; `patch-up` "Patch Up" "Repair every wall segment by 30% of its max HP"; `reinforce` "Reinforce" "+25% wall max HP".
  - `export function rollOffer(rng: Rng, state: HordeState): Card[]` — 3 cards. Each slot is a recruit with probability `RECRUIT_CHANCE.small` (squad size < `largeFrom`) or `.large`, only when a post is free and the bench has someone; at most one recruit per offer, a random bench member. Other slots: distinct upgrades picked with `pick`.
  - `export function chooseCard(state: HordeState, index: number): HordeState` — returns a new state; throws `RangeError` (input untouched) with no open offer or an index outside 0…2.
  - Effects: `sharpshooter` `mods.damage *= 1.2`; `rapid-fire` `mods.fireRate *= 1.15`; `long-sight` `mods.range *= 1.15`; `patch-up` each segment `hp = min(maxHp, hp + 0.3 * maxHp)` (broken ones too); `reinforce` each segment `maxHp *= 1.25` and `hp` rises by the same amount. A recruit leaves the bench, joins `defenders` with `nextShotAt = time`, and takes the lowest-id free post.
  - After choosing, if `xp >= xpToNext(level)` still holds, the next offer opens at once (level rises again).
- Modify `horde.ts`: on level-up set `offer = rollOffer(rng, s)` and stop stepping for this tick (`acc = 0`).

- [ ] **Step 1: Write the failing tests** in `src/core/cards.test.ts`:
  - "a level-up opens an offer of 3 and pauses": `xp = 9` and one hp-1 enemy at `(600, 120)`; after `tick(s, STEP)` `level === 2` and `offer.length === 3`; a further `tick(s, 5)` deep-equals the state before it.
  - "upgrades in one offer are distinct": over 200 seeds, no offer has a repeated upgrade id.
  - "offers no recruit without a free post or bench": both posts filled → no `recruit` card in 200 seeded offers; empty bench → same.
  - "offers at most one recruit": over 200 seeds, never 2+ recruit cards.
  - "recruit takes the free post": set `offer` to `[{ kind: 'recruit', defender: bench[0] }, { kind: 'upgrade', id: 'sharpshooter' }, { kind: 'upgrade', id: 'reinforce' }]`, `chooseCard(s, 0)` → that defender is on post 1, gone from `bench`, in `defenders`, and `offer === null`.
  - "applies each upgrade": `sharpshooter` → `mods.damage === 1.2`; `rapid-fire` → `1.15`; `long-sight` → `1.15`; `patch-up` on a segment at hp 0/200 → 60; `reinforce` on a full 200 segment → `maxHp === 250`, `hp === 250`.
  - "queues a second level-up": `xp = 23` at level 1 and one hp-1 enemy at `(600, 120)`; `tick(s, STEP)` → `level === 2`, `xp === 14`, offer open; `chooseCard(s, 0)` → a new offer is open, `level === 3`, `xp === 0`.
  - "rejects a bad choice": `chooseCard` with no offer, index 3 and index −1 each throw `RangeError`.
- [ ] **Step 2: Run** `npx vitest run src/core/cards.test.ts` — FAIL.
- [ ] **Step 3: Implement** `cards.ts` and the level-up hook in `horde.ts`.
- [ ] **Step 4: Run** `npm test` — PASS; `npm run lint` clean.
- [ ] **Step 5: Commit** (after approval): `git commit -m "Horde cards: upgrade and recruit offers"`

---

### Task 5: Projection and camera

**Files:**
- Create: `src/ui/projection.ts`
- Test: `src/ui/projection.test.ts`

**Interfaces:**
- Consumes: `FIELD` from `data.ts`.
- Produces:

```ts
export interface Camera { x: number; y: number; zoom: number }
export interface View { w: number; h: number }
export const TILT = 0.6;          // field depth (y) squash
export const HEIGHT_SCALE = 0.8;  // how much world height lifts a sprite on screen
export const ZOOM = { min: 0.5, max: 2 };
export const MARGIN_Y = 80;       // camera may show a strip above the field
export function project(p: { x: number; y: number; z?: number }, cam: Camera): { sx: number; sy: number; scale: number }
export function unproject(s: { sx: number; sy: number }, cam: Camera): { x: number; y: number }   // ground (z = 0)
export function clampCamera(cam: Camera, view: View): Camera
export function zoomAt(cam: Camera, factor: number, anchor: { sx: number; sy: number }, view: View): Camera
export function depthSort<T extends { y: number; x: number }>(items: readonly T[]): T[]
```

- `project`: `sx = (x - cam.x) * zoom`, `sy = (y - cam.y) * zoom * TILT - (z ?? 0) * zoom * HEIGHT_SCALE`, `scale = zoom`.
- `unproject`: the inverse of `project` at `z = 0`: `x = sx / zoom + cam.x`, `y = sy / (zoom * TILT) + cam.y`. Used for click-to-focus.
- `clampCamera`: zoom into `[ZOOM.min, ZOOM.max]`; `x` into `[0, max(0, FIELD.right - view.w / zoom)]`; `y` into `[-MARGIN_Y, max(-MARGIN_Y, FIELD.height - view.h / (zoom * TILT))]`.
- `zoomAt`: the world x under `anchor.sx` stays under it after zooming (before clamping), then clamps.
- `depthSort`: back to front — `y` ascending, then `x` descending; returns a new array.

- [ ] **Step 1: Write the failing tests:**
  - "projects with tilt and height": `project({ x: 150, y: 80 }, { x: 100, y: 0, zoom: 2 })` → `{ sx: 100, sy: 96, scale: 2 }`; with `z: 10` → `sy === 80`.
  - "unprojects a click to the ground": `unproject({ sx: 100, sy: 96 }, { x: 100, y: 0, zoom: 2 })` → `{ x: 150, y: 80 }`.
  - "clamps zoom and pan": `clampCamera({ x: -50, y: 0, zoom: 5 }, { w: 800, h: 600 })` → `zoom === 2`, `x === 0`; `x: 5000` at zoom 1, w 800 → `x === 800`.
  - "zooms around the cursor": cam `{ x: 200, y: 0, zoom: 1 }`, view `{ w: 800, h: 600 }`, anchor `{ sx: 400, sy: 0 }`, factor 2 → result `zoom === 2`, `x === 400` (world x 600 stays under the anchor).
  - "sorts back to front": items `[{y:160,x:10},{y:0,x:5},{y:0,x:50}]` → `[{y:0,x:50},{y:0,x:5},{y:160,x:10}]`.
- [ ] **Step 2: Run** `npx vitest run src/ui/projection.test.ts` — FAIL.
- [ ] **Step 3: Implement** the five functions.
- [ ] **Step 4: Run** — PASS; `npm run lint` clean.
- [ ] **Step 5: Commit** (after approval): `git commit -m "Base view projection and camera"`

---

### Task 6: Playable page — canvas, HUD, card picks, result

**Files:**
- Create: `src/ui/render.ts` — `drawScene(ctx: CanvasRenderingContext2D, state: HordeState, cam: Camera, view: View): void`
- Create: `src/ui/hud.ts` — `createHud(root: HTMLElement, onChoose: (index: number) => void, onRestart: () => void): { update(state: HordeState): void }`
- Create: `src/ui/app.ts` — `start(root: HTMLElement): void`
- Modify: `src/main.ts`, `src/page.css`, `package.json` (`"version": "0.2.0"`), `package-lock.json` (same version, via `npm install --package-lock-only`)
- Modify: `README.md` "Status" (one line: the M1 horde prototype is playable)

**Interfaces:**
- Consumes: `newHorde`, `tick`, `chooseCard`, `setFocus`, `enemyAt`, `UPGRADES`, data constants, Task 5 projection.

Behaviour:
- `drawScene` (placeholder art, design §15): one ground field `0…FIELD.height`; the wall as one extruded box per segment (top face lighter, front face darker, cracked/greyed at hp 0); the camp as a tall box at `CAMP.x`; posts as raised platforms; defenders as blue blocks with height 30; enemies as green circles with a shadow and a red/green HP bar; the focused enemy with a bright ring; shots as short yellow lines; everything drawn in `depthSort` order. Colours as CSS-independent constants in `render.ts`, muted except enemies (design §15).
- `hud.ts`: top bar shows `Horde N · Wave w/W · Camp hp/max · Lv L (xp/next)`; a card panel lists the offer as three buttons (name + text for upgrades, `Recruit <name>` for recruits) and keys `1`/`2`/`3` pick; a result panel shows `Horde held` or `The camp fell` and a `Fight again` button. All text via `textContent`.
- `app.ts`: canvas sized to the window (device-pixel-ratio aware); a fixed starter setup (horde 1; roster `Bob`, `Jack`, `John` with pistols, start `Bob` — names are placeholders); `requestAnimationFrame` loop with dt clamped to 0.1 s; pauses on `document.hidden`; camera pans with arrow keys/WASD and mouse drag, zooms with the wheel via `zoomAt`; starts framed on the whole field (`clampCamera`). **Click to focus:** a mouse press and release that moved under 5 px is a click, not a drag; it runs `unproject` → `enemyAt` → `setFocus(state, id)` (a click on empty ground passes `null` and clears the focus). Only finite canvas coordinates reach core. Seed from `Date.now()` passed into `newHorde` (the only non-core randomness source is this seed).

- [ ] **Step 1: Implement** `render.ts`, `hud.ts`, `app.ts`; `main.ts` calls `start(document.getElementById('app'))` and throws if `#app` is missing.
- [ ] **Step 2: Run** `npm run lint && npm test && npm run build` — all green.
- [ ] **Step 3: Verify in the browser** (`npm run dev`, then preview the page):
  - Shamblers enter along the whole right edge as a crowd, spread out instead of stacking, and stop at the wall; segments lose HP and break; nearby shamblers funnel into the gap and reach the camp.
  - Bob fires from the upper tower at whichever shambler is closest to him; clicking a shambler makes every defender in range switch to it (ring shown) until it dies; clicking empty ground clears it; dragging still pans without changing focus.
  - A card offer appears at level 2 and the fight is frozen until a pick; picking a recruit puts a second defender on the lower tower.
  - The wave counter advances with a pause between waves; clearing wave 5 shows "Horde held"; letting the camp fall shows "The camp fell"; "Fight again" restarts.
  - Wheel zoom keeps the point under the cursor; drag/keys pan and stop at the field edges.
  - Switching tabs for 10 s and back: the fight did not advance.
  - Stop the dev server when done.
- [ ] **Step 4: Bump** `package.json` and `package-lock.json` to `0.2.0`; `npm run check:version` passes.
- [ ] **Step 5: Commit** (after approval): `git commit -m "Playable horde prototype (M1)"`
