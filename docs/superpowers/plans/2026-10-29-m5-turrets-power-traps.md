# Milestone 5 — Turrets, Power, Traps and Horde Cash Plan

**Goal:** The base fights back on its own. Turrets researched at the camp's Research Lab fire from tower and wall mounts while the battery bank lasts, wear down and jam but are never destroyed; traps thin the horde on the outer layer; horde cash buys short buffs mid-fight.

**Spec:** `docs/design.md` §7 (turrets, batteries, traps), §4 (horde cash), §11 (research), §15 (turret art).

## Roadmap

M5 = ID-014 (turrets, plus the Research Lab that unlocks them) + ID-015 (battery bank) + ID-016 (turret and power UI) + ID-017 (basic traps) + ID-018 (horde cash shop) + ID-019 (active skills). Each ticket's acceptance criteria are written here before it starts.

**M5 stand-ins and later work:**
- **Energy:** until ID-015, every horde starts with a full stand-in bank of `TURRET_BANK` charge; ID-015 makes the bank persist, fill from batteries and the generator.
- **Parts:** turret repairs cost Scrap only; Parts join the costs with patrol loot.
- **Research:** the Lab's research is paid in materials and completes at once. ID-035 (M9) extends the same Lab with real-time research, Mutated Genes and the rest of the tree.
- **Turret build-mode buttons** (build, repair, salvage, relocate) and the bank meter come with ID-016 (PM decision D4, 2026-10-29); ID-014 ships the core actions and the horde-view art.
- **Cards:** turrets ignore the in-horde cards (which buff defenders); power cards come later.

## Global Constraints

- Everything from the M1–M4 plans' Global Constraints still holds: core is pure, RNG only via `rng.ts`, text only via `textContent`, every number in `data.ts`, no new runtime dependency, public repo rules.
- Player mistakes return `{ ok: false, reason }`; programmer errors throw `RangeError`.
- Versions: ID-014 → `0.4.7`.

---

## ID-014 — Turrets, and the Research Lab that unlocks them

PM decisions, 2026-10-29: D1 turrets sit on their own mounts at tower or wall spots; D2 a full stand-in bank per horde until ID-015; D3 repairs cost Scrap only; D4 turret build-mode buttons with ID-016; turrets are not available at the start and are unlocked through a Research Lab built and levelled with materials (folded into this ticket); the player can salvage and relocate a turret.

**Acceptance criteria** (also on issue #14). Values marked *(starting point)* are tunable.

**Research Lab**
1. **Lab.** A Research Lab is a camp building, built in build mode between hordes for 30 Wood and 20 Scrap, and upgraded to level 2 for 80 Wood and 60 Scrap *(starting points)*. Refused with a reason when materials are short or it is at the top level.
2. **Research.** A node needs its Lab level and its earlier node, costs materials, and completes at once. It can't be researched twice; every refusal names its reason.
3. **v1 nodes** *(starting points)*: Metal walls (Lab 1, 40 Scrap and 40 Wood) unlocks the Metal tier. Auto-turret (Lab 2 + Metal walls, 60 Scrap and 40 Wood) unlocks building turrets.
4. **New game:** no Lab, nothing researched, Wood only. Barrier tiers past Wood unlock only through research.
5. **UI.** Build mode shows the Lab: its level and upgrade cost, and each node as locked (with the reason), available (with its cost) or done.

**Turrets**
6. **Build.** Between hordes, on a free tower or wall mount (a wall mount needs a built segment; a tower mount a wall in its layer). A spot holds a post or a turret, never both. Cost 40 Scrap and 20 Wood *(starting point)*. Refused with "Research the Auto-turret first" until the node is done.
7. **Fire.** A turret fires by itself at the closest enemy in range, or the focused one: 5 damage every 0.5 s, range 500, ×1.25 on a tower *(starting points)*. No magazine.
8. **Energy.** A turret only fires while the bank has charge: 1 charge per second it has a target; idle turrets draw nothing. Bank empty → every turret goes dark. Stand-in bank: 600 charge, full at each horde start *(starting point)*.
9. **Condition** 0–100. Each shot costs 0.2; a wall turret also loses 0.5 per point of damage its segment takes *(starting points)*. Below 50 the fire rate drops linearly to half speed near 0; at 0 it is jammed and stops.
10. **Never destroyed.** Turrets stay in the base between hordes; condition carries over. A wall turret whose segment breaks stops firing until the segment is repaired; its condition is untouched by the break.
11. **Repair** between hordes costs Scrap in proportion to the missing condition (20 for a full repair, *starting point*), jammed included.
12. **Engineers.** A standing Engineer within 100 px gives a turret +15% damage and fire rate, scaled by the Engineer's Tech and title (not stacked), and repairs the most worn turret in reach by 0.5 condition/s mid-horde, scaled the same way. A jammed turret waits for build mode.
13. **Salvage.** Between hordes the player can dismantle a turret: refunds 50% of its build cost × its condition share, rounded down *(starting point)*, and frees the mount. The only way a turret is ever removed.
14. **Relocate.** Between hordes the player can move a turret to another free mount: free, keeps its condition, same placement rules as building.
15. **Art (§15, placeholder).** In the horde view each turret shows its state: lit when powered, dark when not; sparks below 50 condition, smoke below 25; a distinct jammed look.

**Save, tests, docs**
16. **Save.** Turrets, the Lab level and the researched nodes are saved and validated on load against an allow-list (mount kind, column, row, condition 0–100, no duplicate spots, no spot shared with a post, a count cap; known node ids, prerequisites and Lab level met, no duplicates; a Metal-walls node means the Metal tier). Older saves load with no turrets, no Lab, nothing researched, tiers kept. Hostile-payload tests and a `security-devops` audit.
17. **Tests** cover energy draw and going dark, wear and jamming, the low-condition fire rate, the Engineer bonus and repair, build/repair/salvage/relocate costs and refusals, the Lab and research rules, and save round-trips. `docs/design.md` §7 and §11 get "As built (ID-014)" notes; the version goes to 0.4.7.

## Numbers (all in `data.ts`, starting points)

- `LAB_LEVELS`: level 1 `{ wood: 30, scrap: 20 }`, level 2 `{ wood: 80, scrap: 60 }`.
- `RESEARCH`: `metal-walls` (Lab 1, `{ scrap: 40, wood: 40 }`, unlocks tier `metal`), `auto-turret` (Lab 2, needs `metal-walls`, `{ scrap: 60, wood: 40 }`).
- `TURRET`: cost `{ scrap: 40, wood: 20 }`, damage 5, fireInterval 0.5, range 500, draw 1/s, shotWear 0.2, hitWear 0.5, slowBelow 50, repairScrap 20, salvage 0.5, engineerRepair 0.5.
- `TURRET_RANGE`: tower ×1.25, wall-walk ×1. `TURRET_BANK = 600`. `MAX_CONDITION = 100`.

## Review Focus

1. **Never destroyed:** no path in a fight removes a turret; only salvage does.
2. **Energy** is drawn only while a powered turret has a target; never below 0.
3. **Research gates** hold in the core actions, not only in the UI.
4. **Save** refuses every hostile turret, Lab and research shape and every rule the actions keep.
