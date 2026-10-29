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
- Versions: ID-014 → `0.4.7`, ID-015 → `0.4.8`.

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

---

## ID-015 — Battery bank: auto-loading, cap, generator burning Gas

PM decisions, 2026-10-29: D1 until patrols, a new game starts with 2 Makeshift batteries and 4 Gas, and every won horde pays 1 Gas; D2 all four battery qualities are defined now, the cap is 10 Standard batteries' worth, and battery-tier research that raises it comes with ID-035; D3 one generator, built in build mode with materials, no research; D4 the build panel shows the generator and the Gas and battery counts as text, the bank meter stays with ID-016.

**Acceptance criteria** (also on issue #15). Values marked *(starting point)* are tunable.

1. **Bank persists.** The bank's charge carries from one horde to the next: a horde starts with what the bank holds, and the charge left at its end is kept. The stand-in full bank per horde goes.
2. **Batteries.** Batteries wait in storage, counted by quality: Makeshift 60, Standard 100, High-capacity 160, Military 250 charge *(starting points)*.
3. **Auto-loading.** Between hordes (a new game, a finished horde, a loaded save or code), whole batteries load into the bank, largest first, while each one fits under the cap. A loaded battery is used up; one that would overflow the cap stays in storage.
4. **Cap.** The bank holds at most 1,000 charge (10 Standard batteries' worth) *(starting point)*. Nothing takes it past the cap or below 0.
5. **Generator.** One per camp, built in build mode between hordes for 40 Scrap and 20 Wood *(starting point)*; refused with a reason when materials are short or one is built. It burns 1 Gas per 10 minutes of real time for 50 charge each *(starting points)*, also while the game is closed. It burns only while there is Gas and room in the bank, and stops at the cap. Progress toward the next Gas carries over; time it spends idle (no Gas, bank full) and time in a fight earn nothing. A clock set back makes no progress and never throws.
6. **Gas.** Gas joins the stock: a new game starts with 4 *(starting point)*, and each won horde pays 1 *(starting point)*, a stand-in until patrols.
7. **UI.** The build panel shows the generator (its cost and a build button, or that it is running or idle and why) and the Gas and battery counts.
8. **Save.** The bank charge, battery counts, Gas, the generator and its clock are saved and validated on load against an allow-list (whole numbers in range, known qualities, charge 0 to the cap, a clock that is a whole number no later than the save). Older saves load with an empty bank, the new-game batteries and Gas and no generator, then load batteries. Hostile-payload tests and a `security-devops` audit.
9. **Tests** cover the bank carrying over, loading order and the cap, generator catch-up while closed, partial progress, idle and fight time earning nothing, a clock set back, the build cost and refusals, Gas income, and save round-trips. `docs/design.md` §7 gets an "As built (ID-015)" note; the version goes to 0.4.8.

## ID-015 Numbers (all in `data.ts`, starting points)

- `BATTERIES`: makeshift 60, standard 100, high-capacity 160, military 250. `BANK_CAP = 1000`.
- `GENERATOR`: cost `{ scrap: 40, wood: 20 }`, gasMs 10 minutes, gasCharge 50.
- `START_POWER`: 2 Makeshift batteries, 4 Gas. `GAS_PER_WIN = 1`. `TURRET_BANK` goes.

## ID-015 Review Focus

1. **Real time** is only ever read as `now`; idle time, fight time and a clock set back earn no charge.
2. **The bank** never passes the cap or goes below 0; no battery is used up without its charge landing.
3. **Save** refuses every hostile bank, battery, Gas and generator shape.
