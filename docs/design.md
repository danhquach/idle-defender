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

- **As built (ID-066): the horde-only build.** One `HORDE_ONLY` flag in
  `data.ts` cuts the game to one loop: fight a horde → result screen → next
  horde. There is no build panel, so the world map, patrols, building,
  research, the workbench, the camp level and the perk screen can't be
  reached; their code and saved state stay, to come back later.
  - Each horde-only fight is on its own fresh base: the one layer (Concrete,
    gate at row 6) at full HP and a tower for each squad slot. No repair
    step, and no damage carries over.
  - The loss rule is the one above with one layer: an enemy through the wall
    and every survivor down for 10 s.
  - A loss pays nothing and costs nothing (no Scrap, Wood, Food, Medicine or
    rest): the same horde is played again with every survivor and a full
    wall. Injury and rest timers are hidden.
  - The page opens on the next horde's start screen (the squad, Start
    Horde N) over the squad standing on the wall; the result screen's button
    starts the next horde (or the retry) at once.

## 3. The base (fake 3D, side-on layers)

One large map viewed from above at an angle (2.5D: walls and towers have
height, sprites are layered by depth). A fight shows one fixed frame of it
(§15, ID-064): nothing pans or zooms.
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
  a retune. The camera opened fitting the whole field and panned to every
  corner at 0.5–2× zoom; ID-064 replaced that with one fixed frame, from the
  wall to the spawn edge, with no pan or zoom (§15). A save from before (5
  rows, save v1) loads with its rows moved to rows 3–7, which puts the old
  start exactly where the new one stands; the new rows are empty ground (open
  gaps until built) and the build panel says so when it loads, from storage
  or a backup code.

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
- **As built (ID-065):** between hordes the base shows as the build scene
  (§15): the camp as a walled plot. The right side is the real defence; a
  decorative fence closes the camp's left side and runs along the top and
  bottom of the field to the outermost column (x 1,040). It has no HP, no
  slot and takes no click, and fights never draw it. Every empty slot the
  core lets you build shows a dashed ghost with a "+": a segment slot (wall
  or gate; the menu offers a gate only while the layer has none), a free
  wall-walk spot on a built segment (a small ring with a "+" on the wall's
  top), a free tower or ground post and an empty trap cell. A column with no
  segment yet also shows a ghost line. A tower or ground-post slot whose
  layer has no wall yet gets no "+": a dimmed outline, with "Needs a wall in
  front" once on its column (a plate between the tower and ground-post
  lines) and on the slot itself while hovered, so 40 copies never bury the
  slots that can be built. This follows the core's rule (`buildPost`), not
  the ticket's "on its row" wording: one segment anywhere in a layer lets
  every row's posts be built, so a row with no wall of its own still gets a
  "+", because showing the reason there would contradict what a click allows. Each
  built segment has a tier badge in front of it (W, M, C, R on the tier's
  colour); a damaged segment or trap shows a bar, and a broken segment, a
  jammed turret or a broken trap a red cross (a turret's condition bar
  always shows). Hovering a slot or plot outlines it and shows a pointer (a
  free wall-walk spot rings just that spot); a click opens it in the panel
  as before, a spot opening its segment's menu.
