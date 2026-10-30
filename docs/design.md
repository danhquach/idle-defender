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
- **As built (ID-047, starting points):** the field is 1,600 × 800 px with
  10 segments per layer (80 px each), top to bottom. Enemies spawn along the
  whole right edge and spread over the full height. The starting layer is
  10 wood segments with the gate on row 5 (rows count 0–9 from the top) and
  towers on rows 4 and 6. Segment and repair costs are per segment, so a
  full wood wall now costs 100 Wood and 50 Scrap; build mode shows each
  segment's cost and the Repair all total. The balance targets held without
  a retune. The camera opens fitting the whole field, width and height, and
  pans to every corner at 0.5–2× zoom. A save from before (5 rows, save v1)
  loads with its rows moved to rows 3–7, which puts the old start exactly
  where the new one stands; the new rows are empty ground (open gaps until
  built) and the build panel says so when it loads, from storage or a
  backup code.

### Posts and positioning

Defenders stand on **posts** the player builds and chooses between.

- **Wall-walk / gate posts** (on a wall): melee (blade or tool) reaches
  enemies hitting that wall; ranged has a clear line.
- **Towers** (behind a wall, elevated): ranged gets +range; melee can't
  reach, not even an enemy inside the camp beside the tower, so a Ripper
  or Engineer there fights with their gun.
- **Ground posts** (between layers): melee fights enemies that broke
  through; ranged is short-sighted.
- **Range by post** *(designer's call, starting points)*: every gun (every
  defender carries one, §6 Loadout) gets ×1.25 range on a tower, ×1 on a
  wall-walk, ×0.75 on the ground. A blade or tool reaches 50 px from its
  holder's post on a wall-walk or ground post.
