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
5. **Idle = patrols (and crafting).** Time-based jobs (patrols, crafting,
   injury recovery, the generator) run while the game is closed; nothing
   else plays itself.

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
   win: XP, camp XP, Mutated Genes        location-typed loot, XP
        (+ some loot)
                    └───────────────┬───────────────┘
                                    ▼
                         stronger base and squad
```

- **No map-by-map progression.** There is one base map. Progress is the
  **horde number**: Horde 1, 2, 3 … each harder than the last; every 10th
  horde is a boss horde. (The in-fight level that triggers card picks is
  the **fight level**, §4.)
- **The player starts a horde** when ready; there is no forced timer. At
  least one defender must be available (not injured, on patrol or
  crafting) *(designer's call)*. Repairs are optional; a horde can be
  started with damaged barriers.
- **Winning a horde:** the last wave is cleared (for a boss horde, the
  Mutated Horror is dead) *(designer's call)*.
- **After a horde** *(designer's call)*: the result screen tallies
  **defender XP** and **camp XP**. A defender who levels up gets stat
  points (§6). A camp that levels up offers a camp-level pick (§11 Camp
  level). Fight levels and their cards (§4) belong to the fight only and
  end with it.
- **Losing a horde:** the horde is lost when enemies have broken through
  every barrier layer **at any one gap** (so they are inside the camp) and
  **every defender on the field is injured** (§4), for 10 seconds
  *(designer's call: one breach through every layer is enough, and the
  10-second "camp is falling" warning gives a last skill a chance; if it
  needed every segment broken, enemies in the camp with no one to hit
  would stall the fight)*. No win reward (no defender XP, no camp XP, no Genes); barrier and turret damage stays
  and must be repaired; injured defenders need rest, Food and Medicine
  (§11); retry the same horde number. Defenders never die in hordes —
  death only happens on patrols (§10).
- **The defeat screen says why** *(designer's call)*: where the first
  breach was and at which layer, who was injured and by what, the repair bill
  and the recovery times, so the next step is clear.
- **A loss still pays a little** Scrap and Wood, scaled by waves survived
  and capped at a quarter of a win's payout at that horde number, so the
  base can always be repaired even before patrols unlock, but losing on
  purpose never beats winning *(designer's call)*.

## 3. The base (fake 3D, side-on layers)

One large map viewed from above at an angle (2.5D: walls and towers have
height, sprites are layered by depth). The camera pans and zooms over it.
**The base is on the left; hordes attack from the right.** Barrier layers
run top to bottom across the map, so they are easy to lay out and read.

```
 CAMP      inner wall     wall + gate     outer layer        horde
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
- **No lanes; the horde rushes as a crowd** *(designer's call)*: the
  battlefield is one open field. Enemies spawn along the right edge at
  any height and rush left as a mass, pushing apart so they don't stack
  on one spot. Each layer is a row of **segments** top to bottom, each
  with its own HP. An enemy hits the segment in front of it; when a
  segment breaks, enemies nearby steer into the gap and through to the
  next layer, so breaches pull the crowd. No full path-finding: enemies
  only head left, slide sideways toward a known gap and push each other.
  This keeps movement cheap with hundreds of enemies on screen.
- **The camp** (left edge) is where the people live (§11 camp capacity).
  Enemies that break through every layer enter the camp and
  attack the nearest uninjured defender; with none left, the loss warning
  runs (§2).
- **Building:** walls, gates, traps, towers, turret mounts and posts are
  placed on a grid *(guess)* and cost building materials (§11). Barrier
  tiers: wood → sheet metal → concrete → reinforced.
- **Repair:** damage carries over between hordes; repaired with materials
  and by Engineers. Cost scales with missing HP; a broken (0 HP) segment is
  repaired the same way, not rebuilt *(designer's call)*.
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
- **Broken wall under a defender** *(designer's call)*: when a segment
  breaks, defenders on its wall-walk or gate post drop to the nearest free
  ground post behind it and fight from there. Turrets on that mount are
  jammed (§7).

## 4. Horde defence (the active part)

- **Real time.** Defenders and turrets aim and fire **automatically** at
  enemies in range. The player doesn't steer units; they act through card
  picks (the game pauses for these), moving defenders between posts,
  picking focus targets and spending horde cash (buffs, repairs, active
  skills).
- **Targeting:** each defender and turret shoots the enemy **closest to
  itself** within range. **Click an enemy to focus it** *(designer's
  call)*: every defender and turret with it in range switches to it until
  it dies or leaves their range, then goes back to closest-first. Clicking
  empty ground clears the focus. While an active skill is armed, the click
  aims the skill instead.
- **Length** *(designer's call)*: a horde takes about 3–5 minutes.
- **Start:** the commander's equipped perks are on (§5) and **1 defender**
  takes a post; the player picks which available defender and which post.
  Turrets and traps are whatever was built before the horde (§7); nothing
  is built mid-fight.
- **Defender HP and injury:** defenders have HP: 100 + 5 per Grit point
  *(designer's call, starting point)*. Every recovered defender starts a
  horde at full HP and doesn't regain HP mid-horde. They are hit by ranged
  enemies (Spitters) and by enemies that broke into the camp. At 0 HP a
  defender is **injured**: they leave the fight (their post is free again),
  can't be recruited back into the same horde, and can't defend or patrol
  until they recover (§11). No one dies in a horde. The loss rule is in
  §2.
- **Fight levels:** kills give fight XP. Each fight level pauses for a pick
  of 1 of 3 offers:
  - an **upgrade card** (§8), or
  - a **recruit card**: a defender from your roster joins and takes a free
    post. Recruit cards show up by chance (starting point: 30% per offer
    slot, lower once the squad is large).
- **Recruits come from your roster**, bringing their permanent level,
  stats, title and weapon. Defenders out on patrol, crafting or injured
  can't be recruited. With none available (or no free post), no recruit
  cards are offered and that slot becomes an upgrade card *(designer's
  call)*.
- **Waves:** a horde is 5–10 waves *(starting point)*, growing within the
  horde; Hordes 1–4 send Shamblers and Runners only *(designer's
  call)*; a boss horde ends in a Mutated Horror.
- **Horde cash:** kills drop cash, spent during the fight only, on:
  - **temporary buffs** (e.g. +damage or +fire rate for 30 s),
  - **repairs** (patch a wall segment or a turret's condition),
  - **active skills**: click-to-target abilities that cost cash and have a
    cooldown, e.g. airstrike, molotov, flashbang.
  Cash can't buy turrets or traps, and it resets to 0 when the horde ends.
- **Reward on success:** mostly **defender XP**, **camp XP** (§11 Camp
  level) and **Mutated Genes**, plus a small chance of materials or a weapon. Higher horde numbers pay more.
  Defender XP goes in full to every defender who took part, injured or
  not, so a recruit never dilutes it *(designer's call)*. Defenders left on the bench get no horde XP; patrols are their other way to level (§10).

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
| Grit | All | +defender HP in hordes; patrol survival and power |

- A stat's effect only applies with a matching weapon: Bob with 50 Aim
  holding a knife gets nothing from his Aim. Crafting uses Tech regardless
  of weapon *(guess)*.
- Defender XP comes from hordes and from patrols (§10); both are full sources, so a defender can level by patrolling alone.
- No stat respec in v1: points are permanent (weapon swaps are free).

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

- **Built before a horde** with materials, in build mode between hordes;
  they stay between hordes. A turret is jammed (condition 0), never
  destroyed, so a loss can't delete your build *(designer's call)*. They
  can't be built or bought during a horde.
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
  - **Crafted** by a defender at the workbench from Scrap and Parts. A
    crafting job takes real time and keeps
    running while the game is closed. Higher Tech = faster crafting and better batteries (more
    charge); an Engineer title adds a quality bonus.
- **Battery quality:** Makeshift, Standard, High-capacity, Military
  *(starting points)* — more charge per battery.
- **Loading and cap** *(designer's call)*: batteries are loaded into the
  bank automatically between hordes and used up when loaded; extras wait in
  storage. The bank has a cap (starting point: 10 Standard batteries' worth)
  that rises with each battery tier researched.
- **Generator:** burns **Gas** to recharge the battery bank between hordes,
  slower and less efficient than batteries. Built in build mode. Starting
  point *(designer's call)*: 1 Gas = half a Standard battery's charge, 10
  minutes of real time per Gas, runs while the game is closed, stops at the
  bank cap.
- A defender crafting can't patrol or be recruited until the job is done
  *(guess)*.

### Traps

- On the outer layer, built before a horde: slow and thin the horde before
  it reaches the first wall.
- **Basic traps** (spikes, barbed wire) are built from materials.
- **Chemical traps** are crafted at the workbench from **Chemicals** (a
  timed job, like batteries), then placed: **slow** (glue), **burn**
  (incendiary), **corrode** (lowers armour), **paralyze** (stuns for a
  moment). Each is used up after a number of triggers *(designer's call)*.
- Trap types and strength are upgraded through research.

## 8. In-horde upgrade cards (roguelite)

Offered 1 of 3 on each fight level. Lost when the horde ends.

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

All enemies enter from the right edge and rush left toward the camp as
one crowd (no lanes, §3).

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
  numbers rise.
- **Scaling:** enemy HP × 1.10 per wave, × 1.15 per horde number (starting
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
  and one party brings back several kinds of loot. The trade-off is the big-horde risk.

### Sending a patrol

- Pick a party from the roster and a location. Time is real time:
  **travel out → search → travel back**. Farther and more dangerous
  locations take longer and pay more. Patrols keep going while the game is
  closed.
- **Vehicle:** the camp can build a car; a patrol that takes it burns
  **Gas** and travels faster (starting point: half the travel time). One
  car = one patrol at a time with it; more cars through research
  *(designer's call)*. Gas burned scales with trip length and is set so a
  car trip never brings back more Gas than it burns, even to a gas station
  *(designer's call; balance test)*.
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
  - **Injured:** members come back hurt and must recover before they can
    defend or patrol (§11 Recovery).
  - **Dead:** a member doesn't come back — their level, stats and title
    are lost for good. Their weapon stays at that location; the next
    patrol there collects it with its loot (no roll, no expiry)
    *(designer's call)*.
  - **Wipe:** the whole party is lost.
- **Reward grows with risk:** dangerous runs roll more and rarer loot, so
  sending a weak party into a deadly place is a real gamble, not just a
  mistake.
- **No patrol limit:** the commander can send as many parties as they like, at the same time, as long as there are idle defenders (not injured, crafting, on another patrol or picked for the next horde). The car is the only shared asset (§10 Vehicle).
- **Returns:** loot and **defender XP** for every member who comes back, scaled by the trip's danger and length *(designer's call: a Safe 1-hour trip ≈ the XP of winning the current horde; Deadly trips pay up to 3×)*; a "patrol report" lists what came
  back and who didn't.
- **Survivors:** a patrol can come back with one or more **survivors** it
  found (chance rises with the location's danger *(designer's call)*). The
  report shows each survivor's level, stats and weapon, and the player
  **accepts** them into the camp or **turns them away**. Accepting needs a
  free camp slot (§11); a turned-away survivor is gone. Undecided
  survivors wait in the report and take no slot until accepted, so the
  player can free a slot first *(designer's call)*. A survivor's level is
  rolled from 1 up to the location's danger tier, with a weapon of a
  matching rarity *(designer's call)*.
- New locations are revealed by research, scouting or boss hordes
  *(guess)*.

## 11. Resources and research

| Resource | Main source | Spent on |
|---|---|---|
| Scrap | Patrols | Building, repairs, crafting, turret maintenance |
| Parts | Patrols (electronics, military) | Turrets, maintenance, batteries, weapon rarity |
| Building materials (wood, metal, concrete) | Patrols (hardware, construction) | Barrier tiers |
| Gas | Patrols (gas station) | Generator (recharges the battery bank), car (faster patrols) |
| Batteries | Patrols, crafting | Turret energy |
| Food (snacks count as Food) | Patrols (supermarket, gas station) | Injury recovery |
| Medicine | Patrols (pharmacy, hospital) | Injury recovery (faster than Food) |
| Chemicals | Patrols (pharmacy, hospital) | Chemical traps (slow, burn, corrode, paralyze) |
| Mutated Genes | Hordes, especially mutants and bosses | Research |
| Defender XP | Hordes, patrols | Defender levels → stat points |
| Camp XP | Horde wins | Camp levels → camp-level picks |

- **Research** (paid in Mutated Genes): barrier tiers and traps, turret
  types, battery tiers, new cards in the offer pool, commander perks and
  perk slots, active skills, more cars, larger base area, new world-map
  locations.
- **New defenders** come mainly as **survivors** found on patrols (§10),
  and rarely from a camp level-up (§11 Camp level), each with a name, level, stats and weapon. Needed to replace losses.
- **Camp capacity:** the camp holds a limited number of people (starting
  point: 5). Every defender counts, wherever they are (on patrol, crafting,
  injured). **Camp upgrades** (materials) add slots (starting point: +2
  each). A full camp can't accept survivors or free recruits.
- **Dismissing** *(designer's call)*: a defender can be dismissed (with a
  confirm) to free a slot, e.g. for a better survivor. Their weapon returns
  to storage; the defender is gone for good. Not allowed while 3 or fewer
  are alive, so it can't be used to farm roster-floor recruits.
- **Recovery:** an injured defender (from a horde or a patrol) recovers
  over real time (starting point: 2 hours), with or without Food. Each
  **Food** used cuts 30 minutes; each **Medicine** cuts 60 *(designer's
  call, starting points)*, so 4 Food or 2 Medicine is a full recovery. Both
  are used up. Recovery runs while the game is closed.
- **Roster floor** *(designer's call)*: if fewer than 3 defenders are
  alive, a free basic recruit (level 1, Rusty pistol) arrives every hour of
  real time (while camp slots allow), so a patrol wipe can never leave the
  player with no one to defend or patrol. It counts the living roster, not
  who is available, so sending everyone out doesn't trigger it.
- **No deadlock** *(designer's call)*: every horde pays a little Scrap and
  Wood — more on a win, less on a loss — so the base can be repaired even
  with no patrol loot.

### Camp level *(designer's call)*

- **Camp XP** comes from winning hordes, and rises with the horde number
  *(guess: half the horde's defender XP)*. Patrols give no camp XP
  *(guess)*. A loss gives none (§2).
- **Camp level-up:** on the result screen after a horde, each camp level
  gained offers a pick of **1 of 3 permanent camp upgrades** *(guess: 1 of
  3, like fight cards)*.
- **Not research:**
  - Research (Mutated Genes) unlocks new things: tiers, turrets, cards,
    perks.
  - Camp-level upgrades are free, small and permanent: they strengthen
    what the camp already has.
  - They also differ from **camp upgrades** paid in materials, which only
    add camp slots.
  - Example upgrades *(guess)*: +5% horde cash; start each horde with some
    cash; barrier repairs cost 10% less; injury recovery 10% faster; +5%
    patrol loot.
- **A survivor wants to join** *(designer's call: rare)*:
  - On a camp level-up, one slot of the offer can be a survivor instead of
    an upgrade *(guess: 10% chance per level-up)*.
  - Accepting follows the patrol-survivor rules (§10): it needs a free
    camp slot, and level and weapon are rolled *(guess: level 1 to the camp
    level, capped at 5)*.
  - Picking another option turns them away.
  - Patrols stay the main source of new defenders.

### Start and pacing *(designer's call, starting points)*

- **New game:** the commander with 1 perk slot (Steady Fire unlocked), 3
  defenders with Rusty weapons (pistol, knife, toolkit — one per
  profession), a camp with 5 slots, one wood wall layer with a gate, 2 tower posts,
  1 workbench, the gas station, supermarket and electronics
  store revealed on the world map (hardware store after Horde 3, pharmacy
  after Horde 5), and a small stock of Scrap, Wood, 3 Food, Parts for one
  turret and 2 Makeshift batteries. Why: the first two locations drop no
  Parts, yet turrets and maintenance need them, and a first loss would
  otherwise leave injured defenders with no Food.
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

Superseded by the phases, milestones and tickets on GitHub; kept as the
original outline.

1. Fake-3D base view: camera, one wall layer, one Gunner on a post,
   shamblers from the right, the camp on the left.
2. A horde: waves, fight level, 1-of-3 cards and recruit cards.
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
  mouse and keyboard (clicks for picks, posts, focus and skill targets); itch.io
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