- **As built (ID-068): the horde-only map.** A horde-only fight has one
  concrete wall (column 0) and nothing else: no towers, turrets, ground or
  wall-walk posts, and no traps, whatever the saved base holds. The squad
  stands on a **firing line**: one row of 6 fixed slots on the ground 30
  units behind the wall (x 470), spaced evenly top to bottom (each in the
  middle of its sixth of the wall: y ≈ 67, 200, 333, 467, 600, 733). A slot
  exists only in the fight (a `line` post), never in the base or a save.
  Enemies spawn at x 1,540 instead of the field's 1,600, so they walk about
  1,020 units to the wall instead of 1,080; the full game keeps its field.

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
- **Game speed:** 1×, 2×, 3×; Space pauses.
  - **As built (ID-062):** three speed buttons sit in the fight's top bar,
    left of the Menu button, keys A, S and D (clear of the card keys 1 2 3
    and the action bar's). The choice is kept between hordes in this browser
    under its own key, outside the save and the backup code, and read back
    through an allow-list (anything but 1, 2 or 3 is 1×). A, S and D are
    taken, so any keyboard camera control that ever comes uses the arrows,
    not WASD.
  - Space holds the fight, with the menu's "Paused" chip in the top bar,
    tagged with the Space key.
    Opening and closing the menu leaves a Space pause on. Each fight starts
    unpaused. A typing field or a list keeps Space, and so does the result
    screen.
  - Speed runs more of the core's fixed 1/30 s steps per frame, never
    longer ones, so a seed plays out the same at every speed (a test plays
    Horde 1 at all three). A frame still covers at most 0.1 s, so 3× runs at
    most 9 steps in a stalled frame: the fight slows, nothing is skipped.
    About 1 ms of sim a frame at 3× with 300 enemies, so no lower cap was
    needed.
  - Picks and replacements stop the frame's remaining steps whatever the
    speed, and stack with a Space pause: resuming never skips an offer.
    Animations and effects run on fight time, so they speed up and freeze
    with it.
- **Start:** the commander's equipped perks are on (§5) and **1 defender**
  takes a post; the player picks which available defender and which post.
  Turrets and traps are whatever was built before the horde (§7); nothing
  is built mid-fight.
- **Defender HP and injury:** defenders have HP: 100 plus Instinct's
  bonus (§6 Stats), and Instinct's armour and injury dodge soften hits
  *(designer's call, starting point)*. Every recovered defender starts a
  horde at full HP and doesn't regain HP mid-horde. They are hit by ranged
  enemies (Spewers) and by enemies that broke into the camp. At 0 HP a
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
  stats and weapon. Defenders out on patrol, crafting or injured
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
- **As built (ID-041, PM decision): skills thrown across the field.** Only
  the **Airstrike** is aimed, and at a row: it carpet bombs that row from the
  outermost wall's front to the field's end, a bomb (radius 60, 40 damage)
  landing every 0.1 s, 2 × radius apart (about 9 bombs). The **Molotov** and
  the **Flashbang** go off as soon as their button is pressed: the Molotov
  throws 5 bottles, one every 0.15 s, each a fire of radius 50 burning
  5 damage/s for 6 s; the Flashbang throws 4, one every 0.15 s, each
  stunning within radius 100 for 3 s. Each lands at a spot from the fight's
  seeded randomness, past the outermost wall and inside the field. Costs and
  cooldowns are as before. Bombs and bottles in the air wait out picks like
  everything on fight time, and are dropped when the fight ends.
- **Reward on success:** mostly **defender XP**, **camp XP** (§11 Camp
  level) and **Mutated Genes**, plus a small chance of materials or a weapon. Higher horde numbers pay more.
  Defender XP goes in full to every defender who took part, injured or
  not, so a recruit never dilutes it *(designer's call)*. Defenders left on the bench get no horde XP; patrols are their other way to level (§10).

- **As built (ID-066): the horde-only fight.**
  - The whole squad starts on the wall, each on a tower in join order from
    the middle out (rows 5, 7, 3, 9, 1, 10), a row apart so each one stands
    clear of the tower behind (ten rows hold only five such towers, so the
    sixth is next to the fifth's). Nobody waits on the bench, so no
    recruit cards or replacements come.
  - Horde cash and the shop row are hidden: kills pay no cash and no skill
    is researched.
  - **As built (ID-100): skills.** Before every horde the start or result
    screen picks up to 2 of Flashbang, Molotov and Airstrike
    (`SQUAD_SKILLS.max`); the last pick is saved and pre-selected. A new
    game (and an older save) starts with Flashbang and Molotov picked
    (`START_SKILLS`, neither needs aiming), so a player who skips the pick
    still fights with skills. No cash, so they run on cooldown only, on fight time.
    One picked alone works ×2 (`SQUAD_SKILLS.solo`) with the same cooldown:
    a Flashbang throws 8 bursts instead of 4, a Molotov's fires burn at
    2× DPS, an Airstrike's bombs hit for 2× damage. The picked skills sit in
    the fight's bottom row, left to right in Flashbang, Molotov, Airstrike
    order, on keys Q and W (by key position, so any layout works); each
    pulses once when it is ready again, and arming Airstrike says on
    screen to tap a row. The pick cards always say what each skill does;
    the one picked alone adds its ×2 line. The balance pass (ID-102) kept
    their numbers; its scripted player picks and uses Flashbang and Molotov.
  - Steady Fire is the one perk, always on at level 1; no perk screen.
  - The top bar is minimal: the horde number, waves cleared and enemies left
    in the wave (on the field and still to come), with the speed buttons; the
    fight XP bar (its level and XP to the next) sits under it on the left.
  - Enemy HP grows ×1.20 per horde up to Horde 6 (the squad grows by a
    survivor a win until then), then ×1.06 (×1.03 before ID-099),
    instead of ×1.17 (§9). Hordes
    1–3 are eased to ×0.8, ×0.9 and ×0.95 of that (ID-097,
    `SQUAD_EARLY_HP`), so the first hordes are sure wins while the player
    learns the cards; Hordes 8, 9 and 10 to ×0.85, ×0.75 and ×0.75 (ID-102:
    Brutes join at 8, the first boss comes at 10), so the expected squad wins
    them at the first try on most seeds. Waves stop growing ×1.1 a horde at
    Horde 10 (ID-102, §11 Balance pass).
- **As built (ID-068): shooting from behind the wall.**
  - Survivors take the firing line's slots (§3) in the order they joined,
    from the middle out: slots 3, 4, 2, 5, 1, 6 (top to bottom), so a lone
    survivor stands near the middle and the last two hold the ends. The
    rest of the line stays empty. The slots are fixed: nobody moves onto or
    off one ("Survivors hold their slots"), an empty slot takes no click (a
    click there is on the ground), and picking a survivor names them without
    "click a post to move". No melee is used from the line.
  - They shoot over the wall: the wall never blocks a shot, and a slot
    keeps a tower's gun range (×1.25). The starting pistol (500) reaches an
    enemy pressed against any part of the wall's front from the first slot,
    and with the line full every gun there is reaches every point of it from
    some slot (tests). Enemies in the camp still come for the nearest
    survivor, as before.
  - The balance tests passed unchanged (the squad stands 50 units nearer
    the wall than the towers did, and the spawn edge is 60 nearer).

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

- **As built (ID-020, starting points):** a new game has 1 perk slot with
  Steady Fire unlocked and equipped. Every other perk and slots 2–4 are
  research nodes at the Research Lab, paid in materials until Mutated Genes
  come (ID-035): Scavenger's Eye (Lab 1, 30 Scrap, 30 Wood), Fortify (Lab 1,
  40/40), Butcher's Hunger (Lab 1, 30/30), Rally Call (Lab 1, 30/20), Second
  Look (Lab 2, 60/40), Overclock and Power Saver (Lab 2, after Auto-turret,
  60/40 each); Perk slot 2 (Lab 1, 50/50), 3 (Lab 2, 80/80, after slot 2)
  and 4 (Lab 2, 120/120, after slot 3). Perks are equipped between hordes
  only, each once, and are copied into the fight. Effects: **Steady Fire**
  guns (not blades, tools or turrets) ×1.15 fire rate; **Scavenger's Eye**
  kill cash ×1.25 (fractions kept, whole cash shown); **Fortify** every
  segment ×1.3 HP and max HP for the fight, and the base keeps the same
  share of its own max afterwards; **Butcher's Hunger** each blade or tool
  kill heals the damaged standing segment nearest the
  defender 3 HP, up to max; **Rally Call** recruit chance ×2, still one
  recruit per offer at most; **Second Look** one seeded reroll of the open
  offer per wave; **Overclock** turret damage ×1.2 and draw ×1.1; **Power
  Saver** turret draw ×0.75 (with Overclock, ×0.825). All stack
  multiplicatively with cards, shop buffs and Engineers. Perk levels and
  boss-horde unlocks come with ID-035. To absorb the starting Steady Fire,
  enemy HP now grows × 1.17 per horde (was × 1.15; §9).
- **As built (ID-021):** the build panel has a **Perks** button next to
  Roster that opens the perk loadout in its place: "Perk slots: N of 4",
  each slot with its perk and Unequip, Empty, or (not owned yet) the
  research that adds it; then all eight perks with their effect and
  Equip, Equipped, or where to research them (Lab level, cost and the node
  needed first). Equip is refused with the core's reason when every slot is
  full; swapping is Unequip, then Equip. Changes are saved at once.
- **As built (ID-035, starting points):** perks are owned through their
  research node (now paid in Mutated Genes, §11) or a **boss horde**: each
  boss horde won also unlocks one perk not owned yet, rolled from where
  the fight's RNG ended on a stream of its own (the weapon drop and find
  don't move); a perk node already in the research queue is refunded. Once every
  perk is owned, a boss win pays +10 Genes instead. The result screen names
  the reward. **Perk levels:** each owned perk goes from level 1 to 3 in the
  research queue (level 2: 75 Genes, 1 h; level 3: 250 Genes, 2 h); each
  level adds half the perk's level-1 bonus (×1, ×1.5, ×2 of it): Steady
  Fire +15/22.5/30% fire rate, Scavenger's Eye +25/37.5/50% cash, Fortify
  +30/45/60% HP, Butcher's Hunger 3/4.5/6 HP, Rally Call ×2/2.5/3,
  Overclock +20/30/40% damage (its +10% draw stays), Power Saver
  −25/37.5/50% draw. **Second Look** gives 1 reroll a wave at level 1,
  1 and 2 in turn at level 2, and 2 at level 3. The Perks view shows each
  perk's level and an Upgrade button that queues the next level.

## 6. Defenders, weapons and professions

Defenders are a **permanent roster**: levels, stats, titles and gear stay.
**No fixed class:** any defender can use any weapon, and the equipped
loadout decides which profession they are working as.

- **As built (ID-066): no professions in the horde-only build.** Survivors
  are plain: no profession, so no Gunner fire rate, reload, crit or spread,
  no Ripper melee or shield, no Engineer repair or buff, no titles, title
  bonuses or badges, and no off-profession penalty. A survivor fights with
  their primary gun only (the pistol if they have none) and their §6 stats
  (Instinct, Agility, Sharp Mind; Tinker is locked). The roster keeps each
  loadout as it was.

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
  better (+5% crit chance, on top of Sharp Mind). A non-Gunner firing a
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
  | LMG | 6.5 | 0.22 s | 500 | 80 | 5 s | 2,000 | ±4° | 1 | 0 |
  | Sniper rifle | 22 | 2 s | 1,100 | 5 | 3.5 s | 3,000 | ±0.5° | 1 | 1 |

  Balance (a lone Common-gun Gunner on the upper tower against 20-HP Shamblers
  held in place; kills, mean of the seeds; `balance/guns.test.ts`):

  | Gun | Close crowd, 20 s | Far (530–830 px), 20 s | Lane, 20 s | Sustained, 60 s | Horde 4 wins (Bob's gun + pistol) |
  |---|---|---|---|---|---|
  | Pistol | 8.3 | 8.0 | 8.3 | 27.8 | 5% |
  | SMG | 23.0 | 0 | 15.8 | 59.2 | 100% |
  | Rifle | 17.4 | 17.0 | 17.0 | 52.2 | 95% |
  | Shotgun | **25.2** | 0 | 11.6 | 48.4 | 95% |
  | LMG | 21.4 | 11.7 | 20.0 | **64.6** | 100% |
  | Sniper rifle | 21.0 | **21.0** | **21.0** | 63.0 | 75% |

  (With the gun traits, ID-101; on main before them the SMG was 22.6 close and
  the Rifle 16.5 / 16.4 / 16.4 / 50.2. The rest held still: the enemies stand
  still here, so stagger and slow change nothing.)

  Each beats the pistol in its role at least twice over (the rifle, the
  all-rounder, 1.5× everywhere); the shotgun leads up close, the sniper far and
  in a lane, the LMG in sustained fire; no gun leads more than two, the rifle
  none, and the SMG and shotgun can't reach far. One specialised gun lifts
  Horde 4 from about 5% to 75–100% won, but Horde 6 stays at most a quarter won
  with any of them (the curve still needs the camp to grow).
  Retune (ID-097): the LMG was damage 6 and a 60-round magazine. With the
  repeatable cards adding instead of compounding, one Sharpshooter no longer
  lifted its 6 to 7.2 (3 hits on a 20-HP Shambler instead of 4), and the
  sniper out-shot it in sustained fire (63 to 56). At 6.5 and 80 rounds it
  leads sustained fire again (64.6 to the sniper's 63) without leading up
  close (21.4 to the shotgun's 25.2) or in a lane (20.0 to 21.0). The scenes
  now pick only the repeatable stat cards, as written above (they took Speed
  Loaders and Extended Mags too).
- **Gun roles (as built, ID-101; kept by the balance pass, ID-102):**
  each gun has a role and a built-in trait every one of it carries, Rusty or
  Relic, plus role affixes only it rolls (below, in Gear). The Inventory, the
  drop tile and the gun picker name the role and trait ("Marksman: +10% crit
  chance"); the slot's screen-reader label and the picker's description read it.
  A picker option reads "30.3 dmg/s · Lv 4 Prototype LMG · Suppression (role +12%
  slow on hit)": the role right after the name, and in such a bracketed list a
  role affix is "role …"; listed one a line (Inventory, drop tile) it is "… (role)".
  dmg/s counts the gun's own crit (the Rifle's trait, crit and crit damage
  affixes), so ranking, stash-full discards and guaranteed upgrades see it; the
  situational effects (near-wall damage, stagger, slow, boss damage, cone) are
  not in dmg/s.

  | Gun | Role | Built-in trait | Role affixes |
  |---|---|---|---|
  | Pistol | Backup | Fastest reload of any gun (1.5 s, data) | +3–8% crit chance |
  | SMG | Swarm shredder | +25% damage to an enemy within 250 px of the wall's front (the outermost built layer's face; the player reads "near the wall") | +10–25% close-range damage, added to the 25% |
  | Rifle | Marksman | +10% crit chance | +3–8% crit chance, +20–50% crit damage (added to ×2) |
  | Shotgun | Wall stopper | Each pellet hit briefly stops the enemy: no moving for 0.15 s, never again until 0.6 s after the last one began, nor while it is stunned or paralysed | +20–40% wider cone, +1–2 pellets |
  | LMG | Suppression | A hit slows the enemy 20% for 1 s; a new hit renews the time with the larger slow, never stacking | +5–15% slow (capped at 35% in all), +40–80% magazine (its own range of the general magazine affix) |
  | Sniper rifle | Boss and heavy killer | Ignores armour (a Brute's, a Horror's, a boss's plates); each shot goes through 1 more enemy | +15–35% damage to bosses, mini-bosses and the heavy kinds (Brute, Swollen, Horror), +1–2 pierce (its own range of the general pierce affix) |

  Slow, stagger and Shock Rounds' paralysis stack (and multiply with Barbed
  Wire and traps, untested here), but stay small: a Shambler hit every step by a
  staggering pellet and a 35% slow, with Shock Rounds at max, still walks at
  about 30% of its pace (`roles.test.ts`). Squad Power counts the gun's crit (the Rifle's
  trait and crit affixes). An older save's guns keep their affixes (an LMG
  magazine roll below the new 40% still reads) and gain their trait, which
  comes from the base gun, not the save.

  Role scenes (`balance/guns.test.ts`, the lone Common-gun Gunner, 5 seeds;
  before → after the traits):

  | Gun | Boss with plates, 20 s (damage) | Six held Brutes, 20 s (damage) | Twelve walking Shamblers, mean x after 5 s |
  |---|---|---|---|
  | Pistol | 41 | 116 | 619.0 |
  | SMG | 96 → 112 | 196 → 310 | 619.0 |
  | Rifle | 79 → 92 | 207 → 232 | 619.0 |
  | Shotgun | 160 | 188 | 619.0 → **628.3** |
  | LMG | 116 | 313 | 619.0 → **623.3** |
  | Sniper rifle | 220 → **242** | 334 → **387** | 619.0 |

  The swarm guns (SMG, LMG, Shotgun) out-kill the others in a close crowd, the
  marksmen (Rifle, Sniper rifle) out-kill the swarm guns far, the Sniper rifle
  out-damages every gun by a fifth or more on a boss and on heavies (before,
  only 1.07× the LMG on heavies), and the Shotgun and LMG hold a walking crowd
  farther out than any other gun (a small margin from one Gunner; the balance
  pass, ID-102, kept these numbers).
- **Roster screen (as built, ID-012):** a Roster button on the build panel
  opens it in the panel's place: each defender's level and XP, stats
  (Tinker shown locked), unspent points (spent there) and rest time, and three pickers
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
  turret ±1°)*; a Gunner's is halved, and Sharp Mind narrows it further
  (§6 Stats). The angle is rolled through the seeded RNG, so a run stays
  deterministic.
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

Each defender level gives **1 stat point** (ID-096; 3 before it), from a
horde or a patrol alike, so every point is a choice:

Four stats, each with one clear role, each working with any weapon and any
loadout (ID-084):

| Stat | Now | Later (when the game expands) |
|---|---|---|
| **Instinct** | + max HP, + armour (flat damage off each hit taken), − chance of injury | + patrol survival |
| **Agility** | + reload speed | + move speed |
| **Sharp Mind** | + gun accuracy (narrower cone), + crit chance and + crit damage on every hit, gun shot or blade or tool strike | — |
| **Tinker** | **Locked:** its button greyed out, "Tinker (locked)", and "unlocks later" in the stats line and hint; no points can go in | + repair rate, + turret damage, + battery quality, + crafting |

- Defender XP comes from hordes and from patrols (§10); both are full sources, so a defender can level by patrolling alone.
- No stat respec in v1: points are permanent (loadout swaps are free).
- Level L → L+1 costs 25 × L defender XP (ID-011), so a defender in every
  win reaches level 2 after Horde 2 and level 3 after Horde 4. Points are
  spent on the result screen after a win (or on the roster); unspent points
  carry over.
- **A point is split across its stat's active effects, and every bonus
  shrinks as points pile up** *(starting points, ID-084, ID-096)*: with P
  points in a stat that drives n **active** effects (the ones that work in
  the build), each effect with cap C gives **C × P / (P + 10 × n)**. A stat
  with one effect reaches half its cap at 10 points, one with three at 30;
  no number of points reaches the cap, so stacking one stat can't break a
  fight. Before the split, 1 new point is worth 2 old ones (ID-084's
  C × P / (P + 20)).
- **Active effects today** (`STAT_ACTIVE` in the core, the one place they
  are listed): Instinct 3 (max HP, armour, injury dodge), Agility 1
  (reload; move speed is planned, not built), Sharp Mind 3 (crit chance,
  crit damage, spread), Tinker none (locked).
- **An effect built later joins its stat's split:** listed in
  `STAT_ACTIVE`, its stat's n goes up by 1, and every point already spent
  in that stat is shared across the new set, so the existing effects'
  bonuses go down. The ticket that builds it notes the change on the
  survivor's stats. A planned effect gets no share and isn't shown as a
  bonus until then.
- The survivor card shows each active effect now and with the next point
  ("Max HP 100 → 103"); each + button's hint, on the result screen and the
  roster, says what the next point adds to each ("Next point: +3 max HP ·
  +0.13 armour · +1.0% survive").

  | Bonus | Cap | n | 1 point | 3 points | 5 points | 10 points |
  |---|---|---|---|---|---|---|
  | Instinct: max HP (over the base 100, rounded to whole HP) | +100 | 3 | +3 | +9 | +14 | +25 |
  | Instinct: armour (flat off each hit; a hit keeps at least half its damage) | 4 | 3 | 0.13 | 0.36 | 0.57 | 1 |
  | Instinct: injury dodge (a hit that would drop them to 0 HP leaves them at 1 HP instead) | 30% | 3 | 1.0% | 2.7% | 4.3% | 7.5% |
  | Agility: reload time | −50% | 1 | −4.5% | −11.5% | −16.7% | −25% |
  | Sharp Mind: spread | −50% | 3 | −1.6% | −4.5% | −7.1% | −12.5% |
  | Sharp Mind: crit chance (added to the Gunner's +5% on gun shots; +35% before ID-096) | +50% | 3 | +1.6% | +4.5% | +7.1% | +12.5% |
  | Sharp Mind: crit damage (over the base ×2) | +×2 | 3 | +×0.06 | +×0.18 | +×0.29 | +×0.5 |

- **Hold to add (ID-096):** a click or tap on a + stat button adds 1 point;
  held past 400 ms it adds 1 more every 333 ms (about 3 a second) until
  release, the pointer or finger sliding off, a scroll, no points left or
  the screen closing. Holding Enter or Space does the same. A long press
  opens no touch menu and selects no text; the locked Tinker button ignores
  it. On the result screen's survivor cards and on the roster.
- **Old saves (v13 and older, ID-096):** the levels they reached gave 3
  points each, so each defender and survivor waiting to join **banks** the
  2 a level more than today's 1 (`banked`, kept from then on): no point
  earned before, spent or not, is lost, and each new level gives 1.

- **Balance (ID-096):** with 1 point a level the squad grows more slowly
  and late hordes push to the wire and the wall again. The horde-only
  scripted player now also equips the stash's strongest guns after each win
  (`gearUp`), as a player does; without that, no stat tuning can say how a
  real squad fares late. Measured over 10 seeds to Horde 22, first try at
  each horde (enemies reaching the Barbed Wire band, 400 px from the wall,
  in every fight on both):

  | | Wins per horde | Wall hit, Hordes 8–22 | Nearest enemy, median of medians |
  |---|---|---|---|
  | Main (3 points a level) | 10/10 | 0–2 of 10 | about 170 px |
  | ID-096 (1 point a level, as built) | 8–10 of 10 | 1–5 of 10 | about 60 px |

  Survivors are level 12-ish at Hordes 18–19; a balance test plays 4 seeds
  to Horde 18 and checks enemies reach the wire band in every fight from
  Horde 15 and hit the wall in some. The horde-only enemy HP growth (×1.20
  then ×1.03) stays as it was: this hits the target (enemies regularly reach
  the wire and sometimes the wall from mid-game) without restoring the old
  survivor power.

  The full game's targets were grid-tuned (each row: Horde 10 firing line
  wins against the brood / charge / regen Horror of 20 seeds; Horde a
  campaign without building reaches, 10 seeds; target ≥1 win each and 4–5):

  | | Brood | Charge | Regen | Campaign reaches |
  |---|---|---|---|---|
  | Main (3 points a level) | 4 | 20 | 19 | 5 on every seed |
  | 1 point a level, nothing retuned | 0 | 19 | 4 | 5, one seed 6 |
  | + crit cap 0.35 → 0.5, Broodmother every 25 s → 35 s (built) | 4 | 19 | 8 | 5 on every seed |

  What didn't work: Sharp Mind caps alone (crit 0.5–0.7, crit damage
  +×3–4) never beat the brood; full-game HP growth ×1.15 beat the brood
  (2 of 20) but let a full firing line on the bare wall win too much at
  Hordes 5–7 (45% at Horde 5, the target is at most 25%); ×1.16 still lost
  every brood fight. Every Broodmother 30 s: 0 wins; 40 s: 14.
- **Balance (ID-084):** the scripted player puts every point into the stat
  that suits the job: Sharp Mind, the damage stat, for a Gunner or a Ripper
  (and every horde-only survivor), Agility for an Engineer. With these
  numbers the horde-only squad wins Hordes 8, 9 and 10 at the first try on
  95%, 70% and 65% of seeds (80%, 80% and 85% with Aim before; the target
  is 60%); a campaign without building still stalls at Horde 5 on every
  seed; and a Horde 10 firing line beats the brood Horror on 4 seeds of 20.
  Spreading points evenly is weaker (40–80% at Hordes 8–10 in a test run),
  and Instinct for the Ripper leaves the brood Horror unbeaten: without
  a cleave stat, the crowd at the wall needs damage.

- The injury dodge is rolled through the horde's seeded RNG, only for a
  survivor with Instinct above 1 HP, so a run stays deterministic and a
  survivor already at 1 HP gets no second save from the next hit.
- **Tinker** stays locked until repair, turrets or crafting expand: its row
  is visible so players know it's coming, and repair runs at its base rate.
  A save edited to put points in Tinker loads with those points refunded.
- **Old saves (v12 and older):** every spent point is refunded as unspent
  points, with a one-time note on load. A patrol out keeps a strength no
  higher than its party's today.
- Patrol strength (§10) counts level and weapon only; Instinct's patrol
  survival comes later.

### Profession titles

Parked (ID-084): titles stopped coming from stat points and are hidden
until a later redesign; no name tags ("Bob the Gunner"), badges, title
bonuses or the Master Gunner burn synergy (§8) for now. Before ID-084 a
title came from points in a profession's stat (Junior at 10, Adept at 25,
Master at 50, Legendary at 100, +5% / +15% / +30% / +50% to that
profession's output).

### Gear

- Weapons come from patrols (main source), boss hordes and crafting.
- **Rarity:** Rusty, Common, Military, Prototype, Relic, with rolled
  affixes (e.g. +pierce, incendiary rounds, +damage vs. mutants).
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
  next it crosses within 200 px; §6 Ballistics), +10–25% repair (tools); and
  each gun's role affixes, only it rolling them (ID-101, §6 Specialised guns:
  Gun roles), marked "(role)" wherever affixes are listed. A horde win
  drops a weapon with chance 10% + 1% per horde number, capped at 30%: an
  even pick of base weapon, rarity Rusty 30 / Common 45 / Military 20 /
  Prototype 5 (Relic never from a horde). The result screen names it with one
  line per affix. The camp owns at most 30 weapons (armoury and hands
  together); a drop past that is salvaged for Scrap (Rusty 5, Common 10,
  Military 25, Prototype 50, Relic 100). Incendiary rounds and +damage vs.
  mutants wait for burning effects and mutants. Manual salvage is a follow-up.