- **Adjacency:** an Engineer buffs the turrets and defenders beside them
  *(designer's call, starting point: defenders within 100 px fire 15%
  faster; several Engineers don't stack)*.
- **Engineer repair** *(designer's call, starting point)*: a standing
  Engineer restores 3 HP/s to the most damaged standing segment of their
  post's layer, within one row of the post. Broken segments wait for build
  mode.
- **Recruits** *(designer's call)*: a recruit card offers a defender with
  any free post; everyone carries a gun, so every post works. The start,
  moves and replacements may use any post too.
- Defenders can be moved between posts during a horde *(guess: with a short
  walk time, so a fallen outer layer means pulling back)*.
- **Broken wall under a defender** *(designer's call)*: when a segment
  breaks, defenders on its wall-walk or gate post drop to the nearest free
  ground post behind it and fight from there. Turrets on that mount are
  jammed (§7).
- **As built (ID-048, starting points):** each wall or gate segment has 2
  wall-walk spots side by side, top to bottom (a quarter and three quarters
  down the segment), so a 10-row wall lines up 20 defenders. Each spot holds
  a post or a turret, not both, and keeps the wall-walk rules: ×1 gun range,
  50 px melee reach, dropping to the nearest free ground post when the
  segment breaks. A segment's build menu lists both spots, plus "Line the
  wall": a wall-walk post on every free spot of that layer's built segments,
  top to bottom, showing the total cost and asking first (and how many the
  stock covers when it can't cover them all); it stops when the stock runs
  out. The start pick, moves and replacements name each spot ("spot 1",
  "spot 2"); a defender on the wall draws on its top, the back spot first.
  A save from before spots keeps each wall-walk post and wall mount on spot
  1, and only spot 2 is written to a save. Balance: firepower is capped by
  the roster, not posts: three staffed wall-walk posts win as much as a full
  line, so post cost stays as it is; a full line on the starting wall still
  wins Horde 5 at most half the time and Horde 7 never (balance test). Lining
  the wall found a stand-off, now fixed: an enemy in the camp hunting up the
  wall line was pushed back for good by one pressed against the wall's
  front; enemies on opposite sides of the walls no longer push each other.

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
- **Enemies inside the camp** *(designer's call)*: once an enemy has
  crossed every layer, it walks straight to the nearest defender (walls
  don't stop it from the camp side) and hits them; with no defender left,
  it waits at the camp line while the camp falls (§2).
- **Replacing the injured** *(designer's call)*: when a wave is cleared,
  the fight pauses to offer a replacement for each injured defender, one
  offer each in injury order. An available defender from the bench takes
  the injured one's post, or a free post the player picks if that one is
  taken or unusable. The player can skip. With nobody available or no free
  post, no offer shows; after the last wave the horde is won.
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
  call; as built ID-023, Horde 1 is Shamblers only)*; a boss horde ends in
  a Mutated Horror.
- **Horde cash:** kills drop cash, spent during the fight only, on:
  - **temporary buffs** (e.g. +damage or +fire rate for 30 s),
  - **repairs** (patch a wall segment or a turret's condition),
  - **active skills**: click-to-target abilities that cost cash and have a
    cooldown, e.g. airstrike, molotov, flashbang.
  Cash can't buy turrets or traps, and it resets to 0 when the horde ends.
- **As built (ID-018, starting points):** each kill pays its enemy's cash
  (Shambler 2). A shop row in the fight buys Adrenaline (+25% damage, 30 s,
  30 cash) and Overdrive (+25% fire rate, 30 s, 30 cash) for defenders and
  turrets, one of each running at a time, timed in fight time (they stop
  during picks); Patch wall (20 cash, +100 HP to the standing segment with
  the lowest HP share; broken segments stay broken); and Fix turret (20
  cash, +30 condition to the most worn turret, unjamming a jammed one).
  Cash lives only in the fight and is never saved. Active skills come with
  ID-019.
- **As built (ID-019, starting points):** three active skills are researched
  at the Research Lab: Flashbang (Lab 1, 30 Scrap, 20 Wood), Molotov (Lab 1,
  after Flashbang, 30 Scrap, 30 Wood) and Airstrike (Lab 2, after Molotov,
  60 Scrap, 40 Wood). In a fight the shop row arms a researched skill; the
  next click on the field aims it there and spends the cash (Esc or a second
  click on the button puts it away). Each hits enemies only, within its
  radius of the aim point: **Flashbang** (20 cash, 25 s cooldown, radius
  150) stuns for 3 s, no moving and no attacking; **Molotov** (25 cash, 20 s,
  radius 80) leaves a fire burning 5 damage/s for 6 s; **Airstrike** (40
  cash, 40 s, radius 120) deals 40 damage at once. Cooldowns, stuns and fires
  run on fight time (they stop during picks), every skill is ready when a
  horde starts, and a skill kill pays XP and cash like any other.
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
loadout decides which profession they are working as.

### Loadout → profession

Each defender carries a **primary** (always a gun), an optional
**secondary** and one **item** slot *(designer's call)*. Melee range was
the problem with a melee-only defender: every defender now shoots, and
close-quarter weapons come out only when an enemy is close.

| Kind | Examples | Slot | Who handles it well |
|---|---|---|---|
| **Sidearm** | Pistol | Primary or secondary | Everyone: low damage, but fast to reload and light to handle |
| **Specialised gun** | SMG, rifle, shotgun, LMG, sniper rifle | Primary | Gunners; anyone else takes a penalty |
| **Blade** | Knife, machete, sword, chainsaw (machine saw) | Secondary | Rippers: close-quarter damage at walls and gates |
| **Tool** | Toolkit, welder | Secondary | Engineers: a weak blunt weapon up close; mostly for repairing barriers and turrets, buffing turrets and crafting better batteries |

- **Profession from the loadout:** a blade makes a Ripper, a tool makes
  an Engineer, anything else (a specialised gun, or only a sidearm) makes
  a Gunner. Typical loadouts: Gunner rifle + pistol; Ripper pistol +
  knife; Engineer pistol + toolkit.
- **Gunner handling** *(starting points)*: a Gunner is better with every
  gun, sidearm included: fires 15% faster, reloads 25% faster and aims
  better (+5% crit chance, on top of Aim). A non-Gunner firing a
  specialised gun deals −30% damage and reloads 50% slower; a sidearm in
  anyone else's hands has no penalty and no bonus.
- **Reload:** every gun has a magazine and a reload time.
- **Switching** (automatic):
  - A blade or tool strikes when an enemy is within its reach (50 px);
    otherwise the defender fires their primary.
  - A Gunner with a sidearm as secondary fires it while the primary
    reloads, if an enemy is within its close range *(starting point:
    200 px)*, then switches back to the primary.
  - A sidearm is the only gun that fires while its holder walks between
    posts, so a defender can pull back to a safer post and keep shooting.
- **Shield** (Ripper only, fills the item slot): −30% damage taken in
  hordes, so a Ripper can act as a tank; in exchange the holder's gun
  fires 20% slower and they walk 20% slower *(starting points)*.
- **As built (ID-042, starting points):** pistol 6 damage (6.2 since
  ID-044, Ballistics below) every 0.6 s,
  range 600, a 10-round magazine and a 1.5 s reload (it was 7 damage with
  no reload: with every defender shooting, the camp out-gunned the
  balance targets); knife 10 every 0.5 s, toolkit 4 every 0.6 s, both
  reaching 50 px. A sidearm fired on the move uses ground-post range
  (×0.75). One shot cooldown covers every weapon a defender carries.
- **Specialised guns (as built, ID-046, starting points):** each is an owned
  item only (a horde drop, picked evenly with the other base weapons; never
  free like the pistol, knife and toolkit), primary only, with the Gunner and
  non-Gunner rules above, rarity and affixes. A shotgun round is 6 pellets, each
  rolling its own angle in the cone and hitting on its own for the listed
  damage (no distance falloff, one muzzle flash); the crit is rolled once per
  round, so all six pellets crit together. The sniper rifle pierces one
  enemy by default; a pierce affix adds one more.

  | Gun | Damage | Every | Range | Magazine | Reload | Speed | Spread | Pellets | Pierce |
  |---|---|---|---|---|---|---|---|---|---|
  | Pistol | 6.2 | 0.6 s | 600 | 10 | 1.5 s | 1,800 | ±2.5° | 1 | 0 |
  | SMG | 5 | 0.2 s | 400 | 30 | 2 s | 1,600 | ±5° | 1 | 0 |
  | Rifle | 7 | 0.4 s | 750 | 20 | 2 s | 2,200 | ±1.5° | 1 | 0 |
  | Shotgun | 4 per pellet | 0.75 s | 350 | 8 | 2.5 s | 1,400 | ±12° | 6 | 0 |
  | LMG | 6 | 0.22 s | 500 | 60 | 5 s | 2,000 | ±4° | 1 | 0 |
  | Sniper rifle | 22 | 2 s | 1,100 | 5 | 3.5 s | 3,000 | ±0.5° | 1 | 1 |

  Balance (a lone Common-gun Gunner on the upper tower against 20-HP Shamblers
  held in place; kills, mean of the seeds; `balance.test.ts`):

  | Gun | Close crowd, 20 s | Far (530–830 px), 20 s | Lane, 20 s | Sustained, 60 s | Horde 4 wins (Bob's gun + pistol) |
  |---|---|---|---|---|---|
  | Pistol | 8.3 | 8.0 | 8.3 | 25.8 | 5% |
  | SMG | 22.0 | 0 | 16.8 | 60.0 | 100% |
  | Rifle | 16.7 | 16.2 | 16.3 | 50.8 | 95% |
  | Shotgun | **26.2** | 0 | 12.0 | 51.8 | 95% |
  | LMG | 21.5 | 13.6 | 20.3 | **66.2** | 100% |
  | Sniper rifle | 21.7 | **21.4** | **21.0** | 62.2 | 75% |

  Each beats the pistol in its role at least twice over (the rifle, the
  all-rounder, 1.5× everywhere); the shotgun leads up close, the sniper far and
  in a lane, the LMG in sustained fire; no gun leads more than two, the rifle
  none, and the SMG and shotgun can't reach far. One specialised gun lifts
  Horde 4 from about 5% to 75–100% won, but Horde 6 stays at most a quarter won
  with any of them (the curve still needs the camp to grow).
- **Roster screen (as built, ID-012):** a Roster button on the build panel
  opens it in the panel's place: each defender's level and XP, stats,
  titles, unspent points (spent there) and rest time, and three pickers
  (primary, secondary, item). Swaps are free between hordes, injured or
  not; a loadout the rules refuse says why and changes nothing.

### Ballistics

Every gun shot (defenders' guns and turrets) is a bullet that flies from
the muzzle and deals damage only when it reaches an enemy; blade and tool
strikes stay instant.

- **Speed** is per gun *(starting points)*: pistol 1,800 px/s, turret
  2,000 px/s.
- **Hits by collision:** a bullet hits the first living enemy whose body
  its path crosses in a step (swept, so a fast bullet never tunnels
  through), once, and is gone. If its target dies or steps aside it flies
  on and can hit anyone else in its path; past its gun's range it falls
  with no damage. Bullets pass over walls, gates and defenders and never
  hurt the camp.
- **Lead:** shooters aim where the target will be when the bullet
  arrives, from its velocity over the last step. A Shambler walking
  straight is hit; one that changes lane after the shot can be missed.
- **Spread:** each gun has a cone *(starting points: pistol ±2.5°,
  turret ±1°)*; a Gunner's is halved. The angle is rolled through the
  seeded RNG, so a run stays deterministic. Aim only adds crit chance.
- **Pierce:** a bullet with pierce N goes through N enemies, each time
  hitting the next one it crosses within 200 px, then stops (ID-046: the
  sniper rifle has 1 by default; a pierce affix adds 1).
- **As built (ID-044, starting points):** the crit is rolled at the
  trigger. About 1 bullet in 10 hits nobody, so the pistol was retuned
  from 6 to 6.2 damage and its cone set at ±2.5° (±2° left a tutorial
  defender injured on one seed): the balance tests hold. Bullets in
  flight are cleared when a horde ends and are never saved (a horde is
  never saved mid-fight, §12). 300 enemies and 200 bullets in flight cost
  about 1.3 ms a step in Node, well inside the 33 ms a step allows, so no
  broad phase is needed yet.

More professions later *(guess)*: Marksman (sniper rifles only, bigger
bonus than Gunner), Pyro (flamethrowers), Medic (uses Medicine better).

### Stats

Each defender level gives **stat points** (3 per level, starting point):

| Stat | Feeds profession | Effect |
|---|---|---|
| Aim | Gunner | +gun damage, +crit (any gun, whoever fires it) |
| Might | Ripper | +blade damage, +cleave |
| Tech | Engineer | +repair rate, +turret buff, +battery quality |
| Grit | All | +defender HP in hordes; patrol survival and power |

- A stat applies per weapon: Aim to every gun shot, Might to every blade
  strike; tool strikes get no stat bonus. Jack with 50 Might gets nothing
  from it on his pistol shots. Crafting uses Tech regardless of weapon
  *(guess)*.
- Defender XP comes from hordes and from patrols (§10); both are full sources, so a defender can level by patrolling alone.
- No stat respec in v1: points are permanent (loadout swaps are free).
- **As built (ID-011, starting points):** level L → L+1 costs 25 × L
  defender XP, so a defender in every win reaches level 2 after Horde 2 and
  level 3 after Horde 4. Per point: Aim +2% Gunner damage and +0.5% crit
  chance (a crit deals ×2, chance capped at 50%); Might +2% Ripper damage
  and a cleave of 1% of each strike to enemies within 30 px of the target
  (capped at 50%); Tech +2% Engineer repair; Grit +5 HP in hordes over
  the base 100. Points are spent on the result screen after a win; unspent
  points carry over.

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

- The title bonus multiplies on top of the stat, per weapon like the
  stats: a Gunner title boosts gun shots, a Ripper title blade strikes,
  an Engineer title repair.

- The highest title becomes the defender's name tag: "Bob the Gunner",
  "Jack the Ripper", "John the Engineer". A defender can hold titles in
  more than one profession. A tie goes to more points, then Gunner, Ripper,
  Engineer *(designer's call)*.

### Gear

- Weapons come from patrols (main source), boss hordes and crafting.
- **Rarity:** Rusty, Common, Military, Prototype, Relic, with rolled
  affixes (e.g. +pierce, burning rounds, +damage vs. mutants).
- A loadout per defender: primary, secondary and one item (§6 Loadout)
  *(guess: armour later, in the item slot)*.
- **As built (ID-013, starting points):** the free Pistol, Knife and Toolkit
  are Common and unlimited; every other weapon is one owned item, kept in the
  camp's **armoury** or carried by one defender at a time (the roster refuses
  a weapon someone else carries and says who). Rarity multiplies damage, and a
  tool's repair: Rusty ×0.8, Common ×1, Military ×1.15 (1 affix), Prototype
  ×1.3 (2), Relic ×1.5 (3); a weapon whose kind fits fewer affixes gets fewer
  (a Relic blade has 2). Affixes, each at most once, rolled as whole numbers:
  +5–15% damage, +5–15% fire rate (any weapon), +20–50% magazine, −10–25%
  reload, pierce (guns: the bullet goes through one more enemy, hitting the
  next it crosses within 200 px; §6 Ballistics), +10–25% repair (tools). A horde win
  drops a weapon with chance 10% + 1% per horde number, capped at 30%: an
  even pick of base weapon, rarity Rusty 30 / Common 45 / Military 20 /
  Prototype 5 (Relic never from a horde). The result screen names it with one
  line per affix. The camp owns at most 30 weapons (armoury and hands
  together); a drop past that is salvaged for Scrap (Rusty 5, Common 10,
  Military 25, Prototype 50, Relic 100). Burning rounds and +damage vs.
  mutants wait for burning effects and mutants. Manual salvage is a follow-up.

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
- **As built (ID-014, starting points):** the Auto-turret is unlocked by
  research (§11) and built in build mode for 40 Scrap and 20 Wood on a
  free tower or wall mount (a spot holds a post or a turret, not both).
  It fires 5 damage every 0.5 s, range 500 (×1.25 on a tower), and draws
  1 charge per second while it has a target from the battery bank
  (below; a stand-in full bank of 600 before ID-015). Condition
  0–100: −0.2 per shot, and a wall turret −0.5 per point of damage its
  segment takes; below 50 it fires slower, down to half speed; at 0 it
  is jammed; wear carries between hordes exactly, and a wall turret only
  wears by the damage its segment can still take. A wall turret whose
  segment breaks stops firing until the
  segment is repaired. A full repair costs 20 Scrap, in proportion to the
  missing condition (Parts join later). A standing Engineer within 100 px
  gives +15% damage and fire rate (scaled by Tech and title, not stacked)
  and repairs the most worn turret in reach 0.5 condition/s, never a
  jammed one. Between hordes a turret can be **salvaged** (50% of its
  cost × its condition share back, rounded down; the only way one is
  removed) or **relocated** to another free mount for free. Turrets
  ignore the in-horde cards.

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
- **As built (ID-015, starting points):** the bank's charge carries from
  one horde to the next and holds at most 1,000 (10 Standard batteries'
  worth). Batteries wait in storage by quality (Makeshift 60, Standard 100,
  High-capacity 160, Military 250 charge) and load into the bank by
  themselves between hordes (a new game, a finished horde, a loaded save or
  code), largest first, while each fits under the cap; one that would
  overflow waits. The **generator** is built once in build mode for 40
  Scrap and 20 Wood, no research. It burns 1 Gas per 10 minutes of real
  time for 50 charge, also while the game is closed, while there is Gas and
  room; progress toward the next Gas carries over, and idle time and fight
  time earn nothing. The last Gas before the cap fills it and any extra is
  lost; at the cap or out of Gas it stops, and starts afresh when there is
  room and Gas again. Until patrols bring them, a new game starts with 2
  Makeshift batteries and 4 Gas, and each won horde pays 1 Gas. Crafting
  and battery tiers that raise the cap come later (ID-035).
- **As built (ID-016):** build mode offers an Auto-turret on an empty tower
  spot and on a wall segment's mount; a turret's menu shows its condition and
  state (powered, dark, offline, jammed) with Repair, Salvage (asks first)
  and Relocate, which lists the free mounts it may move to. Repair all
  repairs turrets with the walls, all or nothing. The build panel shows the
  bank as a meter ("Bank n/1,000"), and the fight status bar shows the
  charge as it drains.

### Traps

- On the outer layer, built before a horde: slow and thin the horde before
  it reaches the first wall.
- **Basic traps** (spikes, barbed wire) are built from materials.
- **Chemical traps** are crafted at the workbench from **Chemicals** (a
  timed job, like batteries), then placed: **slow** (glue), **burn**
  (incendiary), **corrode** (lowers armour), **paralyze** (stuns for a
  moment). Each is used up after a number of triggers *(designer's call)*.
- Trap types and strength are upgraded through research.
- **As built (ID-017, starting points):** a fixed trap strip lies in front
  of the outermost layer's column (`x` 1100–1220), one cell per row, there
  before that wall is built. Both basic traps are built in build mode from
  a new game, no research: **spikes** (15 Wood, 10 Scrap) deal 8 damage to
  each enemy that enters the cell; **barbed wire** (10 Wood, 15 Scrap)
  holds each enemy that enters to half speed while it is inside. Each
  trap triggers once per enemy and has 30 durability, −1 per trigger; at 0
  it is broken and does nothing until repaired between hordes, for its
  cost in proportion to the missing durability (Repair all includes
  traps). A trap is never destroyed; **Remove** refunds 50% of its cost ×
  its durability share, rounded down, and frees the cell. Upgrades and
  chemical traps come later (ID-034, ID-035).

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
- **As built (ID-022, starting points):** stat cards stay squad-wide (per-
  profession stat cards and research-unlocked cards come later). Behaviour
  cards act on the squad's gun bullets only (turrets never), and each is
  taken once per horde:

  | Card | Rarity | Effect |
  |---|---|---|
  | Piercing Rounds | rare | +1 pierce on every squad bullet |
  | Ricochet | rare | A bullet's first hit bounces one new bullet to the nearest other enemy within 150 px, at **25%** damage; a bounce never bounces |
  | Split Shot | epic | Each shot adds 2 bullets at ±10°, 50% damage each |
  | Burning Rounds | rare | The enemy hit burns 3 dmg/s for 3 s; a new hit resets it, never stacks |
  | Explode on Kill | rare | A bullet kill bursts 15 damage on enemies within 40 px; bursts don't chain |
  | Chain Lightning | epic | **10%** of bullet hits (seeded) arc to the 2 nearest within 100 px at 50% damage (armour applies); the one beam drawn |
  | Cleave | common | +20% cleave share on blade and tool hits, still capped at 50% |

  Barrier: Spiked Walls (rare, once): an enemy hitting a standing segment
  takes 3 damage per blow (a Spitter's spit from afar doesn't count); Slow
  Field (rare, once): enemies within 120 px in front of the outermost layer
  with a segment standing move 30% slower, multiplying with wire. Patch Up and
  Reinforce stay common and repeatable. Power (repeatable, offered only when
  the base has a turret, since the bank exists from the start): Recharge
  (common) adds 25% of the bank cap, capped; **Power Surge** (rare; named so
  it doesn't clash with the shop's Overdrive buff) runs turrets with no draw,
  and lit on an empty bank, until the current wave ends (picked on a wave's
  last kill, the break has begun, so it covers the next wave). Explode on
  Kill's burst is flat damage that armour doesn't reduce; a Chain Lightning
  arc is a hit and does. Each offer slot rolls a rarity from the wave:
  common 70 − 4(w − 1)% (min 40), rare 25 + 3(w − 1)% (max 45), epic
  5 + (w − 1)% (max 15), taken in proportion (from wave 8 they sum to 99);
  none of that rarity left → the next rarity down, then up (five repeatable
  commons are always eligible, so a slot never comes up empty). Synergies: Burning Rounds with a Master (or
  Legendary) Gunner in the fight spreads burn to enemies within 40 px of one
  that dies burning; Ricochet + Piercing Rounds bounces keep the pierce the
  bullet had left. A card shows a synergy line when it would turn one on.
  Retune: the ticket's 50% Ricochet and 15% Chain Lightning let a campaign
  without building win Horde 5 and a full firing line win 60% of Horde 5;
  bold numbers above hold every balance target. The gun-role scenes (ID-046)
  now take only stat cards: behaviour cards favour fast guns.

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
- **As built (ID-023, starting points):**

  | Enemy | HP | Speed px/s | Hit | Radius | XP / cash |
  |---|---|---|---|---|---|
  | Shambler | 20 | 30 | 5 / 1 s | 12 | 1 / 2 |
  | Runner | 15 | 75 | 3 / 0.8 s | 10 | 1 / 2 |
  | Crawler | 40 | 40 | 20 / 1 s | 9 | 2 / 3 |
  | Bloater | 60 | 18 | blast | 18 | 3 / 4 |
  | Spitter | 25 | 28 | 8 / 2 s | 12 | 2 / 3 |
  | Brute | 150 | 20 | 25 / 1.5 s | 20 | 5 / 6 |
  | Screamer | 30 | 30 | 2 / 1 s | 12 | 3 / 4 |

  The radius is the body bullets hit, clicks focus and the crowd keeps apart
  (two bodies touch at the sum of their radii); in the camp an enemy hits a
  defender from its radius plus a defender's (12). Each wave rolls each
  enemy's kind through the seeded RNG: Runners are 15% of a wave from Horde 2,
  then each mutant 10% from its horde (Crawler 5, Spitter 6, Bloater 7, Brute
  8, Screamer 9), Shamblers the rest; Horde 1 stays Shamblers only and rolls
  nothing, so its seeds play as before. Behaviours:
  - **Crawler:** at the first standing segment it reaches it climbs for 3 s
    (still a target, wall-walk melee included; no attacks), then drops behind
    that layer; once only. The defeat screen lists such a crossing as "climbed
    over". If the segment breaks under it, it walks on through the gap.
  - **Bloater:** at a standing segment it blows up: 150 to it and 50 to the
    standing segments above and below (wearing their turrets), and is gone
    with no kill paid: an acid-green burst swells and fades over 0.4 s, and it
    leaves no falling body (ID-049). Killed first, it pops harmlessly and pays its kill. In
    the camp it blows up on the defender it reaches for 50.
  - **Spitter:** stops 150 px short of its stop line, so the wall-walk is in
    reach, and spits every 2 s at the nearest defender or working turret (not
    jammed, its wall standing) within 250 px (HP off a defender, a shield blocking its share; condition
    off a turret), else at the segment in front. A spit lands at once; a
    green glob arcs to it for 0.3 s.
  - **Brute:** each bullet does 3 less damage (at least 1); each pierce pass
    pays it again; blades, tools, traps and skills ignore it.
  - **Screamer:** other enemies within 150 px move 30% faster; several don't
    stack.

  Retune: the ticket's starting points made hordes easier, not harder (Runner
  10 HP, Crawler 15 HP / 4 hit: a full firing line won Horde 5 65% of seeds
  against 25% with Shamblers only), and a Spitter parked 250 px out reached
  no defender. Runner HP went to 15, the Crawler to 40 HP and a 20 hit (it
  skips the wall and hits defenders), and the Spitter's stop to 150 px. Now
  the full line wins Horde 5 15% of seeds against 25% with Shamblers only,
  every other balance target holds, and a lone pistol Gunner misses Runners
  about three times as often as Shamblers (lead from last step's velocity).
  Placeholder art (§15): each new kind is a drawn shape of its own, sized by
  its radius, mutants in acid green or flesh red, the Runner muted; generated
  art follows in its own ticket.
- **As built (ID-024, starting points): boss hordes.** Every 10th horde is a
  boss horde: its waves are as usual, and one **Mutated Horror** comes with the
  first spawn of the last wave (the random mix never rolls one). The horde is
  won once the last wave is cleared and the Horror is dead.

  | Enemy | HP | Speed px/s | Hit | Radius | Armour | XP / cash |
  |---|---|---|---|---|---|---|
  | Mutated Horror | 150 | 15 | 60 / 2 s | 32 | −2 per bullet (min 1) | 50 / 40 |

  Its HP scales like every enemy's (about 1,130 at Horde 10's last wave). Its
  armour works like a Brute's: blades, tools, traps and skills ignore it. It
  smashes walls and gates and hunts defenders in the camp like any enemy. Each
  boss horde's Horror has one ability, in turn: Horde 10 a **Broodmother**,
  20 a **Rammer**, 30 a **Regenerator**, then again from 40.
  - **Broodmother:** every 25 s, 2 Shamblers at the wave's HP beside it, on its
    side of every wall; they pay their kills like any Shambler.
  - **Rammer:** every 10 s it charges at 3× speed for 2 s; its first wall hit
    in a charge does 2×.
  - **Regenerator:** heals 3% of its max HP a second once 0.3 s pass without
    it losing HP.

  Ability clocks run on fight time (they stop during picks) and wait out a
  flashbang: a stunned Rammer holds its charge, and a Regenerator's 0.3 s
  count waits out the stun too. The HUD marks a boss horde on the start button ("Boss horde") and
  in the status line, shows a boss bar with the Horror's name, ability and HP
  while it is on the field, and the result screen names it ("injured by the
  Mutated Horror", "the Mutated Horror: Rammer is dead", or "still stood").
  Placeholder art: a large flesh-red hulk, sized by its radius.

  Retune: the ticket's starting points (400 HP, −5 armour, Brood 4 Shamblers
  every 10 s, Regen 2%/s after 3 s) made the Horror unbeatable: a pistol did
  1.2 per bullet, the Brood's Shamblers (151 HP each at Horde 10) drew all fire,
  and under steady fire the Regenerator never healed. The balance test's Horde 10
  reference camp is the starting wall in concrete with every wall-walk spot
  built and the starter roster carrying the XP of winning Hordes 1–9, against
  the Horror alone with the whole squad posted. With the numbers above, that
  camp wins against the Broodmother on 8 of 20 seeds, the Rammer on 20 (losing
  more wall than with no ability) and the Regenerator on 14, against 20 of 20
  with no ability. A lone pistol Gunner never wins. Horde 10 played in full is
  ID-052; rewards for a boss win come with the Mutated Genes tickets.

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
- **As built (ID-014, starting points):** research happens at a
  **Research Lab**, a camp building built in build mode for 30 Wood and
  20 Scrap and upgraded to level 2 for 80 Wood and 60 Scrap. Each node
  needs a Lab level and maybe an earlier node, costs materials and
  completes at once: **Metal walls** (Lab 1, 40 Scrap and 40 Wood)
  unlocks the Metal tier; **Auto-turret** (Lab 2 and Metal walls, 60
  Scrap and 40 Wood) unlocks turrets. A new game starts with no Lab and
  Wood walls only. Real-time research, Mutated Genes and the rest of the
  tree come with ID-035.
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
  defenders with Rusty weapons, one per profession (a pistol; a pistol and
  a knife; a pistol and a toolkit), a camp with 5 slots, one wood wall layer with a gate, 2 tower posts,
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

- **What is saved:** the game between hordes (horde number, base, stock,
  unlocked tiers, roster with XP and rest times), as versioned JSON, after
  every change (a build, a finished horde, a recovery, a loaded code). A
  fight in progress is not saved: a reload mid-horde comes back to the camp
  as it was before that horde. While a fight or its result screen is up,
  leaving the page asks first, so a stray refresh doesn't lose it.
- **Real time:** a rest is stored as the time it ends, so a defender heals
  while the game is closed.
- **Untrusted on the way in:** a save or a pasted code is size-checked, then
  read through an allow-list (exact keys, known ids, whole numbers in range,
  names of plain letters, the build rules a real camp keeps). Max HP comes
  from the current numbers and a rest is cut to 2 h past the save, so a
  retune or a clock set back never refuses a save. Anything else
  is refused: a bad save starts a new camp and is kept aside, never
  overwritten; a bad code changes nothing and says why.
- **Backup code:** the save as one line of text (a tag and base64) shown in
  the build panel, to keep outside the browser and paste back in. Loading
  one asks first, since it replaces the camp.
- **Storage refused:** where the browser blocks or fills storage the game
  still plays, and the build panel says saving is off.
- **Several tabs:** each saves on its own changes; the last write wins.

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
  glance; title shown as a small badge. *As built (ID-012, placeholder):* a
  plate above the defender in their top title's profession colour, one pip
  per rank (Junior 1 … Legendary 4); the same badge sits by the name on the
  roster.
- Turrets show power (lit / dark) and condition (sparks, smoke) at a
  glance. *As built (ID-014, ID-016, placeholder):* the head is lit when
  powered, dark with no charge or its wall broken, red-brown with a cross
  when jammed; sparks below 50 condition, smoke below 25; and a thin steel-blue
  condition bar over each turret, in build mode and in fights.
- Muted, desaturated ruins; mutants get the only saturated colours (acid
  green, flesh red).
- World map as a hand-drawn ruined region with location icons, patrol
  routes and a risk colour on each location.
- **Placeholder art first** *(designer's call)*: build with simple shapes
  and coloured blocks; real art follows Office Immortal's pipeline
  (`art-concepts/`, `art-src/`) once the game is fun.
- **As built (ID-043):** what the horde view shows has final art, generated
  with Pollinations on the allow-listed models in `docs/art-credits.md`
  (FLUX.2 Klein 4B for every asset; licences checked first). Each asset's
  prompt, model, seed, size and reference live in `art-src/manifest.json`,
  with the generations in `art-src/gen/`; one shared style prompt per kind
  (sprite or texture), and state variants (dark and jammed turrets, broken
  traps) are edits of their base generation so they keep its shape.
  `python3 tools/art/build.py` strips the generations' metadata (it holds
  the request and service URLs), keys out the magenta background, keeps the
  biggest shape, mutes everything but mutants, scales a group (the three
  defenders) by one factor and writes `src/assets/art/*.png`; `src/ui/sprites.ts` maps every enemy kind,
  profession, turret state, trap (built and broken) and wall tier to its art,
  and a test fails if any is missing. Walls are boxes with their tier's tiling
  top and front textures (so they keep the exact projection): lower and
  cracked as they take damage, the tier's rubble once broken, a door on a
  gate's top. Defenders and the Shambler stand on their spot; posts and
  turret heads sit on their footprint; traps lie across their cell. A lit
  turret glows; sparks, smoke, HP and condition bars and the title badge are
  drawn over the art as before. The art loads before the game starts; a
  failed load (or one past 20 s) shows a message instead of a blank canvas. Generation is a
  development step only: the key stays in `.env` and the page loads only its
  own bundled files.
- **As built (ID-050):** the ground is one surface. Three ground-tile variants
  share one seam border (manifest `edge`: the build blends each into the same
  narrow border and stops if they don't meet), so any variant tiles next to
  any other; the camp yard takes the field's palette and lighting (manifest
  `palette`) and fades into the field at both sides. A fixed seed picks the
  variant for each 160-unit tile and scatters decals (cracks, debris, dry
  grass) over field and yard, so every base shows the same layout on every
  load. `src/ui/ground.ts` paints it all once into one field-sized canvas at
  the tiles' own resolution, drawn whole each frame, so no tile edge can show
  at any zoom.
- **As built (ID-046):** a Gunner's sprite shows their primary: the rifle
  (the original Gunner art), the pistol (an edit of it), and the SMG,
  shotgun, LMG and sniper rifle. Each of those four is two generations: the
  gun alone, drawn from a public-domain US government photograph (manifest
  `photo`, credited in `docs/art-credits.md`), then the Gunner holding it,
  drawn from a weaponless Gunner body and that gun together (a `ref` list of
  `part` generations, which are never shipped themselves). Rippers and
  Engineers keep their own art whatever their primary.
- **As built (ID-045):** no line joins shooter and target. Each bullet is drawn
  at its simulated spot, in the depth sort, as a bright slug with a streak
  behind it whose length and colour are its gun's (`tracer` in the gun data:
  pistol 12 px, turret 14 px), dropping from the barrel to body height over
  the distance it was aimed. The fight records each shot (a 0.05 s muzzle
  flash at the barrel end of the defender's or turret's sprite) and each
  bullet's end (0.25 s: a blood puff on the body for a hit, a dust kick on the
  ground where a miss fell). Effects are drawn shapes, not sprites, so they
  need no art; each stays at least 1 px on screen at 0.5× zoom. Blade and
  tool strikes keep their slash.
- **As built (ID-049):** sprites move, drawn from the still art (no frames):
  each is moved, turned and stretched about its feet (`src/ui/anim.ts`).
  Enemies bob once per 20 px of ground they actually cover (so slower over a
  trap, and smooth however their pace wobbles), lean side to side, ease into
  and out of the walk over 0.15 s (no walk when only jostled by the crowd,
  under 4 px/s; a full one from 12 px/s), and breathe, lunge 6 px forward
  over 0.25 s as they hit a wall or defender, flinch 3 px back from a hit
  with a 0.1 s white flash (damage every step, such as a fire, twitches them
  every 0.2 s rather than holding them back), and on death flash from the
  killing blow, tip over backward and fade over 0.7 s where they fell (not
  after the fight's last kill, which ends it). Defenders breathe at their
  post, bob the same way walking between posts, kick back 3 px from each
  shot (starting with its muzzle flash), swing forward over a blade or tool
  strike's slash, and flinch when hit. Each sprite's cycle starts at its own
  phase. Every clock is fight time, so pause freezes it and game speed
  carries it; the core only records which defender struck. Hits, shots and
  deaths are remembered between frames by the view, never by the fight;
  build mode stands still. 300 animated Shamblers hold 60 fps (about 1.3 ms
  of work a frame, median).

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
  The simulator (`src/core/sim.ts`) plays hordes headless with a fixed
  scripted player; `src/core/balance.test.ts` holds the targets (Horde 1
  always won, Hordes 1–2 in 3–5 minutes, difficulty rising, a win paying
  for its repairs, a camp that doesn't build stalling by Horde 5), and
  `npm run balance` (Node 22.6 or later) prints the full table for tuning.
