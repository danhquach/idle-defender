# Milestone 4 — Professions and Stats Plan

**Goal:** The equipped weapon decides what a defender does. Gunners shoot, Rippers fight at the wall, Engineers shoot a little and mostly repair walls and speed up the defenders beside them, and each post kind suits some professions better than others. Then come defender levels, stat points and titles, the roster screen, and weapon rarity.

**Spec:** `docs/design.md` §3 (posts and positioning), §6 (weapons → profession, stats, titles, gear), §11 (start: pistol, knife, toolkit), §15 (weapon on each sprite).

## Roadmap

M4 = ID-010 (weapons → professions, post rules) + ID-011 (XP, stat points, profession levels, titles) + ID-012 (roster screen, equip weapon) + ID-013 (weapon rarity and affixes). Each ticket's acceptance criteria are written here before it starts.

**M4 stand-ins and later work:**
- **Stats:** professions work from the weapon alone until ID-011 adds Aim, Might, Tech and Grit.
- **Weapon swaps:** the starter weapons are fixed until ID-012's equip screen; a camp saved before ID-010 keeps its three pistols until then.
- **Weapon roster:** one Rusty weapon per profession (pistol, knife, toolkit). The other guns, blades and the welder come with ID-013's drops.
- **Turrets:** the Engineer's turret buff and turret repair come with M5.

## Global Constraints

- Everything from the M1–M3 plans' Global Constraints still holds: core is pure, RNG only via `rng.ts`, text only via `textContent`, every number in `data.ts`, no new runtime dependency, public repo rules.
- Player mistakes return `{ ok: false, reason }`; programmer errors throw `RangeError`.
- Versions: ID-010 → `0.4.1`, ID-011 → `0.4.2`, ID-012 → `0.4.3`, ID-013 → `0.5.0` (milestone done).

## Numbers (all in `data.ts`, starting points)