- **As built (ID-067): weapon drops, stash and equip in the horde-only build.**
  Better guns are how the squad gets stronger.
  - **Drop:** every horde won drops one specialised gun (SMG, rifle,
    shotgun, LMG or sniper rifle, picked evenly). Never the pistol, which
    every survivor has free, and never a blade or tool, which a survivor
    doesn't use. Its
    rarity comes from the horde's band *(starting points)*:

    | Hordes | Rusty | Common | Military | Prototype | Relic |
    |---|---|---|---|---|---|
    | 1–3 | 50 | 50 | – | – | – |
    | 4–6 | 25 | 45 | 25 | 5 | – |
    | 7–9 | 10 | 35 | 35 | 15 | 5 |
    | 10+ | – | 25 | 40 | 25 | 10 |

    Affixes roll as above. Duplicates are allowed. The drop is rolled from the
    horde's seed on a stream of its own, so the same seed drops the same gun at
    1×, 2× and 3× and however the fight went. Nothing drops after a loss.
  - **Stash:** the camp's armoury, shown as the stash. It holds 20 weapons.
    With 20 in it, the weakest of the stash and the drop is thrown away (it may
    be the drop itself); a tie throws away the later one. "Weakest" is the
    lowest damage per second through a magazine and its reload (pellets,
    rarity and affixes counted), the dmg/s figure the pickers show. An older
    save's armoury past 20 is kept as it is and never grows.
  - **Equip:** between hordes, on the start and result screens, each survivor
    in the squad has a one-click gun picker (a select; the pick applies and
    saves at once). It lists the free pistol, the stash's guns and the gun
    they hold, strongest first, each led by its dmg/s ("30.3 dmg/s ·
    Prototype LMG (+12% damage, +21% magazine)") so a closed select never
    cuts the number off; the full label shows on hover. The gun they had goes to
    the stash; the pistol is free and unlimited, so it just goes, and taking
    the pistol is refused while the stash is full. Every survivor starts with
    a pistol. The role (pistol, rifle, shotgun…) is the gun's: survivors have
    no profession, so the same survivor fights as whatever they hold. Their
    secondary and item stay as they were.
  - **Combine (as built, ID-091) *(starting points)*:** between hordes, 3
    stash guns of the same base weapon and the same rarity make 1 gun of that
    base weapon at the next rarity: Rusty → Common → Military → Prototype →
    Relic. Relic combines no further. Only stash guns count: a survivor's gun
    goes back to the stash first, and the free pistol never combines. The new
    gun rolls its rarity's affixes as a drop does, seeded from the three
    inputs alone, so the same save and picks give the same gun; the inputs
    are used up (it keeps the first input's id, so saves need no change, and
    save version 13 is unchanged). 3 in and 1 out, so a full stash never
    refuses it. Free for now; a Scrap cost per combine (e.g. the inputs'
    salvage value) is a tuning option if Relics come too easily. Expected
    cost: 3 Rusty make a Common, 9 a Military, 27 a Prototype, 81 a Relic,
    so above Military it is a slow route next to drops. Kept out for now:
    keeping one input's affixes, and mixed base weapons (any 3 Rusty guns →
    a random Common one).
  - **Combine in the Inventory** *(in a gun's details since ID-092)*: a stash
    gun's details name its set (its base weapon and rarity, below Relic): a set
    with 3 or more says "4 in stash" and "3 make a Common SMG", with a Combine
    button, and its slots carry a ▲ mark in the grid; one short says "2/3" and
    "1 more for a Common SMG". A Relic says it combines no further, and a gun in
    hand that it must go back to the stash first. A combine uses
    the 3 weakest of the set by dmg/s, so the best one stays. Combine asks
    first: it lists the 3 guns used up (rarity colour, affixes, dmg/s) and what
    comes out (rarity, "No affixes" or "1 random affix, rolled on combine", and its
    base dmg/s, before affixes), with Combine into … and Cancel (Esc cancels; focus
    starts on Cancel). After it, a status line names the new gun with its
    affixes and dmg/s ("Made: Common SMG, 14.2 dmg/s"), and the gun pickers
    update, and the new gun is selected; focus moves to that line (Cancel
    returns it to the Combine button). The result screen's drop tile stays a
    record of the win (its stash count then), so a combine on that screen
    doesn't change it. In a fight the set's count shows with no button or ▲
    marks, and "Combine between hordes, on the start or result screen."
  - **The panel between hordes (a debrief):** the start, win and loss
    screens share one layout, 640 px wide, scrolling inside the window with
    the button pinned in a footer. At the top are the title and chips (waves,
    squad size, boss, "No XP on a loss", "No weapon drop on a loss"). A win
    then shows two tiles side by side: the weapon drop (rarity in its colour —
    Rusty copper, Common grey, Military blue, Prototype purple, Relic gold —
    a 56 px icon framed in that colour, the gun, its affixes, its dmg/s, the
    stash count, and any weapon thrown away) and the survivor joining (or
    "6/6 full"). *(ID-092)* The icon is the gun's own icon, as the
    Inventory's slots show it (the model the survivors hold, on its rarity's
    tint), decorative (empty alt text). When the full stash throws the drop itself away, the tile
    says "Stash full: thrown away" and "No better than any gun in the stash",
    and its icon goes grey. A loss shows a red callout saying where they got
    in. Below that is one card per survivor: name and level, on a win the XP
    it gave with a bar and a "Level up" badge, their gun select (bordered in
    the gun's rarity), and on a win their stat points with + Instinct /
    + Agility / + Sharp Mind buttons and a greyed-out Tinker (ID-084). The loss screen keeps the cards, so guns can change before the
    retry. The footer says why points can wait, or how a horde is lost.

## 7. Turrets, energy and traps

### Turrets

- **Built before a horde** with materials, in build mode between hordes;
  they stay between hordes. A turret is jammed (condition 0), never
  destroyed, so a loss can't delete your build *(designer's call)*. They
  can't be built or bought during a horde.
- Fire automatically from mounts on walls and towers; an adjacent Engineer
  adds damage and fire rate (Tinker will scale it once unlocked, §6).
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
  gives +15% damage and fire rate (not stacked; Tinker scales it later)
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
    running while the game is closed. Tinker (§6, locked for now) will
    give faster crafting and better batteries (more charge).
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

Every card is grounded gear or tactics a group of survivors with guns could
really use (ammo, scavenged kit, barricade work): no magic or energy effects.
Incendiary Rounds and Shock Rounds are real-world special ammunition
(incendiary and electroshock rounds), not magic. Every card changes the fight visibly within a wave of picking it, at the
spacing real hordes have (see the ID-077 note below).

- **Stat cards:** +damage, +fire rate, +range, bigger magazines, faster
  reloads.
- **Behaviour cards:** pierce, ricochet, incendiary rounds, shock rounds,
  concussion rounds, frag grenades.
- **Barrier cards:** +layer HP, repairs, barbed wire out
  in the field.
- **Power cards:** refill some battery charge, turrets free to run for one
  wave.
- **Synergies:** some cards upgrade when paired (e.g. ricochet + piercing
  rounds).
- **Rarity:** common / rare / epic; rarer offers more often in later waves.
- **As built (ID-022, card set reworked by ID-077, levels ID-097):** stat
  cards stay squad-wide (per-profession stat cards come later). The squad's
  gun cards act on the squad's guns and bullets only (turrets never).
  **Levels (ID-097):** each card below has levels 1, 2 and 3 (max). The
  first pick gives level 1, each later pick raises it by 1, and at max it
  leaves the pool for the rest of the horde. An upgrade keeps the card's own
  rules (Extended Mags from each gun's next reload, Barbed Wire's working
  rows gain the level's extra durability and broken ones stay broken).
  Levels last the horde, like every card.

  | Card | Kind | Rarity | Lv 1 | Lv 2 | Lv 3 (max) |
  |---|---|---|---|---|---|
  | Speed Loaders | stat | common | Every squad gun reloads in **90%** of the time | 80% | 70% |
  | Extended Mags | stat | rare | Every squad gun's magazine holds **×1.33** the rounds (rounded), from its next reload (a survivor who joins mid-fight, too: they come with a standard magazine loaded) | ×1.67 | ×2 |
  | Piercing Rounds | behaviour | rare | Each squad shot has a **35%** chance of +1 pierce, rolled on the fight's seeded RNG as it's fired (every pellet of a shot alike) | 70% | always +1 pierce (no roll) |
  | Ricochet | behaviour | rare | A bullet's first hit bounces one new bullet to the nearest other enemy within 150 px, at **10%** damage; a bounce never bounces | 18% | 25% |
  | Incendiary Rounds | behaviour | rare | The enemy hit burns **1** dmg/s for 3 s; a new hit resets it at the new hit's rate, never stacks | 2 dmg/s | 3 dmg/s |
  | Shock Rounds | behaviour | rare | A squad bullet hit paralyses the enemy for **0.2 s** (half for a Brute, Swollen or Horror): it stops moving and attacking, then carries on. No damage. A hit during a paralysis doesn't extend it, and after a paralysis ends the enemy can't be paralysed again for **1 s** | 0.3 s | 0.4 s |
  | Barbed Wire | barrier | rare | Coils strung across the field in the band **250–400 px** in front of the outermost layer, where most kills happen; enemies inside move **15%** slower; each row has **10** durability (more below) | 25%; 20 durability | 35%; 30 durability |

  **Epic cards are unique:** one level, which is max, taken once per horde.

  | Card | Kind | Rarity | Effect |
  |---|---|---|---|
  | Concussion Rounds | behaviour | epic | A squad bullet hit that leaves its enemy standing knocks it back **0.5 px per point of damage** dealt (after armour; about 3 px a pistol hit); half that for a Brute, Swollen or Horror. Never a Crawler on the wall, an enemy inside the camp, or past the spawn edge. After a push the enemy can't be pushed again for **0.5 s** (hits in that window still deal their damage), so steady fire pushes it at most twice a second |
  | Frag Grenades | behaviour | epic | Every survivor on the line carries grenades: the squad throws one every **8 s ÷ the survivors on the line** (8 s alone, 1.3 s with six), as soon as an enemy outside the camp is within **600 px** of a survivor on the line. The target is the enemy with the most others within **70 px** (ties → nearest the wall, then lowest id), thrown by the survivor nearest it and aimed where it will be when the grenade lands **0.6 s** later. It bursts for **20** flat damage (armour doesn't reduce it) on every enemy within 70 px. The first throw comes as soon as the card is picked |

  Field Repairs (a campaign research card) stays epic and unique, and
  Heavy Rounds (research) stays once per horde with no levels.

  **One ammo slot (ID-097):** the squad holds at most one of Incendiary
  Rounds and Shock Rounds; both stay in the pool all horde. Picking the one
  held levels it up; picking the other replaces it: the new card starts at
  level 1 and the old card and its levels are gone (it can come back in a
  later offer and replace the new one the same way, even when the held one
  is at max). New hits use the new card from the next shot; burns and
  paralyses already on enemies run out as they were.

  **Repeatable cards (uncapped):** Sharpshooter (**+10%** damage a pick),
  Rapid Fire (**+8%** fire rate), Long Sight (**+6%** range) and Reinforce
  (**+10%** of each segment's max HP at the start of the horde; the segment
  gains the same HP) are common and can be picked any number of times. The
  steps add (five Sharpshooters are +50%), then multiply once with other
  sources (Heavy Rounds, shop buffs, perks). They were ×1.2, ×1.15, ×1.15
  and +25% of the current max each, compounding (ID-022): five Sharpshooters
  were ×2.49.

  **Barbed Wire** (ID-077):
  enemies in its band move slower by its level's share, multiplying with razor wire traps and
  Screamers. Enemies wear it down (ID-090): the band is 10 rows, one per
  wall segment. Each row's durability goes with the card's level (ID-104,
  `CARD.wire.durability`): **10** at level 1, **20** at level 2, **30** at
  level 3. Picking the card again adds 10 to each working row's durability
  and max; a broken row stays broken. Every horde starts the rows whole.
  Each enemy that enters a working row's band takes its kind's wear off that
  row (`CARD.wire.wear`), only once per row and never below 0: **1** for a
  Shambler, Runner, Crawler, Spewer or Screamer, **3** for a Swollen, **4**
  for a Brute and **10** for the Horror (a level 1 row on its own). A row at
  0 is broken for the rest of the horde: it slows no one, the enemy that
  broke it included, while the other rows still slow. (It was 30 at every
  level and 1 for every kind, ID-090.)

  Measured (ID-104), horde-only campaigns as the scripted squad plays them,
  10 seeds, with Barbed Wire picked at the start of each first try at Hordes
  4–10: the share of the fight its rows were working (time-weighted), before
  (30 at every level, 1 per enemy) → after.

  | Horde | Lv 1 | Lv 3 (max) |
  |---|---|---|
  | 4 | 100% → 91% | 100% → 100% |
  | 5 | 100% → 73% | 100% → 100% |
  | 6 | 100% → 71% | 100% → 100% |
  | 7 | 99% → 56% | 98% → 95% |
  | 8 | 96% → 36% | 99% → 77% |
  | 9 | 91% → 35% | 92% → 74% |
  | 10 | 84% → 31% | 81% → 63% |

  Level 2 after: 100%, 99%, 96%, 79%, 63%, 57%, 48%. So the wire holds
  most of each mid-game horde (4–7) at every level and is worth levelling
  for the walls from Horde 8; the starting wear values needed no retune.
  In the Horde 4 card test (three survivors, wins of 20) levels 1, 2 and 3
  win 11, 11 and 12 (were 9, 11, 12) and kill a mean 158.5, 162.5 and
  173.4 px out (were 163.1, 162.5, 173.4; no card 156.1). The horde-only
  and Horror balance tests pass before and after.

  **Patch Up** (common, repeatable, uncapped)
  repairs every built segment by 30% of its max HP, a broken one included. It's
  offered only while some built segment is below its max HP (broken
  counts): with the whole wall at full HP that slot rolls another card, and
  the four other repeatable commons still keep a slot from coming up empty.
  Its card shows what it would restore ("Repairs 140 HP across 3 segments").
  Spiked Walls (3 damage to an enemy per blow on the wall) is gone (ID-097):
  enemies rarely reached the wall, so it almost never did anything; Shock
  Rounds takes its place. Power
  (repeatable, offered only when the base has a turret, since the bank
  exists from the start): Recharge (common) adds 25% of the bank cap,
  capped; **Power Surge** (rare; named so it doesn't clash with the shop's
  Overdrive buff) runs turrets with no draw, and lit on an empty bank, until
  the current wave ends (picked on a wave's last kill, the break has begun,
  so it covers the next wave). Each offer slot rolls a rarity from the wave:
  common 70 − 4(w − 1)% (min 40), rare 25 + 3(w − 1)% (max 45), epic
  5 + (w − 1)% (max 15), taken in proportion (from wave 8 they sum to 99);
  none of that rarity left → the next rarity down, then up (four repeatable
  commons are always eligible, so a slot never comes up empty). An upgrade
  or a replacement is offered at its card's rarity, with no extra weight; a
  maxed card never is. Synergies
  (the Master Gunner burn spread is parked with titles, ID-084):
  Ricochet + Piercing Rounds bounces keep the pierce the
  bullet had left, at every level. A card shows a synergy line when it would turn one on.
  **The offer (ID-097)** spells out each pick: a card not held shows "New"
  and its level 1 effect; a card held shows "Lv 1 → 2" (or "Lv 2 → Max")
  and the effect before and after with the changed number highlighted
  ("Enemies 15% → 25% slower"); an epic shows "Unique"; a repeatable card
  shows its stack and total ("Sharpshooter ×3 → ×4: +30% → +40% damage");
  the other ammo card keeps "New" but shows, right under it, a red box: "Replaces
  Incendiary Rounds Lv 2. Its levels are lost." over what you'd hold before
  and after (red for a loss, gold for a synergy). Patch Up shows the HP it
  would restore in bold like any card's number. On a phone (640 px or
  narrower) the cards stack in an opaque panel. Picking it is the one
  choice, with no extra dialog. Screen readers read the level or stack,
  both values and any warning.
  Retune (ID-022): the ticket's 50% Ricochet let a campaign without building
  win Horde 5; the 25% above holds every balance target.
  **Balance with levels (ID-097).** Main before this change won every
  horde-only Horde 1–10 at the first try on all 20 seeds. With levels and
  flat steps the scripted squad won Horde 1 on 80% (the lone starting survivor
  15 of 20), Hordes 2–7 on 90–100%, and Hordes 8–10 on only 20%, 10% and 10%:
  compounding Sharpshooter and Rapid Fire had carried the late hordes (flat
  steps at the old +20%/+15%/+15% still gave only 70%, 40%, 40%). Decided:
  Hordes 1–3 are sure wins (enemy HP eased, §5 and §9), Hordes 4–7 are won
  at the first try on most seeds, and from Horde 8 the hordes are walls the
  player farms past. The balance pass (ID-102) brought back Hordes 8–10's
  first-try target (at least 60%) and the late-horde test, with farming (§11
  Balance pass). Level by level, in Horde 4
  with three survivors and that card alone (wins of 20; no card 2): Speed
  Loaders 7, 12, 15; Extended Mags 10, 13, 15; Barbed Wire 11, 11, 12
  (9, 11, 12 before ID-104; with durability by level its levels are judged
  by wins at least as many and kills further out, 158.5, 162.5 and 173.4 px). Shock
  Rounds kills 7–11 px further out than no card at every level, each level
  further than the one below (163.5, 164.0 and 167.5 px against 156.1); its
  wins (5, 7 and 5 of 20) are noise, as a paralysis only holds enemies back.
  Concussion Rounds wins 8 and kills 7 px further out. The gun-role scenes
  (ID-046) take only the repeatable stat cards: the rest favour some guns
  over others.

- **Reworked (ID-077).** Chain Lightning (an energy arc, out of place next
  to real guns), Explode on Kill (a 40 px burst), Slow Field (120 px at the
  wall), Split Shot (a fan of bullets from any gun) and Cleave (blade and tool
  hits only) are gone, with their numbers and art. Measured over horde-only
  Hordes 1–9 with the scripted squad, a kill happens a median **350–440 px**
  in front of the wall (most 250–570 px). In won fights from Horde 3 on, none
  happen within 60 px of it. The nearest other enemy is a median ~110 px
  away: within 40 px for only 4–13% of kills, 80 px for ~30%, 150 px for
  ~68%. So the new cards act out in the field (Barbed Wire's band, Stopping
  Power, now Concussion Rounds), reach past one body (Frag Grenades' 70 px burst, aimed at the
  thickest group), or act on every shot (Speed Loaders, Extended Mags). Each
  has a balance test showing it makes a measurable difference: in Horde 4
  with three survivors and no other card, each wins more fights than none
  (2 of 20) and kills further out. Retune: Frag Grenades started at one
  grenade every 5 s for 30. That let a lone starting survivor win Horde 4,
  and at a flat 8 s the full squad's campaign fell to 40% at Horde 9 (Split
  Shot had carried the late hordes). One every 8 s per survivor for 25 let
  the full game's campaign without building reach Horde 6. One every 8 s per
  survivor for 20 holds all three targets. Stopping Power started at 0.5 px a point; the proposal's ~6 px a
  pistol hit (1 px a point) held until ID-097 made it the epic Concussion
  Rounds at 0.5 px a point with a 0.5 s gap between pushes (above).

