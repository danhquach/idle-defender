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
- Versions: ID-014 → `0.4.7`, ID-015 → `0.4.8`, ID-016 → `0.4.9`, ID-017 → `0.4.10`, ID-018 → `0.4.11`.

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

---

## ID-016 — Turret and power UI: build, power/condition at a glance, bank level

PM decisions, 2026-10-29: D1 relocate picks the destination from a list of the free mounts in the turret's menu; D2 a thin condition bar over each turret, in build mode and in fights; D3 Repair all repairs turrets too, all or nothing.

**Acceptance criteria** (also on issue #16).

1. **Build.** In build mode an empty tower spot's menu offers an Auto-turret beside the Tower post, and a built wall segment's menu offers an Auto-turret on its wall mount beside the wall-walk post. Each is a dry run of the core action: its cost shown, a refused one disabled with the core's reason ("Research the Auto-turret first", "Slot taken", …).
2. **Turret menu.** Selecting a spot that holds a turret shows its condition (n/100) and state (powered; dark: the bank is empty; offline: its wall is broken; jammed), then **Repair** (its Scrap cost; refused "Nothing to repair" at full), **Salvage** (its refund; asks to confirm) and **Relocate** (D1: a list of the free mounts it may move to, each a dry run).
3. **Selecting.** Clicking a turret's head selects its spot, as a built post's top does.
4. **Bank meter.** The build panel's power section shows the bank as a meter with "Bank n/1,000"; the fight status bar shows the bank's charge as it drains.
5. **At a glance (§15).** Each turret keeps its lit / dark / offline / jammed look, sparks and smoke, and gets a condition bar (D2).
6. **Repair all** (D3) repairs every damaged segment and turret, or nothing if the stock can't cover them all; its cost includes the turrets.
7. **Tests** cover the turret menu lines and their dry runs, relocate targets, the meter and status text, Repair all with turrets, and hit-testing a turret. `docs/design.md` §7 and §15 get "As built (ID-016)" notes; the version goes to 0.4.9.

---

## ID-017 — Basic traps on the outer layer (spikes, barbed wire)

PM decisions, 2026-10-29: D1 a fixed trap strip in front of the outermost layer's column, one cell per row, there before that wall is built; D2 traps wear by one durability per trigger, break at 0 and are repaired between hordes, never destroyed; D3 both basic traps are available from a new game, no research (upgrades come with ID-035).

**Acceptance criteria** (also on issue #17). Values marked *(starting point)* are tunable.

1. **Trap strip (D1).** Five cells on the outer layer, one per row, `x` 1100–1220 *(starting point)*. A cell holds one trap or nothing. Traps are built only between hordes.
2. **Spikes.** 15 Wood and 10 Scrap *(starting point)*. An enemy entering the cell takes 8 damage, once per enemy *(starting points)*.
3. **Barbed wire.** 10 Wood and 15 Scrap *(starting point)*. An enemy inside the cell moves at 50% speed *(starting point)*; one trigger per enemy.
4. **Durability (D2).** 30 *(starting point)*, −1 per trigger. A broken trap (0) does not trigger. Repair between hordes costs materials in proportion to the missing durability (its build cost for a full repair); Repair all includes traps.
5. **Remove.** Between hordes a trap can be removed for 50% of its cost × its durability share, rounded down; the cell is freed for another trap.
6. **Refusals.** An occupied cell, short materials, or a trap at full repair is refused with a reason, in the core actions, not only in the UI.
7. **UI.** In build mode a cell's menu offers Spikes and Barbed wire as dry runs with their costs; a built trap's menu shows its durability with Repair and Remove. The horde view draws each trap, broken ones distinctly.
8. **Save.** Traps are saved and validated on load against an allow-list (known kind, row 0–4, durability 0–30, no duplicate cells). Older saves load with no traps. Hostile-payload tests and a `security-devops` audit.
9. **Tests** cover damage, slow, once-per-enemy, wear, broken traps, costs and refusals, repair and remove, Repair all, and save round-trips. `docs/design.md` §7 gets an "As built (ID-017)" note; the version goes to 0.4.10.

## ID-017 Numbers (all in `data.ts`, starting points)

- `TRAP_STRIP = { x: 1100, width: 120 }`.
- `TRAPS`: spikes `{ cost: { wood: 15, scrap: 10 }, damage: 8, slow: 1 }`, wire `{ cost: { wood: 10, scrap: 15 }, damage: 0, slow: 0.5 }`. `TRAP_DURABILITY = 30`, `TRAP_REFUND = 0.5`.

## ID-017 Review Focus

1. **Once per enemy:** a trap triggers at most once for each enemy, and a broken trap never triggers.
2. **Never destroyed:** only Remove takes a trap out of the base.
3. **Save** refuses every hostile trap shape.

---

## ID-018 — Horde cash shop: temporary buffs and repairs mid-horde

PM decisions, 2026-10-29: D1 a buff that is already running can't be bought again until it ends; D2 cash buffs reach defenders and turrets; D3 Patch wall repairs the most damaged standing segment, broken segments stay broken (nothing is built mid-fight); D4 Fix turret can unjam a jammed turret.

**Acceptance criteria** (also on issue #18). Values marked *(starting point)* are tunable.

1. **Cash.** Each kill adds its enemy's cash (Shambler 2 *(starting point)*) to the horde's cash, whoever or whatever made the kill. Cash starts at 0 every horde, is never saved, and never reaches the base after the horde: it is gone when the horde ends.
2. **Buffs (D1, D2).** *Adrenaline*: +25% damage for 30 s, 30 cash; *Overdrive*: +25% fire rate for 30 s, 30 cash *(starting points)*. Each multiplies on top of the cards, for defenders and turrets. A running buff is refused ("Already active") until it ends; the time left counts fight time only, so it stops during card picks and replacement offers.
3. **Patch wall (D3).** 20 cash: +100 HP *(starting points)* to the standing segment with the lowest HP share (ties → outer layer, then lower row), up to its max. Refused "No wall to patch" when every standing segment is full; a broken segment (0 HP) or a gap is never patched.
4. **Fix turret (D4).** 20 cash: +30 condition *(starting points)* to the most worn turret (jammed first, ties → lower id), up to 100; a jammed turret fires again. Refused "No turret to fix" when every turret is at full condition or there are none.
5. **Refusals.** Short cash ("Not enough cash"), a paused or finished fight, and the rules above are refused with a reason in the core action (`buy`), not only in the UI. A refused buy changes nothing.
6. **UI.** The fight status bar shows the cash. A shop row at the bottom of the fight view has a button per item with its price, each a dry run of `buy`: refused ones are disabled with the reason as the tooltip; a running buff shows its seconds left.
7. **Tests** cover kill cash, each item's effect and refusals, buff expiry and its pause during picks, buffs reaching turrets, the reset between hordes, and the shop row. `docs/design.md` §4 gets an "As built (ID-018)" note; the version goes to 0.4.11.

## ID-018 Numbers (all in `data.ts`, starting points)

- `ENEMIES.shambler.cash = 2`.
- `SHOP`: adrenaline `{ cost: 30, damage: 1.25, seconds: 30 }`, overdrive `{ cost: 30, fireRate: 1.25, seconds: 30 }`, patch `{ cost: 20, hp: 100 }`, fix `{ cost: 20, condition: 30 }`.

## ID-018 Review Focus

1. **Cash never leaves the horde:** no path writes it to the base or the save.
2. **Buff timers** run on fight time only and end exactly once.
3. **Refused buys** leave the state untouched.

---

## ID-019 — Active skills bought with horde cash: airstrike, molotov, flashbang

PM decisions, 2026-10-29: D1 each skill is unlocked by its own Research Lab node; D2 skills hit enemies only (no damage to defenders, walls or turrets); D3 a skill is armed from the shop row, then a click on the field aims it at that point; D4 the numbers below are starting points.

**Acceptance criteria** (also on issue #19). Values marked *(starting point)* are tunable.

1. **Research (D1).** Flashbang: Lab 1, 30 Scrap and 20 Wood. Molotov: Lab 1 + Flashbang, 30 Scrap and 30 Wood. Airstrike: Lab 2 + Molotov, 60 Scrap and 40 Wood *(starting points)*. A horde gets only the skills researched; the rest are refused "Research … first".
2. **Skills (D2).** Each hits enemies only, within its radius of the aim point. *Flashbang*: 20 cash, 25 s cooldown, radius 150, stuns 3 s (no moving, no attacking). *Molotov*: 25 cash, 20 s, radius 80, a fire burning 5 damage/s for 6 s. *Airstrike*: 40 cash, 40 s, radius 120, 40 damage at once *(starting points)*.
3. **Arm → aim (D3).** A skill button arms the skill; the next click on the field uses it there and only then spends the cash. A second click on the button or Esc puts it away; a pick, the end of the fight or a refusal does too. While armed, a field click aims the skill instead of focusing or moving.
4. **Cooldowns, stuns and fires** run on fight time, so they stop during picks and replacement offers. A cooldown starts when the skill is used; every skill is ready when a horde starts, and nothing carries to the next horde. A second flashbang never shortens a stun.
5. **Kills.** A skill kill pays XP and cash like any other kill.
6. **Refusals.** Not researched, short cash ("Not enough cash"), cooling down ("Not ready yet"), a paused or finished fight, and an aim off the field ("Aim at the field") are refused with a reason in the core action (`useSkill`), not only in the UI. A refused use changes nothing; a non-finite aim or unknown skill throws.
7. **UI.** The shop row has a button per skill with its price, each a dry run: refused ones are disabled with the reason as the tooltip, one cooling down shows its seconds left, the armed one is pressed. While armed, a ring shows the skill's reach at the cursor. The horde view draws each fire and a fading flash where a skill lands.
8. **Save.** The three nodes join the research allow-list, validated on load like the others (known ids, prerequisites, Lab level, no duplicates). Hostile-payload tests and a `security-devops` audit.
9. **Tests** cover each skill's effect and radius edge, stuns stopping moves and attacks, fire ticking and expiry, cooldowns pausing during picks, refusals, skill kills paying out, research order, the shop row and the drawing. `docs/design.md` §4 gets an "As built (ID-019)" note; the version goes to 0.4.14.

## ID-019 Numbers (all in `data.ts`, starting points)

- `SKILLS`: flashbang `{ cost: 20, cooldown: 25, radius: 150, seconds: 3 }`, molotov `{ cost: 25, cooldown: 20, radius: 80, dps: 5, seconds: 6 }`, airstrike `{ cost: 40, cooldown: 40, radius: 120, damage: 40 }`. `SKILL_FLASH = 0.4`.
- `RESEARCH`: `flashbang` (Lab 1, `{ scrap: 30, wood: 20 }`), `molotov` (Lab 1, needs `flashbang`, `{ scrap: 30, wood: 30 }`), `airstrike` (Lab 2, needs `molotov`, `{ scrap: 60, wood: 40 }`).

## ID-019 Review Focus

1. **Enemies only:** no skill path touches defenders, walls, turrets or the bank.
2. **Fight time:** cooldowns, stuns and fires stop during picks.
3. **Refused uses** leave the state untouched; the aim is validated in the core.