- `PROFESSIONS`: `gunner`, `ripper`, `engineer`, each with a display name.
- `WEAPONS` (each names its profession):
  - `pistol` (Gunner): 7 damage every 0.6 s, range 600. Was 6: one gun now opens the game where three did, so the balance targets needed a little more.
  - `knife` (Ripper): 10 damage every 0.5 s, reach 50 px from the post.
  - `toolkit` (Engineer): 4 damage every 0.6 s, range 450 (about 57% of a pistol's damage per second, three quarters of its range); repairs 3 HP/s; buffs within 100 px.
- `ENGINEER_BUFF = 0.15`: +15% fire rate for defenders beside an Engineer; several Engineers don't stack.
- `POST_RANGE` unchanged (tower ×1.25, wall-walk ×1, ground ×0.75), for guns (Gunners and Engineers).

## Review Focus

1. **Rippers never hit from a tower**, even an enemy inside the camp standing next to them.
2. **Engineers shoot weaker than Gunners** (damage per second and range).
3. **Engineer repair** touches only standing segments of its own layer, its row ±1, never above max HP, and only while standing (not walking).
4. **Buff** comes from a standing Engineer to standing defenders within 100 px; it never stacks and never buffs the Engineer.
5. **Recruit cards** only offer a defender who has a free usable post they can work from; the slot otherwise falls back to an upgrade card.
6. **Balance:** the design targets in `balance.test.ts` still hold with the new starter roster; any retune is in `data.ts` and listed in the PR.

---

## ID-010 — Weapons → professions and post rules

**Acceptance criteria** (also on issue #10):

**Weapons and professions**
- Every weapon in `data.ts` names its profession; a defender's profession is their weapon's. No fixed class.
- Weapons: pistol (Gunner), knife (Ripper), toolkit (Engineer), numbers above.
- A new game's roster: Bob with a pistol, Jack with a knife, John with a toolkit (design §11).

**Gunner** (unchanged behaviour)
- Shoots the closest enemy in range (or the focus); range × the post's multiplier.

**Ripper**
- Hits the closest enemy within 50 px of their post (or the focus, if within reach), standing only.
- Wall-walk / gate post: reaches enemies hitting that wall in front of them.
- Ground post: fights enemies that broke through and pass by, or come for them from inside the camp.
- Tower: can't reach; a Ripper on a tower never attacks, even an enemy inside the camp beside them.
- Card buffs (damage, rate) apply as for Gunners; Long Sight doesn't change reach.

**Engineer** (PM decision, 2026-10-29: shoots, weaker than the others, as they focus on repair)
- Shoots like a Gunner with the toolkit's lower damage and range, × the post's range multiplier.
- **Repair:** while standing on a post, restores 3 HP/s to the most damaged standing segment (lowest HP share; ties → lower row) of the layer in their post's column, within one row of their post. Broken (0 HP) segments wait for build mode. Never above max HP.
- **Buff:** defenders standing within 100 px of a standing Engineer fire 15% faster. Doesn't stack between Engineers; never on the Engineer themself (two Engineers side by side speed each other up, since they shoot too).
- Walking Engineers neither shoot, repair nor buff.

**Placing defenders**
- The start, a move and a replacement may use any usable post, whatever the profession (the player's call).
- A recruit card goes to the free usable post furthest forward that the recruit can work from (a Ripper: not a tower). A bench defender with no such post isn't offered as a recruit.
- The start picker, recruit cards, the replacement panel and the move toasts show each defender's profession ("Jack — Ripper"), and a post they can't work from says so ("can't reach from a tower").
- **Art (§15, placeholder):** each defender sprite shows its weapon, so the profession reads at a glance: a level gun (Gunner), a raised blade (Ripper), an orange toolkit (Engineer). Ripper hits show as a short slash across the enemy, not a shot line.

**Save**
- Saves read the new weapon ids through the existing allow-list; an older save with three pistols still loads unchanged. Hostile weapon ids (case, padding, look-alikes, `__proto__`) are refused.

**General**
- Design §3/§6 notes the post rules as built (Ripper reach, Engineer repair and buff numbers).
- Balance tests stay green with the new roster; any retune is a `data.ts` number, listed in the PR.
- Unit tests for each profession on each post kind, the buff edges (100 px, stacking, walking), repair edges (row ±1, broken, cap, most damaged), recruit placement and filtering, and the start roster.
- `security-devops` audit of the save allow-list change. Existing tests stay green. Version `0.4.1`.

**Files:**
- Modify `src/core/data.ts`: `PROFESSIONS`, `WEAPONS` with profession, knife and toolkit, `ENGINEER_BUFF`, pistol damage 7.
- Modify `src/core/horde.ts`: `canWork(weapon, post)`, `defenderRange` by profession, `engineerBuff`, `repair`; `Shot.melee`.
- Modify `src/core/cards.ts`: `recruitPost` and `rollOffer` use `canWork`.
- Modify `src/core/game.ts`: starter roster.
- UI: `defenderLabel` and `workNote` in `hud.ts`, used by `build.ts`, `hud.ts` and `app.ts`; weapon sprites and strikes in `render.ts`.
- Tests: `src/core/professions.test.ts` (new), `horde.test.ts` (pistol 7), `game.test.ts`, `src/storage/save.test.ts`, `src/ui/hud.test.ts`.
- `docs/design.md` §3, §6.

---

## ID-011 — Defender XP, stat points, profession levels, titles

**Acceptance criteria** (also on issue #11; PM decision, 2026-10-29: points are spent on the result screen):

**XP and levels**
- Roster `xp` is lifetime XP; the level comes from it. Level L → L+1 costs `25 × L` XP (`LEVEL_XP`, starting point): a defender in every win reaches level 2 after Horde 2 and level 3 after Horde 4.
- Each level gives 3 stat points (design §6). Unspent = `3 × (level − 1)` − points spent.
- Points are permanent (no respec). Spending with none left returns `{ ok: false, reason }`.

**Stats** (each applies only with a matching weapon; starting points in `data.ts`)
- **Aim** (Gunner): +2% damage per point; 0.5% crit chance per point, capped at 50%; a crit deals ×2. Crits roll on the horde RNG only when the chance is above 0, so a fight with no Aim replays as before.
- **Might** (Ripper): +2% damage per point; each strike cleaves enemies within 30 px of the target for 1% of its damage per point, capped at 50%.
- **Tech** (Engineer): +2% repair rate per point (turret buff and battery quality come with M5).
- **Grit** (any weapon): +5 max HP per point in hordes, over 100 (patrol effects later).
- Recruits and replacements fight with their permanent stats (design §4).

**Titles**
- Profession level = points in that profession's stat. Junior / Adept / Master / Legendary at 10 / 25 / 50 / 100 give +5% / +15% / +30% / +50% to that profession's output (Gunner and Ripper damage, Engineer repair), only with a matching weapon. The title bonus multiplies on top of the stat.
- Name tag = the highest title ("Bob the Gunner"); ties → higher title, then more points, then Gunner, Ripper, Engineer. It shows wherever `defenderLabel` does.

**Result screen**
- After a win each XP line shows the gain, level progress and any level-up: "Bob +25 XP · level 2 (10/50) · +3 stat points".
- Every defender from the win with points to spend gets a picker (Aim, Might, Tech, Grit, one point per click) on the result screen; it shows the new name tag and title as they're earned. Points left unspent carry over (ID-012's roster screen spends them later). The spends apply with "Back to build".
- A loss still shows "No XP on a loss" and no picker.

**Save**
- Each roster entry saves `stats: { aim, might, tech, grit }`. A save without `stats` (before 0.4.2) loads with all 0. More points spent than the level allows is refused. Hostile payloads tested (`__proto__`, extra keys, negatives, fractions, oversized).
- `security-devops` audit of the save change.

**Balance**
- The balance simulator spends each level's points on the equipped weapon's stat; the `balance.test.ts` targets still hold. Any retune is a `data.ts` number, listed in the PR.

**General**
- Unit tests: the level curve edges, each stat with a matching and a non-matching weapon, the crit and cleave caps, Grit HP, title thresholds and tie-breaks, the result lines and picker.
- Design §6 notes the numbers as built. Version `0.4.2`.

**Files:**
- Modify `src/core/data.ts`: `STATS`, `PROFESSION_STAT`, `LEVEL_XP`, `POINTS_PER_LEVEL`, `STAT_EFFECT`, `TITLES`.
- Create `src/core/stats.ts`: levels, points, `spend`, titles, name tag, the fight factors.
- Modify `src/core/horde.ts`: `DefenderSpec.stats`, Grit HP, damage, crit, cleave and repair factors.
- Modify `src/core/game.ts`: `RosterDefender.stats`, `spendPoint`, `levelGains`.
- Modify `src/core/sim.ts`: the scripted player spends points.
- Modify `src/storage/save.ts`: `stats`, with and without.
- UI: XP lines, the picker in `hud.ts`; `app.ts` applies the spends; `defenderLabel` uses the name tag.
- Tests: `src/core/stats.test.ts` (new), `game.test.ts`, `sim.test.ts`, `save.test.ts`, `hud.test.ts`.
- `docs/design.md` §6.

## ID-012 — Roster screen

**Acceptance criteria:** written here before it starts.

## ID-013 — Weapon rarity and affixes

**Acceptance criteria:** written here before it starts.