- **As built (ID-066): horde-only cards.** Stat, behaviour and barrier
  cards only: no power cards (there are no turrets) and no recruit cards.
  Research cards never come (nothing is researched). Four repeatable cards
  always stay in the pool (Patch Up only while the wall is damaged), so an
  offer never runs dry.

## 9. Enemies

All enemies enter from the right edge and rush left toward the camp as
one crowd (no lanes, §3).

| Enemy | Behaviour | Answer |
|---|---|---|
| Shambler | Slow, many | Anything |
| Runner | Fast, low HP | Traps, Gunner fire rate |
| Crawler | Climbs walls, skips a layer *(guess)* | Ripper on the wall-walk |
| Swollen | Explodes at a wall, big layer damage | Kill early from a tower |
| Spewer | Stops short, spits acid at walls, posts and turrets | Long-range Gunner |
| Brute | Armoured, smashes walls and gates | Ripper (chainsaw), pierce |
| Screamer | Speeds up nearby enemies | Focus it first |
| Mutated Horror | Boss of every 10th horde; one unique ability each | Whole base |

Renamed in ID-053: the Spewer and the Swollen had names other games already use; mechanics and numbers are unchanged.

- Mutants appear from Horde 5 *(starting point)*; new types join as horde
  numbers rise.
- **Scaling:** enemy HP × 1.10 per wave, × 1.17 per horde number (starting
  points; × 1.15 until ID-020, raised so a new game's Steady Fire keeps the
  balance targets: a campaign without building still stalls before Horde 6).
  Hordes 1–3 are eased to ×1, ×0.9 and ×0.85 of that (ID-097, `EARLY_HP`):
  with the weaker cards, the bare base won Horde 2 on 19 of 20 seeds and Horde
  3 on 10; eased, Hordes 1–3 win 20 of 20, Horde 4 stays at 2 of 20, and every
  campaign without building still reaches Horde 4 and stalls before Horde 6.
