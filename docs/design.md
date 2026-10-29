# Idle Defender — Design

Status: approved concept. Working title. Every number below is a starting
point for balancing, not a final value. Genre: zombie-survival base defence
(hold the line against the horde) with roguelite fights and idle patrols.
Items marked *(guess)* are the designer's assumptions, not yet agreed.

## 1. Vision

A fake-3D top-down base-defence game with a roguelite fight in every horde
and an idle layer for when you are away. Years after doomsday, you command
a fortified base. You build it out in layers — traps, walls, inner walls,
powered turrets — and when a horde of zombies and mutated monsters comes,
your defenders hold those layers one by one. Beating a horde earns
experience and Mutated Genes to research new tech. Between hordes, patrols
cross the world map to loot the ruins; every place gives its own kind of
loot, and the further you push into danger, the more you can win — or lose.

### Pillars

1. **You play the hordes.** Defence is hands-on: card picks, placement,
   purchases and skills happen during the fight.
2. **Your base is your build.** Barrier layers, posts and turrets persist
   and grow between hordes — and need to be kept running.
3. **Every horde builds differently.** In-fight upgrades and recruits come
   from random offers (roguelite).
4. **Your people matter.** Defenders grow into named specialists — "Bob the
   Gunner", "Jack the Ripper" — through the stats you give them, and can be
   lost on a reckless patrol.
5. **Idle = patrols (and crafting).** Time-based jobs run while the game is
   closed; nothing else plays itself.

## 2. Core loop

```
            ┌────────────── Base (one big map) ──────────────┐
            │ build / repair barriers, maintain + power      │
            │ turrets, equip defenders, craft, research,     │
            │ set commander perks                            │
            └───────┬───────────────────────────────┬────────┘
                    │                               │
          start next horde                   send patrols
                    │                               │
   Horde defence (active, roguelite)      World map (idle, time-based)
   commander perks + 1 defender →         travel → loot roll → return
   recruits, cards, skills                risk and reward ∝ danger
                    │                               │
   win: XP + Mutated Genes (+ some loot)  location-typed loot, XP
                    └───────────────┬───────────────┘
                                    ▼
                         stronger base and squad
```

- **No map-by-map progression.** There is one base map. Progress is the
  **horde level**: Horde 1, 2, 3 … each harder than the last; every 10th
  horde is a boss horde.
- **The player starts a horde** when ready; there is no forced timer.
- **Losing a horde:** the core falls (§3). No horde reward; barrier and
  turret damage stays and must be repaired; retry the same horde level.
  Materials and defender XP picked up in the fight are kept. Defenders
  don't die in hordes *(guess)* — death only happens on patrols (§10).

## 3. The base (fake 3D, side-on layers)

One large map viewed from above at an angle (2.5D: walls and towers have
height, sprites are layered by depth). The camera pans and zooms over it.
**The base is on the left; hordes attack from the right.** Barrier layers
run top to bottom across the map, so they are easy to lay out and read.

```
 CORE      inner wall     wall + gate     outer layer        horde
  │            │               │               │               │
┌────┐  [P]   ███   [T] [P]   ▒▒▒   [P]      ┄┄┄           ◄ ◄ ◄
│    │  [P]   ███       [P]   ▒▒▒             ┄┄┄  traps    ◄ ◄ ◄ ◄
│    │       [G]█   [T]       [G]▒   [P]      ┄┄┄           ◄ ◄
│    │  [P]   ███       [P]   ▒▒▒             ┄┄┄          ◄ ◄ ◄ ◄
└────┘  [P]   ███   [T] [P]   ▒▒▒   [P]      ┄┄┄           ◄ ◄ ◄
        Layer 3            Layer 2          Layer 1
[P] post  [T] tower / turret mount  [G] gate
```

- **Barrier layers:** the player builds and upgrades each layer. When a
  layer's section breaks, enemies push through to the next one. More layers
  = more time to kill them.