- **As built (ID-023, starting points):**

  | Enemy | HP | Speed px/s | Hit | Radius | XP / cash |
  |---|---|---|---|---|---|
  | Shambler | 20 | 30 | 5 / 1 s | 12 | 1 / 2 |
  | Runner | 15 | 75 | 3 / 0.8 s | 10 | 1 / 2 |
  | Crawler | 40 | 40 | 20 / 1 s | 9 | 2 / 3 |
  | Swollen | 60 | 18 | blast | 18 | 3 / 4 |
  | Spewer | 25 | 28 | 8 / 2 s | 12 | 2 / 3 |
  | Brute | 150 | 20 | 25 / 1.5 s | 20 | 5 / 6 |
  | Screamer | 30 | 30 | 2 / 1 s | 12 | 3 / 4 |

  The radius is the body bullets hit, clicks focus and the crowd keeps apart
  (two bodies touch at the sum of their radii); in the camp an enemy hits a
  defender from its radius plus a defender's (12). Each wave rolls each
  enemy's kind through the seeded RNG: Runners are 15% of a wave from Horde 2,
  then each mutant 10% from its horde (Crawler 5, Spewer 6, Swollen 7, Brute
  8, Screamer 9), Shamblers the rest; Horde 1 stays Shamblers only and rolls
  nothing, so its seeds play as before. Behaviours:
  - **Crawler:** at the first standing segment it reaches it climbs for 3 s
    (still a target, wall-walk melee included; no attacks), then drops behind
    that layer; once only. The defeat screen lists such a crossing as "climbed
    over". If the segment breaks under it, it walks on through the gap.
  - **Swollen:** at a standing segment it blows up: 150 to it and 50 to the
    standing segments above and below (wearing their turrets), and is gone
    with no kill paid: an acid-green burst swells and fades over 0.4 s, and it
    leaves no falling body (ID-049). Killed first, it pops harmlessly and pays its kill. In
    the camp it blows up on the defender it reaches for 50.
  - **Spewer:** stops 150 px short of its stop line, so the wall-walk is in
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
  against 25% with Shamblers only), and a Spewer parked 250 px out reached
  no defender. Runner HP went to 15, the Crawler to 40 HP and a 20 hit (it
  skips the wall and hits defenders), and the Spewer's stop to 150 px. Now
  the full line wins Horde 5 15% of seeds against 25% with Shamblers only,
  every other balance target holds, and a lone pistol Gunner misses Runners
  about three times as often as Shamblers (lead from last step's velocity).
  Art (§15): each kind has generated art of its own (ID-051), sized by its
  radius, mutants in acid green or flesh red, the Runner muted.
- **As built (ID-069): every enemy walks and strikes in frames.** Each kind,
  the Mutated Horror included, has three walk poses (a foot forward, the
  legs passing, the other foot forward) played 1-2-3-2, and an attack pose:
  the Shambler shambles with arms out, the Runner sprints, the Crawler
  crawls on all fours, the Swollen waddles, the Spewer and the Horror lumber
  hunched, the Brute stomps and the Screamer strides with its claws out. The
  cycle runs two frames a stride of ground actually covered (20 px), so a
  Runner's legs go about two and a half times as fast as a Shambler's, a
  trap slows them with the walk, and they stop when it does. The cycle runs
  whenever its velocity of late (eased over 0.15 s) is at least 1 px/s, under
  the slowest walk there is (a Horror on razor wire inside Barbed Wire's
  band, about 3.4 px/s), so no enemy that moves stands on one frame; one only jostled by
  the crowd, back and forth, drifts nowhere and stands on its passing frame,
  and one that stops (at the wall) stands on it at once.
  It shows its attack frame for 0.35 s after each blow, or half its time
  between blows when that is shorter, so a fast attacker still moves between
  hits. The Swollen's attack frame never shows in play: its blow at a wall or
  defender is its blast, which removes it in the same step. How it was made
  is in §15.
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
  - **Broodmother:** every 35 s (25 s before ID-096), 2 Shamblers at the wave's HP beside it, on its
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
  Art (§15, ID-041): a generated flesh-red hulk with growths over its back,
  sized by its radius.

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
- **As built (ID-099, tuned in ID-102): harder hordes, horde-only.**
  From the farming and harder hordes design (2026-11-06), Part 2. The full game
  keeps the ID-024 rules above; `HordeSetup.harder` turns these on for the
  horde-only build. Everything is fixed by the horde number (a replay meets the
  same waves and bosses) and rolled from the fight's seed.
  - **Late growth:** enemy HP grows ×1.06 a horde past the squad cap
    (×1.03 before), one knob (`SQUAD_HP_GROWTH.late`), so Recommended Power
    rises every horde (past a boss horde, the next asks less than the boss
    horde but more than the one before it). ID-102 kept ×1.06 and matched the
    gun level's step to it (§11 Balance pass). ×1.10 was tried first: Horde 20 then beat even a squad
    of level-200 Military Rifles with no cards, so no Recommended Power could
    be fitted to it.
  - **Swarm waves:** from Horde 5, 25% of a horde's waves (at least one), +1% a
    horde, at most 50%, spread evenly back from the last wave, which always
    swarms (Horde 5: wave 7; Horde 9: waves 4 and 9; Hordes 11–19: 3, 7 and 10;
    Horde 30: 2, 4, 6, 8 and 10). ID-102: counted from wave 1 before (Horde 5:
    wave 4; Horde 9: 4 and 7), so with wave sizes held from Horde 10 a growing
    share slid the swarms onto smaller waves and Horde 14 brought less HP than
    Horde 13. A swarm wave spawns 2× the enemies at twice the rate (the same time),
    with Runners at 2× their share (Shamblers give way). "Swarm!" shows big in
    the field's upper middle for its first 3 s, with two alarm blares.
  - **Bosses:** still every 10th horde, now Horde n brings n/10 Mutated Horrors
    (at most 3), each at 4× a Horror's HP with two skills; a horde's bosses never
    share a skill. Sets in turn by boss horde: Horde 10 Brood + Roar; 20 Slab
    Throw + Roar and Charge + Armour Plates; 30 Plates + Roar, Brood + Slab
    Throw and Charge + Regen; 40 Charge + Roar, Regen + Slab Throw, Brood +
    Plates; then again. They come with the first spawn of the last wave; the
    horde is won once all are dead.
  - **Mini-bosses:** every odd horde from Horde 5 brings one elite with the
    first spawn of its middle wave: a Brute or a Swollen in turn, 4× its HP,
    drawn and hit 1.4× as big, with one skill (Roar, Plates, Slab Throw,
    Charge, Regen in turn). Horde 5: an elite Brute with Roar; 7: an elite
    Swollen with Armour Plates. An elite Swollen still bursts at the wall, 2× as
    hard (its HP and skill are what get it there), so it must die on the way in.
  - **Skills.** Each timed one winds up for 1.2 s first: the boss glows in the
    skill's colour, leans back and swells, a low growl rises, and its boss bar
    says "Roar!". A stun hides the wind-up and holds every clock.
    - **Roar:** every 14 s, the other enemies within 300 px move 40% faster for
      4 s (an amber ring under each).
    - **Slab Throw:** every 16 s, from at least 150 px out, a concrete slab
      that lands 0.6 s later: with Barbed Wire it breaks the working wire row
      nearest the boss's row (ties: the upper one), else 300 damage to the
      outermost wall's standing segment nearest it.
    - **Armour Plates:** steel plates on its body; bullets do half damage until
      25% of its HP is gone, then they're gone for good (regen doesn't bring them
      back). A Sniper rifle's rounds go through them (the hook ID-101's
      armour-piercing builds on).
    - **Brood:** today's Broodmother, +1 Shambler with each brood (2, 3, 4…).
    - **Charge** and **Regen:** as above.
  - **HUD:** one boss bar per boss or mini-boss on the field (up to 3), each
    naming its skills, e.g. "Mutated Horror (Brood, Roar) · Roar! · 4,520/4,520"
    or "Elite Brute (Roar)". The result screen names each boss that came and
    whether it died ("the Mutated Horror (Brood, Roar) is dead", "The Elite
    Swollen (Armour Plates) still stood"). The full game's one Horror
    reads the same way now ("Mutated Horror (Charge)", not "Mutated Horror:
    Rammer").
  - **Recommended Power** counts it all: swarm waves' HP (twice a calm wave's) weighted 2× again (they come
    twice as fast), bosses and mini-bosses at their HP, and a boss horde ×1.12
    (ID-102), refitted (§11 Farming).

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
- **Party strength** = defender levels + weapons (Instinct adds patrol
  survival later, §6), plus profession
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
- **As built (ID-026, starting points):** the ten single-building
  locations above, round trips (out, search, back in equal thirds): gas
  station T1 15 min, supermarket T1 20 min, electronics store T2 45 min,
  hardware store T2 1 h, pharmacy T2 1 h, construction site T3 2 h,
  police station T3 2 h, hospital T4 3 h, military depot T4 4 h, the
  crater T5 8 h. Patrols open after Horde 2; the gas station, supermarket
  and electronics store show from the start, the hardware store after
  Horde 3 and the pharmacy after Horde 5; the rest wait for research
  (ID-035). A patrol needs a gate with HP above 0, and 1 or more idle
  defenders (fit and not already out); there is no limit on parties out.
  A location or defender the game never offers is a programming error and
  throws, as an unknown id does when equipping.
  A party out can't defend, and its weapons can't be changed. Each search
  makes **3 rolls**, +1 per 3 × tier of **party strength** (each member's
  level + primary weapon's rarity power; stats add none since ID-084), +2 at most; each extra
  roll also gives a found weapon a 25% chance of one rarity up. Found
  weapons' rarity rises with the tier (the crater never drops Rusty);
  Gas and batteries go to the power, weapons to the armoury (salvaged for
  Scrap when it is full). Stand-ins until the items exist: the toolkit
  for Tools, the knife for a machete or chainsaw; ammo-type affixes are
  left out; the crater's "Anything" rolls another location's table. Loot
  comes from the seed the patrol left with, so a patrol that finished
  while the game was closed brings back the same. **Patrol XP** per
  member: the horde-win XP of the horde number it left at × hours out ×
  (1 + 0.5 per tier above 1). Each return leaves a report (the latest 20
  are kept) for the world map screen (ID-028). Gates can be built from
  the build menu, one per layer (a layer that has one offers none).
  Risk, injuries and deaths come with ID-027.
- **As built (ID-027, starting points):** a location's **danger** is
  6 × its tier of party strength, and the party's strength over it rates
  the trip: 1 or more **Safe**, 0.6 **Risky**, 0.3 **Dangerous**, below
  that **Deadly** (a starting pair is Risky at the gas station, Dangerous
  at the hardware store). The odds, per member for injury and death and per party for
  a wipe:

  | Rating | Injured | Dead | Wipe |
  |---|---|---|---|
  | Safe | 5% | 0% | 0% |
  | Risky | 15% | 3% | 0% |
  | Dangerous | 30% | 10% | 5% |
  | Deadly | 40% | 20% | 20% |

  The wipe is rolled first, then each member's death, then injury, from
  the patrol's seed on a stream of their own, so the loot is unchanged and
  a late settle comes out the same. A party that loses every member is
  wiped out: no loot, no XP. Survivors bring the loot and XP; the injured
  rest 2 hours from the return (§11 Recovery). The dead leave the roster,
  and their owned weapons (a free one is just gone) wait at the location
  until the next party back from there, which brings them home into the
  armoury (salvaged for Scrap when full); the party that lost them doesn't.
  At most 40 wait across the map; past that the oldest is lost. The report
  names the injured, the dead, a wipe and the weapons recovered. Until the
  roster floor (ID-033), a patrol can't take every defender who isn't
  already out: one stays at the camp; and if a patrol from an older save
  would kill the last defender alive, one member comes back injured
  instead. Save v6.
- **As built (ID-028):** the **World map** button in the build panel
  (disabled until patrols open after Horde 2) opens the map in place of the
  field (which takes no clicks while it shows), with its panel beside it.
  The camp and each revealed location sit at fixed spots (`MAP_SPOTS`; a
  longer trip sits farther), joined by a route. Each location shows its
  name, tier and a ring in its risk colour, with the rating written under
  it: the rating of the party ticked in the panel, or with nobody ticked, of
  the biggest party allowed (every idle defender, less the weakest if one
  must stay at camp; "Nobody can go" when that leaves no one). Picking a
  location shows its round trip, what it mostly and sometimes drops (an
  entry at least half the top weight is "mostly"), the weapons the fallen
  left there, a party picker (who is out or injured says until when) and
  the risk screen: party strength vs. danger, the rating, each member's
  injury and death chance, the wipe chance and the loot rolls. Send shows
  the core's refusal when it can't go. Each patrol out is a dot on its
  route (out, held at the location while searching, back), labelled with
  where it went, who went and the time left, with the same line in the
  panel, both moving every second (the timer stops when the map closes);
  the reports follow, newest first, with loot, XP and casualties. Loading
  another camp forgets the map's picks. No save change.
- **As built (ID-029, starting points):** two plazas. **Riverside Plaza**
  (gas station, pharmacy, hardware store) shows from Horde 6 and the **Strip
  mall** (supermarket, electronics store) from Horde 3, each with its own
  spot on the map and an icon made of its buildings' icons. The player
  ticks 1 or more of a plaza's buildings; the **trip** is the longest
  travel each way among them, the searches added up and the highest tier
  (all of Riverside: 20 min each way, 45 searching, T2, 1 h 25 m; the
  Strip mall 51 min; a single location is a place whose only building is
  itself, so its numbers are unchanged). Danger, rating, loot rolls and
  XP use the trip's tier and length. Each ticked building gets `3 + bonus`
  rolls on its own table, in plaza order, from the one seed, at the trip's
  tier for weapon rarity. **Loot focus:** "Anything" or one type a ticked
  building can drop (each material, Gas, Batteries, Weapons; the crater's
  "Anything" line is never focusable, and what it rolls elsewhere is
  unfocused); its weight x2. A type none can drop is greyed out on the
  map and refused by the core.
  **Big horde** (plazas only): chance 10% + 5% per tier above 1 + 5% per
  building after the first (Riverside, all three: 25%; the Strip mall,
  both: 20%); party strength never changes it. It is rolled on a stream of
  its own (seed xor a constant), so the loot and casualty streams never
  shift and a late settle comes out the same; a hit also rolls the result,
  the building (uniform over the ticked ones) it hit during, and 1-2 Genes.
  The horde is 1.5 x the danger of the trip's tier, and party strength over
  it gives the odds:

  | Party vs. horde | Beaten | Fenced off | Overrun |
  |---|---|---|---|
  | 1 or more | 70% | 25% | 5% |
  | 0.6 | 35% | 45% | 20% |
  | 0.3 | 10% | 40% | 50% |
  | below 0.3 | 0% | 25% | 75% |

  **Beaten:** every building is searched, XP x1.5 and 1-2 Mutated Genes join
  the haul; casualties at the trip's rating. **Fenced off:** only the
  buildings before the one it hit during count; injury chance x2 (at most
  1); deaths and wipe at the trip's rating. **Overrun:** the same loot rule;
  deaths and wipe at the Deadly row (injury too). The trip's return time
  never changes: a retreat cuts the loot, not the clock, so timers stay
  simple.
  **When things go wrong:** *Save the loot* keeps 80% of the loot and
  scales deaths and wipes x1.25; *Balanced* (default) 40% and x1; *Save the
  people* 0% and x0.5 (at most 1). It applies on a Dangerous or Deadly
  trip and on any big horde. On an ordinary Dangerous or Deadly trip it is
  "gone wrong" when someone died (no wipe): the loot is cut to the share.
  On a fenced-off or overrun horde the share applies to the loot found
  before it. Always: half the party or more dead, or a wipe, brings no
  loot, whatever the order (a death on a Safe or Risky trip that is under
  half the party costs nothing). Each count (each material, Gas, each
  battery) is cut to the share and rounded down; the first weapons found
  are the ones kept, rounded down too. Survivors still get XP and the camp
  still picks up what the dead left at the place; a place's left-behind
  weapons are kept per place, plazas included.
  The risk screen adds, for a plaza, the big-horde chance and strength and
  each result's odds with its casualties, for every place the order's share
  and factor (written as not applying to a Safe or Risky single building),
  all live as buildings, the loot focus and the order change; Send passes
  them and shows the core's refusal (no building ticked). The report lists
  the buildings searched, how the big horde ended, the orders and what the
  retreat lost. The orders and the panel's picks are forgotten on loading
  another camp; picking a place ticks all its buildings. **Save v8:** a
  patrol stores its place, buildings, focus and order, a report its
  buildings, how many were searched, the big horde, order, focus and what
  was lost; every id is read through an allow-list (buildings must belong
  to the place, each once, in its order; the focus one its buildings can
  drop). A v7 save loads with single-building patrols, Anything and
  Balanced, and reports with those defaults and nothing lost.
- **As built (ID-030, starting points):** the camp builds a **car** from
  the camp section of the Roster view for 40 Metal, 20 Parts and 30 Scrap;
  the first needs no research and more come from a research node (ID-035).
  While a car is free, the send-patrol screen offers **Take the car**,
  labelled with the round trip by car and on foot and the Gas it burns
  against the camp's (with "as much as it could find" when that sets the
  price); picking a place or sending starts on foot again. By car each
  way takes half the time, rounded up to whole minutes (the longest of a
  plaza's ticked buildings, as on foot); the search is
  unchanged (the gas station 11 min, the crater 5 h 20 m). Gas is paid when
  the patrol leaves: 1 per 10 minutes of the whole round trip by car
  (out, search, back), rounded up, and **never less than the most Gas the
  trip could bring home** (every roll at its most, bonus rolls included,
  with Foraging at rank 5): the gas station, and any Riverside trip that
  ticks it, burns 13; the crater 32 (it can find 13 through "Anything").
  Without enough Gas, Send says so. A balance test runs every place, every
  set of buildings and every loot focus at the strongest party with
  Foraging at rank 5. The car changes only the clock and the Gas: the loot,
  risk and XP are those of the trip on foot. A car is busy until its
  patrol's due time and the patrol is settled (also while the game is
  closed) and is never lost, even in a wipe. Patrol lines and the map's
  marker say "by car" and move on the shorter route. **Save v10:** the
  camp stores its car count (0 to the limit, 1 for now), each patrol which
  car it took (null on foot), every car out one the camp built and on one
  patrol at a time. A v9 save loads with no car and every patrol on foot.

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
- **As built (ID-035, starting points):** every research node costs
  **Mutated Genes**; materials only build and upgrade the Lab. Research
  runs in a **queue**: one entry at a time, up to 3 more waiting, each
  15 minutes to 2 hours, also while the game is closed (each next entry
  starts when the last one ended). Genes are paid when an entry is queued;
  removing a waiting entry, or cancelling the running one (the next then
  starts at once), refunds it in full. A node can be queued once its
  earlier node is done or ahead of it in the queue, and an entry another
  queued one needs can't be removed. Saves keep everything already
  researched. The tree (Genes, time):
  - Barriers and power: Metal walls 10, 15 min (Metal tier); Auto-turret
    40, 1 h (Lab 2, after Metal walls); **High-capacity batteries** 60,
    1 h (Lab 2, after Auto-turret) and **Military batteries** 200, 2 h
    (after High-capacity): each unlocks that battery for workbench
    crafting (ID-034) and adds 500 to the bank cap (1,000 → 2,000).
  - Skills: Flashbang 10, 15 min; Molotov 20, 30 min; Airstrike 60, 1 h
    (Lab 2).
  - Perks: Scavenger's Eye 15, Fortify 20, Butcher's Hunger 15, Rally
    Call 15 (30 min each); Second Look 60, 1 h; Overclock and Power Saver
    80, 1 h 30 min (Lab 2, after Auto-turret); Perk slot 2 15, 45 min;
    slot 3 120, 1 h 30 min; slot 4 300, 2 h.
  - Traps: **Sharpened spikes** 10, 15 min (spike damage ×1.5, 8 → 12);
    **Razor wire** 10, 15 min (wire holds enemies to 35% speed, was 50%);
    chemical trap kits for the workbench (ID-034): **Glue** 20, 30 min;
    **Incendiary** 60, 1 h, **Corrosive** 100, 1 h 30 min and
    **Paralyzing** 150, 2 h (Lab 2, after Glue).
  - Cards (join the offer pool once researched): **Heavy Rounds** 25,
    45 min (rare, once: +40% damage); **Field Repairs** 80, 1 h 30 min
    (Lab 2; epic, once: every wall segment to full HP).
  - Camp: **More cars** 150, 2 h (Lab 2): a second car.
  - Perk levels share the queue (§5). The whole tree, levels included,
    costs about 4,300 Genes: Horde 10's Genes buy Metal walls, Flashbang
    and Perk slot 2 even with no mutant killed (about a dozen nodes when
    the mutants die too), and winning every horde to 29 with every mutant
    killed still falls short of the whole tree. Larger base area and new
    map locations stay out of v1; the map keeps revealing by horde number.
  - The build panel lists the queue (running entry with its end time and
    Cancel, waiting ones with Remove, each naming its refund), then each
    node to Queue with its Genes and time; the research screen comes with
    ID-036. Save v11 stores the queue (entries in order, the running end)
    and each perk's level, read back through the allow-list: at most 4
    entries, no duplicates, known ids only, each one the game could have
    queued behind the ones before it, and the running end cut to its full
    time after the save (a clock set back, as rests are). Perks owned
    without research can't outnumber the boss hordes won.
- **As built (ID-025, starting points):** the camp stores Scrap, Wood,
  Metal, Concrete, Parts, Food, Medicine, Chemicals and Mutated Genes
  (Gas and batteries stay with the power, §7); a new game adds 3 Food.
  A horde win pays **2 Genes + 1 per 5 hordes**, +1 per 5 mutants killed
  (Crawler, Spewer, Swollen, Brute, Screamer; a Swollen that blows
  itself up isn't a kill) and +10 for a boss horde; a loss pays none.
  A win also has a **20% chance to find 2 + 1 per 5 hordes** of one of
  Parts, Metal, Food, Medicine or Chemicals, rolled after the weapon
  drop so its odds don't move. Nothing spends Genes yet (ID-035); the
  starting Parts come with the ticket that makes turrets cost Parts.
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
- **As built (ID-031):** each resting defender's roster card has **Use
  Food** (30 min less rest) and **Use Medicine** (60 min less), with the
  stock left; each use spends one. A cut longer than the rest left heals
  them at once (the item is still used up). Field Medic shortens the rest,
  not the cut. Refused, with the reason on the button, for someone not
  injured or with none left; a defender out on patrol shows no buttons.
  No save change.
- **Roster floor** *(designer's call)*: if fewer than 3 defenders are
  alive, a free basic recruit (level 1, Rusty pistol) arrives every hour of
  real time (while camp slots allow), so a patrol wipe can never leave the
  player with no one to defend or patrol. It counts the living roster, not
  who is available, so sending everyone out doesn't trigger it.
- **No deadlock** *(designer's call)*: every horde pays a little Scrap and
  Wood — more on a win, less on a loss — so the base can be repaired even
  with no patrol loot.
- **As built (ID-033, starting points):** the camp holds 5 people; the
  roster's camp section sells up to 3 **camp upgrades** of +2 slots each
  (60 Wood + 40 Scrap, then 80 Wood + 40 Metal + 60 Scrap, then 80 Metal +
  40 Concrete + 80 Scrap), so at most 11. **Dismiss** asks first, is refused
  while 3 or fewer are alive or the defender is on patrol, and puts their
  owned weapons in the armoury. The **roster floor**'s clock starts when the
  living roster drops below 3 (from the patrol's return when one dies); each
  hour a free recruit arrives (level 1, a pistol, a name from a fixed list),
  caught up while the game is closed, until 3 are alive again. A patrol
  still can't take every defender at the camp (ID-027). **Camp XP** is half
  a win's defender XP, rounded down; camp level L to L + 1 costs 30 × L XP
  (level 2 at about Horde 3, level 5 at about Horde 15). Each level gained
  offers 3 different picks, rolled from the fight's seed; the result screen
  holds "Back to build" until each is picked (any left over show in the
  roster). The picks stack to 5 ranks each and leave the pool at the top:
  **Scavenging** +5% kill cash, **Stockpile** +10 cash at the start of a
  horde, **Salvage Crew** −10% on every repair, **Field Medic** −10% injury
  rest, **Foraging** +5% patrol materials and Gas (to the nearest whole).
  The survivor slot comes with ID-032.
- **As built (ID-032, starting points):** a patrol back from a trip of tier T (a
  plaza's is its highest ticked building) and not wiped out has 2 tries of 5% × T each to find a **survivor** (tier 1 about
  10%, the crater about 44% for one or more), rolled from its seed on a stream of
  their own, so loot and casualties don't move. Each is level 1 to T, with that
  level's stat points rolled across the stats, a name from the recruits' list and
  any weapon at the tier's patrol rarity; a gun is their primary, anything else
  goes beside a free pistol. They wait in the report, taking no slot, with **Let
  them join** and **Turn them away**; letting one in needs a free camp slot and armoury room
  for their weapon, and a report dropped from the latest 20 takes its undecided
  survivors with it. Each camp level-up offer has a 10% chance that a survivor
  takes one of its 3 slots: level 1 to the new camp level, at most 5, weapon at
  that level's tier. Letting them in takes no pick and needs the same room (the
  result screen counts the slots and armoury room left after the win); a pick
  turns them away, and an offer with no pick left (every one at the top rank)
  shows **Turn away** so it can always be answered. Save v9.

- **As built (ID-065):** the camp's buildings stand on fixed plots in the
  build scene (§15), between the camp line (x 120) and column 0's ground
  posts, top to bottom: the **Research Lab** (a ghost "+" until built, then
  its level), the **Generator** (a ghost until built, then running or
  idle), a free plot kept for the **Workbench** (ID-034), then the **huts**:
  one per camp upgrade bought, plus a ghost hut for the next while one is
  left (3 at most). They replace the five fixed decorative huts. A click on
  the Lab or the Generator opens the Build tab at its section; a hut opens
  the Roster, whose camp section sells the upgrades. Everything is read
  from the game as it stands: nothing new is saved.

- **As built (ID-066):** the horde-only build hides resources, research,
  the camp, the camp level and Mutated Genes; their state stays in the save
  untouched.

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

As built (ID-066), the horde-only build:

- **New game:** Horde 1 with one survivor (free recruit 1, a random name)
  carrying a pistol. No named starters, no professions. The rest of a new
  game's state is the full game's, kept untouched.
- **Survivors:** each horde won adds one survivor, in the squad for the next
  horde: no accept step, camp slot or recruit card. The squad cap is 6; at
  the cap nobody new joins (ID-067 adds the weapon drop).
- **Progression:** survivor XP and levels, at twice the full game's XP per
  win (`SQUAD_XP_RATE`). One result screen shows the XP, level-ups (with the
  stat picker) and the new survivor. Camp XP, the camp level and Mutated
  Genes are hidden.
- **Pacing:** a boss horde every 10th horde. Winning Horde 10 shows a soft
  ending ("You held Horde 10", Continue) and play goes on; there is no win
  state.
- **Balance** (scripted player, 20 seeds, `balance/horde-only.test.ts`): the expected
  squad (a survivor more per win, every point in Sharp Mind, damage cards
  first)
  wins each of Hordes 1–10 at the first try on at least 60% of seeds, and
  every campaign beats Horde 10's boss; the lone starting survivor wins
  Horde 1 on every seed and loses every horde from Horde 4.

When the full game comes back, it starts as before:

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

### Farming *(as built, ID-098; tuned in ID-102, see Balance pass below)*

From the farming and harder hordes design (2026-11-06), Part 1. A stuck
player replays beaten hordes for XP and guns, sees how far short they are,
and comes back stronger.

- **Beaten hordes:** the save keeps the next new horde (`hordeNumber`); every
  horde below it counts as beaten, so the highest beaten is `hordeNumber − 1`
  and an older save's beaten hordes count too. Between hordes a horde picker
  offers the next new horde or any beaten one. A replay is a normal horde of
  that number (same waves, enemies and HP); a replay win adds no survivor
  and doesn't move the next new horde on.
- **First clear:** the drop rolls the horde's band (§6 Gear) moved up one
  rarity (Rusty → Common … Prototype → Relic; Relic stays). Uid `h<n>`.
  Older saves get no first-clear drops for hordes already beaten.
- **Replay:** the band with its top rarity's share halved, the half moved to
  the rarity below. Uid `r<k>`, the k-th replay win.
- **Bad-luck guarantee (replays only):** "an upgrade" is a drop with more
  dmg/s than the weakest gun a squad survivor holds (the free pistol
  included). Each replay win whose drop is no upgrade adds 1 to a saved
  count (at most 5); each count moves 5 points of rarity weight up one band,
  taken from the lowest rarity with weight left. At 5 the next replay drop is
  a sure upgrade: a gun and rarity (at or above the weakest held gun's where
  the band has one) that can beat it, picked evenly, its affixes rerolled up
  to 64 times and then its best roll, so it always ends. Any upgrade resets
  the count. When no gun the horde can drop could beat the weakest held gun
  (every affix maxed), the count doesn't move, there is no reroll, and the
  result screen says "Farm a higher horde for upgrades". First clears
  neither count nor reset it.
- **Gun level:** every dropped gun's level is its horde number; each level
  above 1 multiplies base damage by 1.06, before rarity and affixes (a Horde 20
  drop hits ×3.03 a Horde 1 drop of the same gun). ID-102: +5% of base damage
  a level, added, before (×1.95 at Horde 20). Combine takes 3 of a gun and
  rarity at any levels; the new gun has the highest. The free pistol and
  older saves' guns are level 1. dmg/s everywhere includes it.
- **XP:** a replay pays that horde's survivor XP; more than 3 hordes below
  the highest beaten, half. A loss pays 25% of that horde's win XP (halved far
  down too) × waves cleared ÷ its waves (0 cleared → 0), rounded down. Still no
  drop on a loss.
- **Squad Power:** per squad survivor, their gun's sustained dmg/s (rarity,
  level, affixes; Sharp Mind's crit chance and damage; Agility's reload)
  × (1 + 0.5 × Sharp Mind's spread cut) × (1 + 0.5 × Instinct's extra HP
  share) × 10, summed over the squad and rounded. Cards and skills don't
  count. (Gun role traits join it with ID-101.)
- **Recommended Power (ID-102):** 10.3 × the dmg/s a horde asks for: its
  expected enemy HP over the seconds its waves take to spawn (each wave's size
  × 0.8 s, plus the 3 s break). The HP is each wave's size × its mix's mean HP,
  a swarm wave's (ID-099) weighted 2× on top of its doubled size (it comes
  twice as fast), plus its bosses and mini-boss at their HP. A boss horde asks
  ×1.12 more (its bosses' skills ask for more than their HP says). Hordes 1 to
  8 take ×0.3, ×0.6, 1, 1, 1, 1, ×0.8 and ×0.8 of it: sure wins for a squad of
  one or two, then a smaller squad's fit. Horde 1 asks 63, 3 asks 393, 5 asks
  1,406, 10 asks 4,113, 15 asks 7,748, 20 asks 12,911, 30 asks 26,505.
  - Before: 3.19 × HP^0.59 (ID-099; 7.1 × √HP in ID-098), fitted only on
    Hordes 6–20. With waves growing ×1.1 a horde, a horde's length grew as
    fast as its HP, so HP alone over-counted: at Horde 30 it asked about half
    of what a squad needed. Over HP a second, one fit holds from Horde 9 to
    Horde 30 within ±10% of each horde's measured 50%-win power.
  - Fitted (`balance/squad-power.test.ts`, 10 seeds, Military Rifles at the
    expected squad's size and level, no cards or skills) so a squad at it wins
    about half the time: Horde 9 60%, 12 50%, 15 60%, 20 60% (mean 58%;
    before: 50/30/30/50%, mean 40%). With the scripted player's cards and
    skills the same squads win 10 of 10 at each. At 70% of it a squad loses
    Hordes 10 and 15 on at least 4 of 5 seeds; at 130% wins on at least 4 of 5.
- **Bands:** green at or above Recommended, amber within 15% below, red
  further. The numbers are always shown; it never blocks a start.

### Balance pass *(ID-102)*

One pass over farming, harder hordes, horde-only skills, gun roles, stat
points and horde cards together (ID-096 to ID-101), baselined on main first,
then grid-tuned with the scripted player (`src/core/sim.ts`).

- **The scripted player now plays like a stuck player.** After a loss at a
  new horde it replays the highest beaten horde 3 times (`SQUAD_FARM`), then
  tries again; it uses its picked skills (Flashbang and Molotov) once 6 enemies
  stand on the field, aimed at the one nearest the wall. A worst-luck mode
  throws every replay drop away except a guaranteed upgrade, and counts each
  toward the bad-luck guarantee.
- **Baseline (main, before):** every balance file passed, with the late-horde
  file skipped and Hordes 8–10 relaxed (ID-097). Played with the same farming
  player, 3 seeds to Horde 18: 12, 24 and 29 losses (36, 72 and 87 replays);
  the worst wall took 10 losses (30 replays); 31% of Hordes 11–18 fights won;
  enemies hit the wall in 92%; Horde 15's fight lasted 1,058 s and grew ×1.1 a
  horde (Horde 30's would last about 78 minutes). First-try wins at Hordes 8,
  9 and 10: 33%, 0% and 33%. Past some horde no gun level could catch up:
  enemy demand compounded while a gun level added a flat 5%.
- **After:** 3 seeds to Horde 18: 6, 8 and 4 losses (18, 24 and 12 replays);
  the worst wall took 5 losses (15 replays); 65% of Hordes 11–18 fights won;
  enemies reach the wire band in every one and hit the wall in 84%; Horde 15's
  fight lasts 842 s, and fights stop growing past Horde 11.

| Value | Before | After | Why |
|---|---|---|---|
| Horde-only wave size growth (`WAVE_GROWTH`) | ×1.1 a horde, no end | ×1.1 a horde up to Horde 10, then held (the full game keeps ×1.1) | Fight length grew with it (17 min at Horde 14); HP growth carries the difficulty past it |
| Late HP growth (`SQUAD_HP_GROWTH.late`) | ×1.06 | ×1.06 (kept) | Grid 1.06–1.14 with gun steps of 5% and 8%: the gun step must match it, or players get stuck (1.10 with 5%: 27 losses at one horde) |
| Gun level (`GUN_LEVEL_DAMAGE`) | +5% of base damage a level, added | ×1.06 a level, compounding | Matched to late HP growth, so farming can always close the gap; 8% let the squad run away (Squad Power 1.64× Recommended by Horde 25) |
| Horde-only HP ease (`SQUAD_EARLY_HP`) | Hordes 1–3: ×0.8, ×0.9, ×0.95 | Also Hordes 8–10: ×0.85, ×0.75, ×0.75 | Brutes join at Horde 8 (mean enemy HP +55%), the first boss at 10. 20 seeds, first try: 85%, 70%, 65% (target at least 60%) |
| Swarm wave placement (`swarmWave`) | Counted from wave 1 | Counted back from the last wave, which always swarms | With wave size held, a growing share slid swarms onto smaller waves and Horde 14 had less HP than Horde 13 |
| Recommended Power (`POWER.rec`) | 3.19 × HP^0.59 | 10.3 × HP ÷ spawn seconds; ×1.12 on boss hordes; early ×0.3, ×0.6, 1, 1, 1, 1, ×0.8, ×0.8 | Refitted on each horde's measured 50%-win power, Hordes 3–30 (above) |
| Swarm share (`SWARM.share`) | 0.25 | 0.25 (kept) | 0.20 and 0.30 both made walls shallower (first-try losses at Hordes 11+: 25% and 29% against 46%) |
| Boss count and HP (`BOSSES`) | n ÷ 10 up to 3, 4× HP | Kept | HP 3 and at most 2 bosses: no change to Horde 18; HP 5: a little easier (fewer replays) |
| Mini-boss HP (`ELITE.hp`) | 4× | 4× (kept) | 3× and 5×: 29% and 50% first-try losses against 46% |
| Boss skills (`BOSS_SKILL`) | Roar +40%, Slab 300 | Kept | Roar +60% changed no fight to Horde 18; Slab 450 about the same |
| Drop odds (`SQUAD_DROP`, Horde 10+ band) | Relic 10% | Kept | Relic 15%: walls take at most 6 replays (drops feel free); 5%: a little harder |
| Bad-luck ramp (`FARM`) | 5 points a count, sure at 5 | Kept | At the worst luck a sure upgrade at 8 slowed campaigns to Horde 13 (94 fights against 70); 3 didn't speed them up |
| Skill ×2 (`SQUAD_SKILLS.solo`) | ×2 | Kept | The scripted player picks two skills; ID-100's tests cover ×2 |
| Gun traits and role affixes (`TRAIT`, `AFFIXES`) | SMG +25% close, … | Kept | SMG +15% and +35% didn't move the targets; the gun balance tests still pass |
| Stat caps (`STAT_EFFECT`) | Sharp Mind crit 0.5 | 0.5 (kept) | The most sensitive horde-only knob (0.4: 54% first-try losses, 0.6: 17%), and the band the full game's Horror test needs (ID-096) |

Targets, each with a balance test:

- **Hordes 1–10** (`balance/horde-only.test.ts`, 20 seeds): Hordes 1–3 won
  at the first try on every seed, 4–10 on at least 60% (restored from
  ID-097's relaxed targets); every campaign beats Horde 10 (farming where it
  lost).
- **Mid-game walls** (`balance/late-hordes.test.ts`, 4 seeds to Horde 18,
  re-enabled): every campaign beats Horde 18; in new-horde fights from Horde
  11, enemies reach the Barbed Wire's band in at least 75% and hit the wall in
  15–95%; every seed loses at least one new horde at the first try; farming
  past any one horde takes at most 30 replays with average luck.
- **Recommended Power** (`balance/squad-power.test.ts`): about half the
  fights won with no cards or skills, most with them (above).
- **Worst luck** (`balance/farming.test.ts`, 2 seeds): with every replay
  drop but the guaranteed ones thrown away, every campaign still beats Horde
  13, at most 45 replays at any one horde (12 measured).
- **Farming far down is never faster** (`balance/farming.test.ts`): a full
  squad stuck at Horde 16 gains about twice the Squad Power and 1.4–1.9× the
  XP per fight minute replaying Horde 15 as replaying Horde 11, on each of 3
  seeds.

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
  the Menu's Save tab, to keep outside the browser and paste back in. Loading
  one asks first, since it replaces the camp.
- **Storage refused:** where the browser blocks or fills storage the game
  still plays; the Save tab says saving is off and the Menu button shows a
  red dot.
- **Several tabs:** each saves on its own changes; the last write wins.
- **Menu** *(as built, ID-039)*: a "Menu" button top-right (or Esc, when it
  has nothing else to cancel) opens a dialog with three tabs. **Settings:**
  Reduce motion (sprites stop bobbing and leaning; it starts on when the
  system asks for less motion) and **Chatter** (ID-085: Off, Low or Full,
  Full to start; read back through an allow-list of those three), each
  stored in its own key, outside the save and
  the code; **Sound** (ID-080): Master volume, Music and Sound effects
  sliders (0–100 % in steps of 5; 80, 60 and 80 to start; letting go of the
  Master or Sound effects slider plays a sample shot) and Mute (the sliders
  dim but keep their levels), each in its own key and read back through an
  allow-list of the slider's own values. **Save:** whether saving works, the
  backup code, Load code and New camp (each asks first, and both wait until
  no horde is on). **Help:**
  the controls and a short how-to-play. In a fight, the open menu pauses it.
- **Inventory** *(as built, ID-079)*: an "Inventory" button in the top bar, left
  of the Menu (its own place, not a Menu tab), opens a dialog (between hordes
  guns are equipped and combined there too: Combine, ID-091, §6 Gear; drag and
  drop, ID-095) of what
  the camp holds now: the stash against its cap ("Stash 6/20"; from the cap on
  "Stash 20/20 (full)", as the next drop throws the weakest away), strongest
  first as in the gun picker (anything that is no gun, from an older save,
  last); each squad survivor and the gun they fight with, in squad order (not
  the reserve, which this version doesn't show, nor its guns); and the free
  pistol. Each weapon shows its name in its rarity's colour, its affixes and its
  dmg/s. The start and result screens keep their gun pickers. It opens between
  hordes and in a fight, which it holds like the Menu; Esc or Close shuts it.
  - **As a grid (ID-092):** the dialog has tabs (Weapons only for now; items and
    materials can join later). The squad row (each survivor's gun with their
    name under it, then the free pistol once) sits over the stash grid: one
    64 px square slot per stash place up to the cap, empty places drawn empty.
    A slot shows the gun's icon (one per base gun, the model the survivors
    hold, long guns laid across the square) on its rarity's tint inside a frame
    of its rarity's colour, with its dmg/s rounded in a corner badge. Selecting
    a slot (click, tap, or the arrows, Home and End from its single Tab stop)
    rings it and fills the details beside the grid (under it on a phone): the
    name in its rarity's colour, "Military rarity · Rifle", its role and trait
    (ID-101), each affix on its own line, dmg/s, who holds it, and Combine.
    Hovering a slot shows its details until the pointer leaves the grid. It
    opens on the strongest stash gun. Each slot's screen-reader label names the
    gun, its rarity, role and trait, dmg/s and affix count. The result screen's
    drop tile shows the same icon and tint.
  - **Drag and drop (ID-095), between hordes:** a stash gun dropped on a
    survivor's slot is theirs, the gun they held going to the stash (nothing
    for the free pistol); the free pistol dropped on a survivor with a gun sends
    that gun to the stash; a survivor's gun dropped anywhere in the stash
    section (a gun, an empty place, its heading) goes there and they fall back
    to the pistol. A full stash refuses the last two with "Stash full", so the
    stash never passes its cap and no gun is thrown away. A stash gun dropped
    on another of its set (same base gun and rarity, below Relic) with 3 or
    more opens that set's Combine confirm (the weakest 3, as ever); a short set,
    a Relic or a blade is refused with the details' wording ("1 more for a
    Common SMG"), another kind with both names first ("Rusty SMG and Common
    LMG don't combine.", the rule staying in the dragged gun's details); a gun in hand never combines.
    While dragging, the gun follows the pointer in its rarity frame (by touch,
    a slot above the finger, with a short buzz where the phone has one), its
    own slot fades, valid drops get a green ring and invalid ones grey out (red
    under the pointer); picking up a survivor's gun or the pistol with the
    stash full says "Stash full" at once. Dropping on nothing, Esc, or a release
    the page never sees (the window lost it) puts it back. A mouse drag starts
    after 6 px; a touch drag after a 350 ms still press, so a finger that
    moves first still scrolls the grid, and the grid note on a touch screen
    says "Hold a gun, then drag it…". Held near the grid's top or bottom edge,
    a drag scrolls the grid. Without dragging, a gun's details do the same: a
    stash gun or the free pistol has "Equip on…" with a button per survivor
    (the pistol only those holding a gun), a survivor's gun Unequip, beside
    Combine. Each move or refusal is said in a status line in the dialog's
    foot, beside Close (read out: "Mara now holds Military Rifle; Rusty SMG is
    back in the stash"; a refusal in the danger colour; cleared when another
    gun is selected), saved at once, and the gun pickers follow. On a phone
    the foot drops the Esc hint to make room. In a fight nothing drags, the
    details have no Equip, and the grid says "Change guns between hordes, on
    the start or result screen." Kept out: reordering the stash, survivor to
    survivor swaps, and the reserve.

- **As built (ID-066): save version 12** adds the reserve. A v11 save loads
  with its horde number and each survivor's level, stats and weapon; every
  other field loads as it was, hidden or not. In the horde-only build the
  6 survivors with the most XP (ties to roster order) form the squad and the
  rest go to the reserve, which this version doesn't show and the full game
  takes back. A survivor with no gun fights with the pistol. The reserve is
  read through the same allow-list as the roster, and the roster and reserve
  together never pass the camp's slots (at least the squad's 6).
- **As built (ID-067): the stash and equipped guns** are saved as the armoury
  and each survivor's loadout, so save version 12 is unchanged. Both are read
  through the weapon allow-list: known base ids, rarities and affixes only,
  whole affix values in range, a uid from a horde already won, each weapon
  once, and no unknown or prototype keys. The stash is capped as it is read
  (the camp's 30 owned weapons, stash and hands together; a full horde-only
  stash and six armed survivors is 26), and the save's size check comes first.
- **As built (ID-098): save version 15** holds farming: `farm` (replay wins,
  whole, at most 999,999, the most an `r<k>` uid names: past it a replay pays
  XP and drops nothing; and the bad-luck count, 0–5) and each owned gun's
  `level` (whole, 1 to the highest horde beaten, in every slot; only in a v15
  save). A replay's drop (`r<k>`) must come from a replay already won. Both go
  through the allow-list (exact keys, no prototype keys). A v14 or older save
  loads with no farming and its guns at level 1.
- **As built (ID-084): save version 13** holds the new stats (Instinct,
  Agility, Sharp Mind, Tinker). A v12 or older save's stats (Aim, Might,
  Tech, Grit) are checked as before (whole numbers, no more than the XP
  earned), then every point is refunded as unspent points, on the roster
  and on survivors waiting to join, and the game says so once, naming
  where to spend them ("after your next win"; "on the roster" in the full
  game): an 8-second toast in the
  horde-only build, the build panel's notice in the full game, and the
  Load code message). A v13 save with points in Tinker loads with them
  refunded too. A patrol out in an old save keeps a strength no higher than
  its party's today.

## 13. Out of scope (v1)

- Multiplayer, raids on other players' bases, leaderboards.
- Story campaign beyond short location notes.
- Real-money purchases.
- Defender death in hordes (only patrols can kill).


Cut for now (ID-066, the horde-only build; code and state kept, behind
`HORDE_ONLY`):

- The build panel and the build scene: walls, tiers, posts, turrets, traps,
  repairs, batteries and the generator.
- The world map, patrols, the car, survivors from patrols.
- Research, the Research Lab, the workbench and crafting.
- The camp: slots, upgrades, camp XP, the camp level and its picks, the
  roster floor.
- Commander perks and the perk screen (Steady Fire stays, always on).
- Professions, titles and badges; the start defender and post pick.
- Horde cash, the shop row, active skills, power and recruit cards,
  replacements.
- Payouts, materials, Mutated Genes, weapon drops (until ID-067),
  injuries, rest, Food and Medicine.

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
  glance. Title badges are parked with titles (§6, ID-084).
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
  cracked as they take damage, the tier's rubble once broken, a sliding gate on a
  gate's top (redrawn in ID-054, a sliding gate since ID-075). Defenders and the Shambler stand on
  their spot; posts and turret heads sit on their footprint; traps lie
  across their cell. A lit
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
- **As built (ID-074): who is who in a fight.** Each defender has a name tag
  over them, drawn on top of every sprite and effect: a survivor's name just
  over their HP bar, a full-game defender's name a little higher, where the
  title badge sat before titles were parked (§6). The build scene shows none. Gunners
  come in four looks: the soldier, then three others (beanie and navy
  hoodie; cap and red plaid; brown leather jacket, tan trousers and
  ponytail, light enough to read on the dark fight ground). Each other
  look repaints the soldier's frames for every gun and pose (manifest `ref`
  to that frame, FLUX.2 Klein 4B), so its pose, grip and gun are the
  soldier's; generating a look from the puppets lost the grip (hands on top
  of the gun) and was dropped. A survivor's look comes from their id, so it
  never changes across fights or saves: a numbered id counts round the four
  looks by its last number (recruit 1 is the soldier, recruits 2 to 4 the
  others, recruit 5 the soldier again), any other id is hashed.