- **Lanes and segments** *(designer's call)*: the battlefield is split into
  horizontal **lanes** (rows; starting point 5). Each layer is one
  **segment** per lane, with its own HP. Enemies walk left along their lane
  and stop at the first standing segment; when it breaks, that lane is open
  to the next layer. Enemies can drift to a neighbouring lane but don't
  path-find around walls. This keeps movement simple with hundreds of
  enemies on screen.
- **Building:** walls, gates, traps, towers, turret mounts and posts are
  placed on a grid *(guess)* and cost building materials (§11). Barrier
  tiers: wood → sheet metal → concrete → reinforced.
- **Repair:** damage carries over between hordes; repaired with materials
  and by Engineers.
- **Persistent:** the whole base stays between hordes, turrets included
  (§7).
- **Expansion** *(guess)*: the buildable area grows with research, so later
  bases can hold more layers.

### Posts and positioning

Defenders stand on **posts** the player builds and chooses between.

- **Wall-walk / gate posts** (on a wall): melee (Ripper) reaches enemies
  hitting that wall; ranged has a clear line.
- **Towers** (behind a wall, elevated): ranged gets +range; melee can't
  reach.
- **Ground posts** (between layers): melee fights enemies that broke
  through; ranged is short-sighted.
- **Adjacency:** an Engineer buffs the turrets and defenders beside them.
- Defenders can be moved between posts during a horde *(guess: with a short
  walk time, so a fallen outer layer means pulling back)*.

## 4. Horde defence (the active part)

- **Real time.** Defenders and turrets aim and fire **automatically** at
  enemies in range. The player doesn't steer units; they act through card
  picks (the game pauses for these), moving defenders between posts,
  spending horde cash and using active skills.
- **Length** *(designer's call)*: a horde takes about 3–5 minutes.
- **Start:** the commander's equipped perks are on (§5) and **1 defender**
  takes a post.
- **Horde levels:** kills give horde XP. Each level pauses for a pick of
  1 of 3 offers:
  - an **upgrade card** (§8), or
  - a **recruit card**: a defender from your roster joins and takes a free
    post. Recruit cards show up by chance (starting point: 30% per offer
    slot, lower once the squad is large).
- **Recruits come from your roster**, bringing their permanent level,
  stats, title and weapon. Defenders out on patrol or injured can't be
  recruited.
- **Waves:** a horde is 5–10 waves *(starting point)*, growing within the
  horde; a boss horde ends in a Mutated Horror.
- **Horde cash:** kills drop cash, spent during the fight on quick repairs,
  new turrets and buffs. Turrets bought this way stay after the horde (§7).
- **Active skills** *(guess)*: 2–3 click-to-target abilities on cooldown,
  e.g. airstrike, molotov, flashbang.
- **Reward on success:** mostly **defender XP** and **Mutated Genes**, plus
  a small chance of materials or a weapon. Higher horde levels pay more.

## 5. Commander and perks

The player is the **commander**: not a unit on the field and never bought.
The commander's effect is the **perks** equipped in their **perk slots**,
which apply to the whole battlefield.

- **Perks are unlocked and upgraded** (with Mutated Genes through research,
  and from boss hordes *(guess)*), not leaders.
- **Perk slots:** 1 at the start, up to 4 through research *(starting
  point)*. Equipped perks can be swapped freely between hordes, not during
  one *(guess)*.
- **Perk levels** *(guess)*: each perk can be upgraded to raise its effect.

| Perk (examples) | Effect |
|---|---|
| Steady Fire | Ranged weapons +15% fire rate |
| Butcher's Hunger | Melee kills heal the nearest wall a little |
| Overclock | Turrets +20% damage, +10% energy use |
| Scavenger's Eye | +25% horde cash |
| Second Look | One reroll of the 1-of-3 offer per wave |
| Rally Call | Recruit cards appear twice as often |
| Fortify | All barrier layers +30% max HP |
| Power Saver | Turrets use 25% less energy |

## 6. Defenders, weapons and professions

Defenders are a **permanent roster**: levels, stats, titles and gear stay.
**No fixed class:** any defender can use any weapon, and the equipped
weapon decides which profession they are working as.

### Weapons → profession

| Profession | Weapons | Job |
|---|---|---|
| **Gunner** | Pistol, SMG, rifle, shotgun, LMG, sniper rifle | Ranged damage; good with every gun, but no huge spike in any one |
| **Ripper** | Knife, machete, sword, chainsaw (machine saw) | Close-quarter damage at walls and gates |
| **Engineer** | Toolkit, welder | Repairs barriers and turrets; buffs turret damage and fire rate; crafts better batteries |

More professions later *(guess)*: Marksman (sniper rifles only, bigger
bonus than Gunner), Pyro (flamethrowers), Medic (uses Medicine better).

### Stats

Each defender level gives **stat points** (3 per level, starting point):

| Stat | Feeds profession | Effect |
|---|---|---|
| Aim | Gunner | +ranged damage, +crit |
| Might | Ripper | +melee damage, +cleave |
| Tech | Engineer | +repair rate, +turret buff, +battery quality |
| Grit *(guess)* | All | +defender HP; patrol survival and power |

- A stat's effect only applies with a matching weapon: Bob with 50 Aim
  holding a knife gets nothing from his Aim. Crafting uses Tech regardless
  of weapon *(guess)*.
- Defender XP comes from hordes (main source) and patrols.

### Profession level and titles

- **Profession level** = points in that profession's stat.
- At checkpoints the defender earns a **title**, which adds a flat
  profession bonus on top of the stat:

| Profession level | Title | Bonus *(starting point)* |
|---|---|---|
| 10 | Junior Gunner / Ripper / Engineer | +5% |
| 25 | Adept … | +15% |
| 50 | Master … | +30% |
| 100 *(guess)* | Legendary … | +50% |

- The highest title becomes the defender's name tag: "Bob the Gunner",
  "Jack the Ripper", "John the Engineer". A defender can hold titles in
  more than one profession.

### Gear

- Weapons come from patrols (main source), boss hordes and crafting.
- **Rarity:** Rusty, Common, Military, Prototype, Relic, with rolled
  affixes (e.g. +pierce, burning rounds, +damage vs. mutants).
- One weapon per defender *(guess: armour later)*.

## 7. Turrets, energy and traps

### Turrets

- Built with materials or bought with horde cash; **both stay** after the
  horde.
- Fire automatically from mounts on walls and towers; an adjacent Engineer
  adds damage and fire rate (Tech and title scale it).
- **Energy:** a turret only fires while powered. Each turret draws energy
  per second of firing (idle turrets draw nothing) from the base's
  **battery bank**.
  Bank empty → turrets go dark until recharged.
- **Maintenance:** each turret has a **condition** that drops as it fires
  and when it's hit. Low condition → lower fire rate; 0 → jammed until
  repaired. Repaired between hordes with Scrap and Parts, faster and
  cheaper by an Engineer; an Engineer on an adjacent post repairs slowly
  mid-horde *(guess)*.

### Batteries and energy

- **Batteries** fill the battery bank. Two sources:
  - **Looted** on patrols (gas stations, electronics stores, military
    depots).
  - **Crafted** by a defender at the workbench from materials (Scrap,
    Parts, Chemicals *(guess)*). A crafting job takes real time and keeps
    running while the game is closed. Higher Tech = faster crafting and better batteries (more
    charge); an Engineer title adds a quality bonus.
- **Battery quality:** Makeshift, Standard, High-capacity, Military
  *(starting points)* — more charge per battery.
- **Generator** *(guess)*: burns Gas between hordes to recharge the bank,
  slower and less efficient than batteries.
- A defender crafting can't patrol or be recruited until the job is done
  *(guess)*.

### Traps

- On the outer layer (spikes, barbed wire, mines, fire pits): slow and thin
  the horde before it reaches the first wall. Some use Gas (fire pits)
  *(guess)*. Built with materials and upgraded through research.

## 8. In-horde upgrade cards (roguelite)

Offered 1 of 3 on each horde level. Lost when the horde ends.

- **Stat cards:** +damage, +fire rate, +range for one defender or a whole
  profession.
- **Behaviour cards:** pierce, ricochet, burning rounds, split shot,
  explode on kill, chain lightning, cleave.
- **Barrier cards:** +layer HP, spikes on walls, slow field at the gate.
- **Power cards:** refill some battery charge, turrets free to run for one
  wave.
- **Synergies:** some cards upgrade when paired (e.g. burning rounds + a
  Master Gunner = burn spreads).
- **Rarity:** common / rare / epic; rarer offers more often in later waves.

## 9. Enemies

All enemies enter from the right edge and push left toward the core.

| Enemy | Behaviour | Answer |
|---|---|---|
| Shambler | Slow, many | Anything |
| Runner | Fast, low HP | Traps, Gunner fire rate |
| Crawler | Climbs walls, skips a layer *(guess)* | Ripper on the wall-walk |
| Bloater | Explodes at a wall, big layer damage | Kill early from a tower |
| Spitter | Stops short, spits acid at walls, posts and turrets | Long-range Gunner |
| Brute | Armoured, smashes walls and gates | Ripper (chainsaw), pierce |
| Screamer | Speeds up nearby enemies | Focus it first |
| Mutated Horror | Boss of every 10th horde; one unique ability each | Whole base |

- Mutants appear from Horde 5 *(starting point)*; new types join as horde
  levels rise.
- **Scaling:** enemy HP × 1.10 per wave, × 1.15 per horde level (starting
  points).

## 10. World map and patrols (the idle part)

A separate world-map screen of ruined locations around the base.

### Locations and loot types

Each location has a **danger level**, a **distance** and a **loot table
weighted by what the place is**:

| Location | Mostly drops | Sometimes |
|---|---|---|
| Gas station | Gas, batteries (energy), snacks | Scrap |
| Supermarket | Food, snacks | Batteries |
| Pharmacy | Medicine | Chemicals |
| Hospital | Medicine (more, better) | Chemicals, Mutated Genes |
| Hardware store | Building materials (wood, metal), Scrap | Tools (Engineer weapons) |
| Electronics store | Parts, batteries | Scrap |
| Police station | Weapons (civilian/police: pistols, shotguns, SMGs) | Ammo-type affixes |
| Military depot | Military-grade weapons, high-capacity batteries | Parts |
| Construction site | Concrete, metal | Melee weapons (machete, chainsaw) |
| The crater *(late)* | Mutated Genes, Relic weapons | Anything |

### Plazas

A **plaza** is a location made of several buildings, so one patrol can
bring back several kinds of loot. Example: *Riverside Plaza* = gas
station + pharmacy + hardware store.

- **Loot:** the patrol searches the plaza's buildings and rolls on each
  building's own loot table (above).
- **Which buildings** *(designer's call)*: the player ticks the buildings
  to search before sending. Each extra building adds search time and more
  horde risk.
- **Big horde chance** belongs to the **location**, not the party: plazas
  draw crowds, so every plaza search has a chance of a **big horde** event,
  higher than any single building and rising with the plaza's danger level
  and each building searched. Party strength never changes this chance.
- **When a big horde hits**, party strength vs. the horde decides what
  happens:

  | Result | Loot | Casualties |
  |---|---|---|
  | **Defeat it** (strong party) | Patrol goes on and finishes; bonus defender XP and Mutated Genes *(designer's call)* | Possible injuries |
  | **Fence it off** (even match) | Patrol ends early; keeps what was found so far, reduced by the retreat order (below) | Injuries likely |
  | **Overrun** (weak party) | Patrol fails; little or no loot | Injuries, deaths, possible wipe |

- **Loot kept after a failure** depends on how badly the party was hurt:
  light casualties → keeps a share of what it found; heavy casualties or a
  wipe → nothing.
- **Shown up front:** the risk screen shows the plaza's big-horde chance
  and the party's odds of defeat / fence off / overrun, updated as
  buildings are ticked and orders changed.
- **Reward:** plazas give more total loot per trip than single buildings,
  and the mix saves patrol slots. The trade-off is the big-horde risk.

### Sending a patrol

- Pick a party from the roster and a location. Time is real time:
  **travel out → search → travel back**. Farther and more dangerous
  locations take longer and pay more. Patrols keep going while the game is
  closed.
- **Supplies** *(guess)*: a patrol takes Food (and Gas for far trips by
  vehicle); more supplies, longer search.
- **Loot chance:** each search rolls on the location's loot table. **Party
  strength** vs. the location's danger raises the number of rolls and the
  chance of rarer results.
- **Party strength** = defender levels + weapons + Grit, plus profession
  bonuses where they fit (e.g. an Engineer finds more Parts at an
  electronics store *(guess)*).

### Patrol orders

Set before sending; they apply to any location, plaza or single building.

- **Loot focus:** pick a material type (e.g. Batteries, Medicine,
  Weapons, Building materials) or "Anything". The party favours it: loot
  rolls lean toward that type where the location can drop it, at the cost
  of other types *(designer's call: about double the weight for the focused
  type)*. A focus the location can't drop is greyed out.
- **When things go wrong:** choose what the party protects when a fight
  turns bad (a big horde, or a Dangerous/Deadly outcome roll):
  - **Save the loot** — keep more of what was found, but injuries and
    deaths are more likely.
  - **Balanced** (default) — middle ground: keeps about half of what a
    "Save the loot" retreat would, with casualty odds between the two
    *(designer's call)*.
  - **Save the people** — carry the wounded out, dropping loot as needed:
    fewer deaths and wipes, less (or no) loot.
- The risk screen shows how each order shifts the odds before sending.

### Risk and reward

- Before sending, the screen **shows the risk**: party strength vs. danger
  as a rating (Safe / Risky / Dangerous / Deadly) with the chances of each
  outcome.
- **Outcomes**, worse as the gap grows:
  - **Injured:** members come back hurt and rest before they can defend or
    patrol. Medicine shortens the rest.
  - **Dead:** a member doesn't come back — their level, stats, title and
    gear are lost; the gear stays at that location and a later patrol
    there can recover it.
  - **Wipe:** the whole party is lost.
- **Reward grows with risk:** dangerous runs roll more and rarer loot, so
  sending a weak party into a deadly place is a real gamble, not just a
  mistake.
- **Patrol slots:** 1 at the start, more through research.
- **Returns:** loot, some defender XP; a "patrol report" lists what came
  back and who didn't.
- New locations are revealed by research, scouting or boss hordes
  *(guess)*.

## 11. Resources and research

| Resource | Main source | Spent on |
|---|---|---|
| Scrap | Patrols | Building, repairs, crafting, turret maintenance |
| Parts | Patrols (electronics, military) | Turrets, maintenance, batteries, weapon rarity |
| Building materials (wood, metal, concrete) | Patrols (hardware, construction) | Barrier tiers |
| Gas | Patrols (gas station) | Generator, fire traps, vehicle trips *(guess)* |
| Batteries | Patrols, crafting | Turret energy |
| Food / snacks | Patrols (supermarket, gas station) | Patrol supplies *(guess)* |
| Medicine | Patrols (pharmacy, hospital) | Shorten injury rest |
| Chemicals *(guess)* | Patrols (pharmacy, hospital) | Battery crafting |
| Mutated Genes | Hordes, especially mutants and bosses | Research |
| Defender XP | Hordes (main), patrols | Defender levels → stat points |

- **Research** (paid in Mutated Genes): barrier tiers and traps, turret
  types, battery tiers, new cards in the offer pool, commander perks and
  perk slots, active skills, patrol slots, larger base area, new world-map
  locations.
- **New defenders** for the roster: recruited with Parts *(guess)* or
  found on patrols *(guess)*, each with a random name and a small stat
  lean. Needed to replace losses.
- **Roster floor** *(designer's call)*: if fewer than 3 defenders are
  available, a free basic recruit (level 1, Rusty pistol) arrives every
  hour of real time, so a patrol wipe can never leave the player with no
  one to defend or patrol.
- **No deadlock** *(designer's call)*: every won horde also pays a little
  Scrap and Wood, so the base can be repaired even with no patrol loot.

### Start and pacing *(designer's call, starting points)*

- **New game:** the commander with 1 perk slot (Steady Fire unlocked), 3
  defenders with Rusty weapons (pistol, knife, toolkit — one per
  profession), a core, one wood wall layer with a gate, 2 tower posts,
  1 patrol slot, the gas station and supermarket revealed on the world map,
  and a small stock of Scrap, Wood and 2 Makeshift batteries.
- **First session:** Horde 1 is a guided tutorial (placing a defender, a
  card pick, a recruit card); the first patrol is unlocked after Horde 2.
- **Patrol lengths:** 15 minutes for the nearest Safe location up to 8
  hours for the farthest; crafting jobs 10 minutes to 2 hours.
- **Hordes:** about 3–5 minutes each; a returning player plays a few
  hordes, collects patrols, sends new ones and leaves.

## 12. Save

Local save (browser storage) with a backup save code, same approach as
Office Immortal (see that repo's `docs/design.md` §11 and `src`). Patrol and crafting timers use real time so
offline progress works across sessions.

## 13. Out of scope (v1)

- Multiplayer, raids on other players' bases, leaderboards.
- Story campaign beyond short location notes.
- Real-money purchases.
- Defender death in hordes (only patrols can kill).

## 14. Build order (draft)

1. Fake-3D base view: camera, one wall layer, one Gunner on a post,
   shamblers from the right, a core on the left.
2. A horde: waves, horde level, 1-of-3 cards and recruit cards.
3. Building: grid, walls, gates, posts; multiple layers; repairs.
4. Weapons → professions: Gunner, Ripper, Engineer.
5. Turrets with energy and maintenance; batteries; traps.
6. Stats, profession levels, titles.
7. Commander perks and perk slots.
8. Enemy roster; horde progression; save.
9. World map: locations, typed loot, patrols, risk and death.
10. Crafting, resources, research.
11. Active skills, boss hordes.

## 15. Art direction (draft)

- Fake 3D top-down: an angled overhead view with height on walls, towers
  and large mutants; sprites sorted by depth. Base on the left, horde from
  the right.
- Weapon visible on each defender sprite so the profession reads at a
  glance; title shown as a small badge.
- Turrets show power (lit / dark) and condition (sparks, smoke) at a
  glance.
- Muted, desaturated ruins; mutants get the only saturated colours (acid
  green, flesh red).
- World map as a hand-drawn ruined region with location icons, patrol
  routes and a risk colour on each location.
- **Placeholder art first** *(designer's call)*: build with simple shapes
  and coloured blocks; real art follows Office Immortal's pipeline
  (`art-concepts/`, `art-src/`) once the game is fun.

## 16. Tech and platform

- **Platform** *(designer's call)*: desktop browser first, **landscape**,
  mouse and keyboard (clicks for picks, posts and skill targets); itch.io
  web build. Touch/mobile later.
- **Stack:** same as Office Immortal so the repo scaffold can be copied
  from the Office Immortal repo: TypeScript, Vite, Vitest, ESLint +
  Prettier. The fake-3D base view may need a rendering library (a 2D canvas
  engine with depth sorting) — builder picks it at planning, sized for a
  few hundred enemies on screen.
- **Balance** *(designer's call)*: all numbers live in data files, with a
  headless horde simulator and balance tests (Office Immortal does the same
  for its Paths), so the starting points here can be tuned without code
  changes.