- **As built (ID-082): damage numbers.** Every hit on an enemy (bullet,
  blade, cleave, frag, airstrike, trap, burning) shows its
  damage where it landed, over the enemy's HP bar at that moment (it stays
  there as the enemy walks on), after a Brute's or the Horror's armour; a
  killing hit shows in full, overkill and all. A Ricochet's bounce off a
  crit round is a crit too. Every blow on a wall segment shows the HP it
  lost ("−5", never more than it had left) in pale red just on
  the camp side of the wall, right-aligned, so what the wall lost never
  mixes with what the enemies at it took. A number rises 18 px and fades
  over its last half, 0.9 real seconds at any game speed; with reduce
  motion it fades in place. Plain hits are off-white, 11 px growing to 15 px
  for a hit of 40 or more (a wall's loss at 25 or more); a crit is gold,
  60% bigger, with a "!", and lands 40% bigger still, settling over its
  first 0.15 s (no punch with reduce motion), drawn over every plain
  number. Each has a dark edge so it
  reads on any ground. To stay readable, hits on one target within 0.25
  fight seconds add into one number (crits and plain hits apart), so a
  shotgun round or a fire reads as one; at most 24 show, the newest. An
  enemy's sits 9 px (a crit's 14 px) left, centred or right by its 0.25 s
  window, so numbers
  on a target standing still never stack on one another. They draw under
  every reload pie and name tag, so they never hide one. The build scene
  shows none.
- **As built (ID-085): survivor chatter.** A survivor says a short line in a
  speech bubble when something happens to them: a reload starting ("Reloading!"),
  both of two guns empty at once ("Click… uh oh."; there is no ammo to run out
  of otherwise), a Frag Grenade they throw, a kill with a bullet or a blade,
  three kills within 3 fight seconds (a streak), a crit round landing, a hit
  taken, dropping under 30% HP, and going down (said where they fell). The
  squad's moments are said by one of them: a breach (the survivor nearest that
  wall), a Horror or a Brute appearing (nearest it), the last enemy of a wave
  with no more to come (nearest it), a wave cleared and the horde won (any of
  them; the win has its own lines). Each event has 4–5 fixed lines; the same
  line never plays twice in a row. Event rank, highest first (the ticket's
  order, with the events it doesn't place fitted in by choice): down >
  low HP > breach > boss > won = wave cleared > last enemy > crit = streak > dry >
  reload > throw > kill > hit. A survivor says only their highest event of a
  frame; a higher one replaces their bubble at once, a lower one never does.
  Otherwise each survivor waits 4 real seconds between lines, except for a
  boss or anything higher, which never waits (a kill line must not swallow a
  down); and the routine events wait longer before the same survivor says them
  again: a reload 15 s, a kill, a hit or a crit 10 s (a lone pistol survivor
  reloads every few seconds); a boss or a breach is one call for the whole squad,
  6 s before anyone calls the next. At most 3 bubbles show (a new one takes the lowest one's
  place only if it outranks it). A bubble shows 1.5 real seconds at any game
  speed, growing in over 0.12 s and fading over its last 0.25 s (with Reduce
  motion it just shows and goes); it follows its survivor, sits over their
  name tag and the reload pie's spot (kept clear whether or not a pie shows),
  under the damage numbers, and slides in from the view's edge so it is never
  cut off (its tail leans to reach the survivor). Two bubbles that would
  overlap never do: the higher rank keeps its spot and the other rises clear
  of it and of every survivor's name tag and reload pie (one pushed past the
  view's top is not shown); a card grows about its own centre, so it never
  overlaps another mid-grow. Lines are picked with the chat's own seeded random source (from the
  fight's seed), so the fight's rolls never change. Survivor ids from a save
  key the chat's state in Maps, and a saved id can never be `constructor`.
  The Menu sets chatter to **Off**, **Low** (only the big moments — last enemy
  and up — one bubble at a time, 8 s between a survivor's lines below boss
  rank) or **Full** (everything; the default).
- **As built (ID-093): chatter personalities.** Each survivor is **Calm**,
  **Cocky** or **Nervous**, and says only that personality's lines: 3 fixed
  lines per event each, none shared between personalities (a calm reload is
  "Reloading." or "Changing mags.", a cocky one "Reload, then more of you!", a
  nervous one "Reloading — hurry, hurry!"). The personality comes from the
  survivor's id, the way their look does (ID-074): a numbered id counts round
  Calm, Cocky, Nervous by its last number, so the first recruit is Calm and
  survivors who join one after another differ; any other id is hashed. It is
  never stored, typed or picked, so it never changes between fights, saves or
  backup codes. The survivor card shows it as one word under their level.
  It sets only which lines they say: event rank, the waits, the 3-bubble cap,
  the Off / Low / Full setting and the seeded pick all stay as ID-085 built
  them; the same line never plays twice in a row for an event.
- **As built (ID-045):** no line joins shooter and target (since ID-070, only
  a close shot's tail does, for the frame or two before it lands). Each bullet is drawn
  at its simulated spot, in the depth sort, as a bright slug with a streak
  behind it whose length and colour are its gun's (`tracer` in the gun data:
  pistol 12 px, turret 14 px), dropping from the barrel to body height over
  the distance it was aimed. The fight records each shot (a 0.05 s muzzle
  flash, 0.08 s since ID-070, at the barrel end of the defender's or turret's sprite) and each
  bullet's end (0.25 s: a blood puff on the body for a hit, a dust kick on the
  ground where a miss fell). Effects are drawn shapes, not sprites, so they
  need no art; each stays at least 1 px on screen at 0.5× zoom. Blade and
  tool strikes keep their slash.
- **As built (ID-070):** bullets are easy to follow at 1×, 2× and 3×, and
  read as bullets, not beams (a long even line with an outline looked like
  a laser). Each is a white head capsule (6 px long, 2.5 px wide) on a dark
  backing 1 px wider each side, with a soft 5 px glow in its gun's colour;
  a tail that thins from 2.5 px to 0.5 px and fades from white through the
  gun's colour to clear; and a faint shadow of the same shape on the ground
  under it (1.5 px at its head), which gives contrast on light ground and
  shows it flying. Only the head has a rim. The tail is the gun's tracer
  plus one 60 fps frame of flight at the game speed, counted up to 2×
  (pistol 12 + 30 px at 1×, 12 + 60 px at 2× and 3×); at 3× the bright head
  carries the eye over the small gap. The fight moves bullets in whole
  1/30 s steps, so the head is drawn carried on by the time since the last
  step (never past the spot it was aimed at before it gets there, nor past
  the end of its flight) and moves smoothly instead of jumping. The tail
  never reaches back past the muzzle, so it joins shooter and target only on
  a close shot, for the frame or two before it lands. One shot's pellets (one
  muzzle, flown as far) lay every shadow and backing before any tail or head;
  each of a shooter's other shots sorts on its own. The muzzle flash lasts
  0.08 s (at least one frame at 3×): its round orange halo, and a core
  teardrop 8 × 4 px pointing along the shot (its newest bullet), white at
  the muzzle to orange at its tip (both replaced by ID-088). Every tracer
  colour is `#rrggbb`. A hit also flashes a white 4 px spark on the body
  for its first 0.1 s, shrinking and fading. Every effect stays at least
  1.5 px on screen.
- **As built (ID-088):** the muzzle flash reads as a gunshot. Drawn in code
  (no art), all of it adds light (`lighter`), so it brightens the sprites
  behind it and never covers them. From the barrel end, flames (thin
  4-point tongues) point along the shot: a long one forward and short ones
  flaring to the sides, each orange with a pale yellow centre, on a soft
  orange glow, with a white-hot dot at the muzzle. Each gun has its own:
  pistol small (6 px forward), SMG thin and spiky (8 px, its flames'
  lengths ±40%), rifle 10 px, sniper a 13 px needle with short side flares; a shotgun's a wide
  fan of three big flames; an LMG's a broad five-flame star with the
  biggest glow; a turret's a cold blue cross with a short flame out the
  back, unlike any survivor's (anyone but a Gunner fires a sidearm, so a
  pistol's). A turret's flash and bullets are found by who fired
  (`turret:<id>`), as its sound is. Each shot rolls its look from the
  seeded RNG (seeded by who fired and when, so a replay matches): size
  ±15%, turned up to 0.12 rad, each flame's length ±30%. Over its 0.08 s
  it flares from 60% to full size in the first 15% at full brightness,
  then shrinks by 30% and fades fast (squared) to nothing; its glow fades
  faster (cubed), so its tail is an ember, not a smudge on the dark
  ground. Its main flame stays at least 2.5 px long, so it still points at
  0.5× zoom. For shots up to 0.4 rad off straight across on screen (an
  enemy up to 0.7× as far off the shooter's row as it is out), no flame
  reaches more than half the gap between two survivors on one wall walk,
  so busy flashes stay apart; steeper shots cross as thin streaks. It costs
  one gradient and four fills a shot (one gradient and two fills before).
- **As built (ID-071):** the fight is at dusk, easier on the eyes over a long
  session. A dark, slightly cool wash (`rgba(8, 10, 16, 0.7)`) lies over the
  ground past the field and over the field's own ground, under every sprite,
  so the wall, survivors, enemies, bars and bullets keep their full
  brightness and stand out more than before. The horde-only view between
  hordes is at dusk too, so starting a horde never flashes; the camp's build
  scene keeps its daylight (with the camp, Start Horde's ease steps into the
  dusk). The fight's XP plate has a 1 px edge so it reads on the dark ground.
  Green grass grows over the field: 40 seeded patches of 4–8 tufts (22–44
  units each), the dry-grass art tinted green over its own shading, painted
  with the ground after the decals, so the layout is the same on every load
  and the tiles and decals keep their ID-050 places. None grows within 60
  units in front of the first wall or behind it, so the survivors' lane
  stays plain and they never sink into a patch.
- **As built (ID-072):** a wall shows its damage, in a fight and in the build
  scene. Each segment looks worse in stages by its HP share, on top of the
  existing drop in height: whole at full HP; cracked from just below full to
  two thirds (the crack art over its top and front, 70% opaque); chipped
  below two thirds (cracks at full strength, plus a jagged gouge cut into
  each long edge of its top, the right one mirrored and lower); broken
  through below a third (plus a band of rubble and rebar across the top's
  full width, its middle third); rubble at 0 HP as before. The damage art
  follows the wall: its top is a long thin strip, so nothing is round. In a
  fight a segment's HP bar (16 × 4, narrower than the 20-unit wall top; at
  least 14 × 4 px; 1 px dark edge), 2 units below its middle, shows over its
  top only once it is below full HP and while it stands, drawn over every
  sprite so the enemies at the wall never hide it; the build scene keeps its
  own bars. A blow that takes HP off a standing segment (an enemy's hit or a
  Swollen's blast) flashes it pale orange (55% at the hit, so it shows on
  pale concrete) and shakes it sideways (2 units) for 0.25 s of fight time,
  so pause holds it and game speed shortens it. A crowd on one segment starts
  a new flash at most every 0.4 s, so the segment never stays washed out over
  its damage. Only the segment shakes; anything standing on it stays put.
- **As built (ID-075): barrier cards show on the wall, and the gate slides.**
  In a fight (never in the build scene) the barrier cards taken show on
  every standing segment, the gate included. Picking any barrier card pulses
  the wall a pale teal (swelling and fading over 0.9 s, at most 35%), so it
  never reads as a hit. The pulse and the repair glow below last 0.9 s of
  real time at any game speed (fight time times the speed, so 3× never cuts
  them short, and pause holds them). (Spiked Walls' stakes and their bites
  went with the card, ID-097.) **Reinforce** lays a steel X brace over
  each segment's top and front at 40%, under the ID-072 damage, so every
  damage stage still reads; it looks the same however often it's taken.
  **Patch Up** and **Field Repairs** glow each segment they actually heal
  green (45%, fading over 0.9 s) under three small green crosses that float
  6 units up (they stay put with Reduce motion on); a segment already whole
  shows nothing. **Barbed Wire** (ID-077, replacing the Slow Field's tar
  strip) shows its band (250–400 units in front of the outermost layer, the
  field's full height) under every sprite, with no tint over the ground
  (ID-090): three coils of concertina wire running top to bottom near the
  band's near edge, middle and far edge, each nudged off the even marks.
  Each coil is a helix lying down the field (24 units in diameter, a loop
  every 11) seen from above, its far half dark steel and its near half lit pale,
  each strand drawn thick over a near-black outline so it reads on the grey
  ground from 0.5× to 2×, with a pair of crossed razor blades every half
  loop. A steel picket 16 units tall stands in each coil every 80 units.
  The only darkening is a light shadow (22% black) under the wire and the
  pickets. (ID-077's first coils read as a chain or a ladder; its later
  rings on a dirt tint read as grey rings over brown, ID-090.) The band is
  painted as seen, short down the field by the view's tilt, so the loops
  stay round on screen. A broken row (ID-090) shows torn: each coil cut
  through twice within the row, the cut ends sagging, the wire dulled (no
  bright highlight) and every other picket knocked flat; a whole row next
  to it joins up where both are whole. It's drawn in code (no art file),
  whole and torn each painted once into its own canvas
  (`src/ui/ground.ts`), and each run of rows alike is drawn in one go;
  where the browser can't paint them, a steel line down each coil of the
  working rows shows where the slow applies. (The barbed wire trap keeps
  its ID-043 sprite for now.)
  **Frag Grenades** (ID-077): the grenade
  is an olive-drab ball 13 units across with a near-black edge and a pale
  rim on its upper left, so it reads on the dark, mossy ground. It
  flies from the thrower to where it lands on a low arc (40 units high at
  the middle) with a shadow under it on the ground, then bursts with the
  airstrike's blast art swelling over its 70-unit reach and fading out over
  0.4 s. **Concussion Rounds** (was Stopping Power) needs nothing of its own: the hit enemy visibly
  jolts back. **Shock Rounds** (ID-097): a paralysed enemy twitches side to
  side (1.5 units and 0.05 rad, flipping every 0.06 s) while a small spark
  crackles on its body: a short pale zigzag over a cool blue glow, about
  two fifths of its height, jumping to a new spot on its torso each flicker. No
  arcs between enemies. It's drawn in code (no art file); with Reduce motion
  it holds still. **The gate** is now a sliding gate: one closed panel on a
  rail with roller wheels down its middle and a heavy end cap at each end,
  drawn over the whole segment top, flush with the segments beside it, with
  no posts sticking out and no passage. Each tier has its own (weathered
  wood with iron bands, dented corrugated metal, slate blue-grey bolted
  steel plates for reinforced, a pale concrete slab); the other three are
  repaints of the wood gate, so all four share one outline. The art build's
  `ajar` step and the old angled gate generation are gone. All the new art
  (stakes, brace, tar and the four gates) passed the art reviewer.
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
- **As built (ID-051):** the six enemy kinds from ID-023 have generated
  art in place of their drawn shapes, made the same way as the Shambler's
  (shared sprite style, FLUX.2 Klein 4B, one manifest entry each, picked
  from three seeds): a lean, muted Runner; and mutants that keep their
  colour (manifest `mutant`): a low acid-green Crawler, a bloated Swollen,
  a hunched Spewer with an acid sac on its back, an armoured flesh-red
  Brute and a spiked Screamer screaming open-mouthed. Each is mirrored to
  face the way the Shambler does and drawn by its radius like the
  Shambler's art, so it moves in the ID-049 poses with no new frames. The
  Spewer's art has no spit of its own: the glob and the Swollen's burst
  stay drawn effects. The Mutated Horror got its art in ID-041.
- **As built (ID-054):** the gate is part of the wall. The camera looks
  along the wall, so its outward face never shows; the gate is drawn where
  the wall shows, on its segment's top, in place of the tier's top texture:
  a closed sliding gate seen from above (redrawn in ID-075, which replaced
  the two leaves left ajar over a dark passage). The gate lowers with its wall, cracks
  show over it, a broken one is its tier's rubble. Its wall-walk spots get
  no plank platform (it would cover the gate); a defender or turret there
  stands at the same height as on any segment, drawn over the gate. The old
  top-down door art is gone.
- **As built (ID-041):** the last placeholders have art, made the same way
  (FLUX.2 Klein 4B, one manifest entry each, picked from three seeds). The
  **Mutated Horror** is a hulking flesh-red mutant with growths over its
  back and arms to the ground, kept saturated (manifest `mutant`), drawn by
  its radius in the ID-049 poses. Each skill lies flat on the ground across
  its radius, squashed by the camera's tilt: an **airstrike** bomb's blast
  and a **flashbang**'s white burst swell from 85% to full size while fading
  over 0.4 s; a **molotov** fire is drawn at 70% opacity under every sprite,
  flaring up over its first 0.15 s, dying down over its last 0.5 s and
  wavering 3% in size. The skills use the `object` style (or their prompt
  as sent) rather than the angled sprite style, since they lie on the
  ground; the flashbang's soft glow kept pink from the magenta it was keyed
  out of, so the build drains all its colour (manifest `white`). The four
  horde cash shop items and three skills each show an icon (an adrenaline
  syringe, a lightning-bolt bullet, a hammer over a plank, crossed wrenches
  on a gear, a stun grenade, a burning bottle, a falling bomb) 20 px beside
  their button's label; the icon has empty alt text, so a screen reader
  reads only the label. The armed airstrike's aim shows every bomb's ring
  along the row. No drawn placeholder remains.
- **As built (ID-028):** the world map has generated art (FLUX.2 Klein 4B,
  prompts sent as they are, one manifest entry each). The **region** is one
  hand-drawn ink-and-watercolour map of ruins, fields, a river and roads,
  picked from three seeds: the build's new `picture` kind cuts off the paper
  frame the model drew (5% a side), mutes it and darkens it 22% toward the
  page so the drawn routes and rings stand out, scales it to 1152 px wide
  and saves it with a 256-colour palette; the map shows it cropped to its
  shape (`object-fit: cover`). It is the one piece of art the game doesn't
  wait for at start (`LAZY_ART`): it loads in the background, so it can't
  hold up or fail the start. Each
  location has an **icon** in one shared look (an isometric ruin with a pale
  roof and one muted colour accent; the crater a ring of rock round a green
  glow, kept muted), keyed like a sprite and drawn inside its 48 px risk
  ring; the gas station's three seeds set the look, the others were picked
  from two. Each pick passed an art review before it was used. A test fails
  if any location lacks its icon.
- **As built (ID-056):** a **UI kit** the rest of the redesign builds on.
  Every colour, size, radius and gap is a custom property on `:root` in
  `src/page.css`; component rules take colours only from those tokens (a
  test fails on any colour literal outside `:root`, or on a token used but
  never defined). The **type scale** has two display sizes (2.25 and
  1.75 rem, for the top bar and build panel from ID-058 on) over title,
  heading, body and four small sizes; the font stays
  the system stack, so nothing is fetched and the CSP is unchanged. **Text
  contrast** meets WCAG AA (4.5:1): a test checks every text colour on each
  surface it sits on, a see-through panel taken over white as its worst
  case. Three greys that failed were lightened (subtle, disabled and faint
  text), and a disabled HUD button greys by colour, not opacity, so its
  label keeps its contrast. **Buttons** come in four variants
  (`src/ui/kit.ts`): primary (filled with the accent), secondary,
  unaffordable (disabled, the materials it is short of in red, the reason
  only as the tooltip) and locked (disabled, a padlock badge and the reason
  as visible text under the label, kept as the tooltip too). The core marks
  a refusal `short` when only the cost stands in the way (cost is always its
  last check), and build, Lab and camp options show that as unaffordable and
  any other refusal as locked. In a fight the horde shop and skills must not
  change shape under the cursor: only a skill not yet researched is locked
  (all fight, noted "Needs research"); want of cash alone (the lock run again
  with unlimited cash passes) is unaffordable, its cost shown apart from the
  label so it can turn red; a passing refusal (cooling down, already
  running, a pick open, nothing to patch or fix) leaves the plain button,
  disabled, its timer saying why. **Resource
  icons**: one per resource (Scrap, Wood, Metal, Concrete, Food, Gas, Cash,
  Bank, Mutated Genes) in the ID-041 icon look (FLUX.2 Klein 4B, prompt as
  sent, picked from two seeds, two rounds): a junk pile with a cog, a tied
  plank bundle, steel ingots, a cracked block with rebar, a tin can, an olive
  jerry can, tarnished coins, a car battery with a bolt and a vial of green
  liquid with a helix (kept saturated as a mutant thing). Each pick passed an
  art review; a test fails if any resource lacks its icon. The top bar
  (ID-058) puts them to use.
- **As built (ID-064):** fights show one fixed frame, replacing ID-057's
  pannable opening view. The frame runs from x 300 (column 0's ground posts
  at 500 − 160, less the post's half width and a 24-unit gap) to the spawn
  edge at 1,600, and takes in every row plus the 80-unit strip above, where
  the back row's tops show. The camp's yard and huts, left of it, aren't
  shown. The zoom fits that frame (the smaller of width fit and height fit)
  between the top bar and the bottom HUD (48 px kept clear at the top; at the
  bottom the shop bar's measured height, at least 64 px, so a bar wrapped onto
  two rows takes more), so the HUD never covers the field: about 1.11× at 1440×900 and 0.98× at 1280×720,
  never under 0.5× (a narrower window keeps the wall-side edge). It is worked
  out again only when the window is resized. Nothing pans or zooms in any mode:
  drag, WASD and the arrow keys, the mouse wheel and Home do nothing, and the
  Help tab lists none of them. The trade-off is size: units stand about 24 px
  tall at 1280×720 (ID-057's view made them about 1.4 times that), so the
  whole fight, the wall and the spawn edge, is always in view. An enemy past
  every wall in its row, heading for the camp, leaves the frame: each such row
  shows a marker at the frame's left edge, an arrow pointing at the camp and
  the count, see-through so a defender under it still shows. A click left of
  the frame lands on nothing (an armed skill stays armed). Spare space round the
  frame shows ID-057's ground fill: past the field's edges a seeded 4×4 block
  of the ground's tile variants repeats without end, on the field tiles'
  160-unit grid and with their shared seam border, so no bare background
  shows. Effects keep the ID-045 minimum of 1 px at the frame's zoom. Build
  mode has its own scene since ID-065.
- **As built (ID-059):** the build panel has two tabs and a fixed footer.
  **Build** holds the picked slot's menu, Repair all, the generator and
  bank (decided each horde, so above research), then the Research Lab and
  its research. **Camp** opens the Roster, Perks and the World map in the
  panel's place (their Back returns to Camp), then lists who is injured or
  out on patrol; while anyone is, the tab says so ("Camp · 2 away"). A
  Workbench entry joins Camp once ID-034 adds the Workbench. Clicking a slot
  on the field switches to Build. Arrow keys, Home and End move between the
  tabs (modified keys, such as Alt+Left for Back, are left to the browser).
  The **footer** holds the start defender, start post and **Start Horde**
  (the kit's primary button) under every tab and view, so a horde can start
  from the Roster or the map too. Its notes sit above the pickers: the
  notice line (a recruit back, a lost save) and, when nobody is fit,
  "Nobody can defend until someone is back." Start Horde stays the last
  thing in the footer. The panel has one height for every tab and view, so
  Start Horde never moves and shows without scrolling at 1280×720. The
  trade-off is a mostly empty Camp tab that still covers the field's right
  edge. Only the body between the tabs and the footer scrolls. A redraw (a
  build, a research, a patrol back) keeps its scroll and the focused
  control. A new tab or view, or a newly clicked slot (its menu is at the
  top), starts at the top. **Research** has a
  heading that counts the nodes that can be queued now ("Research · 3
  available"; no count before the Lab is built). The queue follows, then
  those nodes, the ones short of Genes and the ones already researched. A
  full queue frees up as entries finish, so its nodes stay in view. Nodes
  locked for any other reason (a Lab level, another node first) collapse
  into one dashed row with an arrow: "26 more after the Research Lab" before
  the Lab is built, "N more locked" after, and "Hide N locked" once expanded. They
  stay expanded across redraws and start collapsed on each visit. The list
  itself moves to the research screen in ID-036, which leaves this heading
  as its entry point. The backup section is left to ID-039.
- **As built (ID-065):** between hordes the game shows its own **build
  scene**, the camp as a walled plot (§3, §11). Its fixed frame runs from
  x −20 (a thin margin of land outside the camp's fence) through the trap
  strip to x 1,240, and takes in every row, the 80-unit strip above and the
  bottom fence band. It is fitted left of the open build panel, under the
  top bar: about 0.78× at 1280×720 and 0.91× at 1440×900, never under
  0.5×. As with the fight frame, nothing pans or zooms, and it is worked out
  again only on a resize. The fence is a low wall (16 units high, 8 thick)
  in the most common tier of column 0's segments (a tie goes to the higher
  tier; wood with none). The land outside the field is dimmed so the plot
  reads as the focus. Ghosts are dashed outlines with a "+", each over a
  dark edge so they stand out on the ground; the free Workbench plot is a
  faint outline with no "+". Tier badges are the tier's letter on its
  colour (wood brown, metal blue-grey, concrete sand, reinforced slate).
  Name plates (fixed 11 px text on a see-through plate) name the Lab with
  its level and the Generator with its state, under each block. The Lab and
  the Generator are drawn as textured blocks (concrete with a lit window,
  metal) with a dark roof edge, and a running generator glows like a lit
  turret, until they get their own art. Built huts use the shack and tent
  art the yard had. **Switching scenes:** "Back to build" is a hard cut to
  the build scene as the result screen closes. Start Horde eases into the
  fight frame over 0.4 s (camera eased in and out, the camp still drawn
  while the fight frame's left clip slides in) and is a hard cut with
  Reduce motion on.
- **As built (ID-068): the horde-only frame zooms in on the wall.** PM
  decision: the view stays side-on (wall top to bottom, horde from the
  right) rather than turning the wall across the screen. The frame runs from
  x 439 (the firing line, less a survivor's half width and the 24-unit gap)
  to the spawn edge at 1,540, every row and the 80-unit strip above, so the
  whole wall line, edge to edge, and the spawn edge are always in view. The
  same rules fit it between the HUD bands as ID-064's and work it out again
  on each resize: about 1.15× at 1280×720 (was 0.98×) and 1.31× at 1440×900
  (was 1.11×), units about 17% bigger; a window too wide for the wall's height
  was already height-bound and zooms as before (never further out). The full
  game keeps ID-064's frame. No tower, ground post or wall-walk platform is
  drawn; a survivor stands on bare ground. Each survivor's HP bar always
  shows (not only once hurt), 30 × 5 units with a dark 1 px edge and never
  under 30 × 5 px on screen (about 35 × 6 px at 1280×720), bigger than an
  enemy's 24 × 4. In every fight the ground past the field's top and bottom
  edges is shaded with the build scene's outside dim (sprites still draw over
  it), so the wall's ends read as the map's edge, not a way round it (plus
  a dark lip at each edge since ID-081).
- **As built (ID-081): no black bands on a tall window.** A window taller
  than about 0.48 × its width + 112 px fits the frame by width, so spare rows
  show above and below the field. Firefox's shorter toolbars put a 1440×900
  screen past that line, and the spare rows were near-black: the surround
  took the dusk twice and the shade on top. Both browsers draw the same. Only
  the field's rows take the second dusk now, so the ground past the field
  shows one dusk and the shade, as dim ground. A dark lip (black at 0.45)
  fades out 24 units from each edge, so the edge still reads. The frame and
  zoom are unchanged.
- **As built (ID-069): enemies walk and survivors aim, in frames.** Art made
  frame by frame from prompts alone came out too random (the head turning
  between frames, broken ankles), so each frame is painted over a pose drawn
  first. `tools/art/puppets.py` draws a flat coloured puppet in each pose (the
  kind's colours and build, side-on, on magenta, every frame of a kind
  standing on the same spot), kept in `art-src/poses/`; each frame is a
  FLUX.2 Klein 4B edit of its puppet alone, with one prompt and one seed for
  every frame of a set, so the figure stays the same and only the pose
  changes (manifest `pose`). Giving the model the old still and the puppet
  together failed: the still won and the pose was ignored. The enemies'
  single stills are replaced: three walk frames and an attack each (§9).
  Enemies are side-on now, walking left, in the same colours (mutants
  saturated, the Runner muted); the walk frames carry the stride, so they no
  longer sway or lean into a lunge (the bob and the 6 px lunge stay).
  **Survivors** have an idle pose, the gun held low and pointing down, and an
  aim pose, the gun raised level at the horde, per gun (pistol, SMG, rifle,
  shotgun, LMG, sniper rifle); the SMG, shotgun, LMG and sniper rifle are
  painted from their approved gun image (manifest `ref`) as well as the
  puppet, the rifle and pistol from the prompt. A survivor aims from a shot
  until 0.3 s after their next shot or the end of their reload is due: they
  fire whenever a target is in range, so the aim holds while one is and
  drops once none is left. Each shot kicks them 3 px straight back for
  0.12 s, or 80% of the gun's time between shots when shorter; the old lean
  (the wiggle) is gone, and they breathe only at rest. The muzzle flash and
  each bullet's start sit at the aimed gun's barrel tip, measured from its
  sprite (a test checks the numbers against the pixels). A **frame set** (a
  kind's four frames, a gun's two poses; manifest `frames`) is cut by one box
  round all its frames and scaled by one factor, the box widened evenly about
  the puppet's hip so the body stands over its spot, so frames swap with no
  jump and a long aimed gun never shrinks the soldier. HP bars, and the full
  game's title badges, now sit just over the sprite's head instead of across
  it: a bar's bottom edge 3 units over the top of its sprite, at any zoom. Every clock is fight time: the walk follows ground covered and the aim
  follows shots, so both keep pace at 1×, 2× and 3× and hold still while
  paused. With Reduce motion on, enemies stand on their passing frame, but
  the attack and aim poses still show, since they say what a sprite is doing.
  Rippers and Engineers in the full game keep their ID-049 stills. Each pick
  passed the art reviewer (the PM delegated the choice to it, passing a pose
  that is about 80% right).

## 16. Tech and platform

- **Platform** *(designer's call)*: desktop browser first, **landscape**,
  mouse and keyboard (clicks for picks, posts, focus and skill targets); itch.io
  web build. Touch/mobile later.
- **Sound** *(as built, ID-080)*: the gun shots are short CC0 recordings
  (`src/assets/sounds/`, cut by `tools/audio/cut.py`, each played a little
  faster or slower, up to 4 %, so a burst never repeats one copy); the music
  and every other effect are made in code with the Web Audio API
  (`src/ui/audio.ts`), and a shot uses its made-in-code version until its
  recording has loaded. Sources and licences: `docs/audio-credits.md`. Audio
  starts on the first click or key press, as browsers require, and pauses
  while the tab is hidden. Two looping tracks: a slow one for the build, the
  camp and the result screen, and a fast one while a horde is on, crossfaded
  over 1.5 s
  (its drums rest every fourth bar). When a horde ends, the won or lost sting
  plays alone: the horde track drops in 0.3 s and the camp track waits 1.4 s.
  Effects: a shot per gun kind (and the turrets), reload, enemy hit and death,
  wall hit and break, card offer and pick, level-up, horde won and lost, and
  UI clicks. The cues are read by comparing each frame's fight with the last
  (`src/ui/sound.ts`), each named once a frame; a cue never plays more than 3
  at once (for a recording, counting only its first 40 %; its fade-out takes
  the last 40 %, so the 20 % between is the shot's ring) or two within
  0.04 s, and a compressor on the master output holds cues that land together
  under clipping, so a heavy fight never crackles.
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
  scripted player; the tests in `src/core/balance/` hold the targets (Horde 1
  always won, Hordes 1–2 in 3–5 minutes, difficulty rising, a win paying
  for its repairs, a camp that doesn't build stalling by Horde 5), and
  `npm run balance` (Node 22.6 or later) prints the full table for tuning.
