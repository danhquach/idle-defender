# The Long Hold — Design

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
- **The goal: call the evacuation** *(ID-127)*. Each of the boss hordes
  10, 20 and 30 yields a **radio part** on its first clear; three parts
  call the evacuation, and Horde 30 is the finale. After it play goes on as
  **Endless**, with the best horde reached as the record to beat. Details
  in §11 Start and pacing.
- **The player starts a horde** when ready; there is no forced timer. At
  least one defender must be available (not injured, on patrol or
  crafting) *(designer's call)*. Repairs are optional; a horde can be
  started with damaged barriers.
- **Winning a horde:** the last wave is cleared (for a boss horde, the
  Mutated Horror is dead) *(designer's call)*.
- **After a horde** *(designer's call)*: the result screen tallies
  **defender XP** and **camp XP**. A defender who levels up gets a little
  better at everything (§6, ID-146). A camp that levels up offers a camp-level pick (§11 Camp
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
  As built (ID-179): a squad of 7 or 8 (bought slots, §6 Stash) stands on a
  line of that many slots instead, spaced evenly in the same way (a seventh or
  eighth of the wall each), filled from the middle out (`SQUAD_LINE_WIDE`: 7
  fills 4, 3, 5, 2, 6, 1, 7; 8 fills 4, 5, 3, 6, 2, 7, 1, 8). A squad of 6 or
  fewer keeps the line of 6 and its order exactly.

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
- **Game speed:** 1×, 3×, 5× (ID-145; was 1×, 2×, 3×); Space pauses.
  - **As built (ID-062, ID-145):** three speed buttons sit in the fight's
    top bar, left of the Menu button, keys A, S and D for 1×, 3× and 5×
    (clear of the card keys 1 2 3 and the action bar's). The choice is kept
    between hordes in this browser under its own key, outside the save and
    the backup code, and read back through an allow-list (anything but 1, 3
    or 5 is 1×, so a 2× saved before ID-145 loads as 1×). The default is 1×.
    On a phone each speed button is a 40×44 px target with a 6 px gap; up to
    640 px wide (under 408 px before the Scrap chip, ID-179) the speeds take
    their own row under the Scrap chip, Roster, Inventory and Menu, since the
    groups don't fit one row there.
    Above 1060 px they sit 8 px left of the Scrap chip however wide its balance
    (and Medicine) grows (ID-239: the chip's width is measured); with Medicine
    shown, up to 1130 px they drop their key hints so the corner panel keeps its
    room.
    A, S and D are taken, so any keyboard camera control that ever comes uses
    the arrows, not WASD.
  - **The empty field runs fast (ID-164):** while nothing can happen yet (no
    living enemy within the farthest reach of the squad's guns and throwables,
    the oil mortars, the turrets, a Spewer's spit at anyone standing, or 60 px
    past the wall; nothing in the air; no boss winding up), the fight runs at 5×
    whatever speed is chosen. A "Fast-forward »" chip hangs under the speed
    buttons; on a phone, where the status line sits there, the 5× button is
    outlined dashed instead, titled "Fast-forwarding the empty field". The
    walk-in and the gaps between waves pass in a couple of seconds (at 1×, the
    first shot of Hordes 1–5 comes under 3 s after the start, not 4–11 s). Only
    the frame runs more of the core's fixed steps, so the fight takes the same
    steps and every balance test is unchanged.
  - Space holds the fight, with the menu's "Paused" chip in the top bar,
    tagged with the Space key.
    Opening and closing the menu leaves a Space pause on. Each fight starts
    unpaused. A typing field or a list keeps Space, and so does the result
    screen.
  - Speed runs more of the core's fixed 1/30 s steps per frame, never
    longer ones, so a seed plays out the same at every speed (a test plays
    Horde 1 at all three). A frame still covers at most 0.1 s, so 5× runs at
    most 15 steps in a stalled frame: the fight slows, nothing is skipped.
    With 300–340 enemies a 60 Hz frame at 5× (2–3 steps) costs about 2.5 ms
    of sim and drawing (3.2 ms at the 95th percentile), so no lower cap was
    needed. A crowd no real horde reaches (500+ enemies behind a wall that
    cannot fall) would pass the frame budget; the 0.1 s cap then slows the
    fight rather than skipping steps.
  - Picks and replacements stop the frame's remaining steps whatever the
    speed, and stack with a Space pause: resuming never skips an offer.
    Animations and effects run on fight time, so they speed up and freeze
    with it, except where they would strobe or be cut short: damage numbers,
    the wall's card glows and (ID-145) a hit's flinch and white flash last
    the same real time at any speed, so a sprite under steady fire flashes
    at most about 5 times a second at 5×, as at 1×. At 5× every muzzle flash
    and hit spark is still drawn for at least one frame at 50 fps and up (a
    frame of at most 3 steps; a test pins it); below that a frame can run 4
    steps and a flash can go unseen.
- **Start:** the commander's equipped perks are on (§5) and **1 defender**
  takes a post; the player picks which available defender and which post.
  Turrets and traps are whatever was built before the horde (§7); nothing
  is built mid-fight.
- **Defender HP and injury:** defenders have HP: 100 plus their level's
  bonus (§6 Stats), and the level's armour softens hits (ID-146; Instinct's before)
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
- *Before ID-139 (Airstrike is the one skill now; Flashbang and Molotov are
  throwable cards, §8; see the ID-139 note below):*
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
- **As built (ID-107): Flashbang and Molotov aimed at an area.** Pressing
  either (or its key) arms it, as the Airstrike is armed; the next tap or
  click on the field throws it at the area round that spot, a circle of
  radius 260 for the Flashbang and 180 for the Molotov (`SKILLS.*.area`,
  well over twice a burst's radius). Esc or a second press puts it away.
  **(ID-159)** A card or replacement offer holds the fight and the skills
  but leaves an armed skill armed: a click on the field or the skill's key
  only says "Pick first", Esc still puts it away, and after the pick the
  next click throws it. Meanwhile the aim caption reads "Pick a card, then
  tap an area".
  An aim behind the walls is moved onto the field just past the outermost
  wall. Each burst lands at a spot from the fight's seeded randomness, even
  over the circle, kept past the outermost wall and inside the field (so
  always inside the circle). Each one is thrown: it falls from the sky for
  0.5 s (`THROW_FALL`) before it lands, the first 0.5 s after the throw and
  the rest 0.15 s apart as before, and only then stuns or lights its fire.
  Counts, radii, damage, stun time, costs and cooldowns are unchanged, and
  so is the ×2 solo rule (8 Flashbang bursts, 2× Molotov damage a second).
  The Airstrike's carpet is unchanged except that each bomb also falls for
  0.5 s first (PM), so the whole carpet lands 0.5 s later, still from the
  wall outward. The scripted player (ID-102) aims
  at the enemy nearest the wall, as before.
- **As built (ID-114): Molotov fires keep up with the hordes.** A fire no
  longer burns a flat 5 damage/s: each second it burns 40% of this wave's
  Shambler HP (`SKILLS.molotov.burn`, `fireDps`), on whichever HP curve the
  fight uses (the full game's or the horde-only build's), so it grows with
  the horde and the wave instead of falling behind. A Shambler crosses a
  fire's width in about 3.3 s, so one that walks right through dies; one
  held in a fire (at a wall, or stunned) dies in 2.5 s. Tougher kinds
  take the same damage, so they last longer. Picked alone it still burns
  ×2. To pay for the harder throw its cooldown goes from 20 s to 30 s
  (between the Flashbang's 25 s and the Airstrike's 40 s). The horde-only
  balance pulls both ways here: at 20 s the lone starting survivor won
  Horde 4 on a seed, while 25–26 s left Horde 10 at 55% first-try wins;
  a grid over burn 0.3–0.45 and 20–30 s found 0.4 at 28–30 s (and 0.45
  at 30 s) passing both with room. Count, radius, area, 6 s burn time
  and cost are unchanged.
  Measured at Horde 7's last wave (a crowd of 40 Shamblers walking in, the
  squad not shooting, 6 seeds): one throw kills at least 30% of the
  Shamblers its fires touch, and at least half when picked alone.
- **As built (ID-139): Airstrike is the one skill.** Flashbang and Molotov
  left the skills to become throwable cards (§8): the notes above describe
  them as they were before ID-139. They are gone from the Lab tree (§11),
  the skill pick, `START_SKILLS` and the fight's skill buttons. The
  **Airstrike** is now aimed at an area, not a row: its **12** bombs land at
  seeded random spots spread evenly over a circle of radius **260** round
  the aim (moved past the outer wall and onto the field first, as the
  Flashbang's area was), still one every 0.1 s, each falling 0.5 s; an
  armed Airstrike shows that circle, fire orange, and one bomb's reach.
  Each bomb hits for **4×** this wave's Shambler HP (`SKILLS.airstrike.share`,
  `bombDamage`; a flat 40 before), on a **60 s** cooldown (40 s before); cost
  40 cash. The ticket's starting point was a flat 80 a bomb and the carpet's
  9 bombs. The balance pass took the bombs to 12 (a carpet ran 9 to 12, 12
  with no wall built) and made the hit a share of Shambler HP, as Molotov's
  fires (ID-114) and Frag Grenades (ID-124) are: with Flashbang and Molotov
  gone from the pick, flat bombs left horde-only Horde 8 under its 60% at
  80–150 a bomb, and the late hordes (11–18) stalled a campaign at Horde 13,
  where the old Molotov skill's scaling fires had carried. At 4× the
  horde-only Hordes 4–10 match main (Horde 8 57% over 40 seeds on both) and
  every late campaign beats Horde 18 in 74–78 fights (main 66–98). Picked alone
  it still hits ×2, and in the horde-only build it is always alone. The
  pick keeps its max-2 rule for later skills; with one skill an empty pick
  says "No skill picked"; a pick shows no note (ID-185). Since ID-174
  (PM) no text claims the ×2 (the pick, the card, the fight button and Help
  said it): one bomb already deals 4× a Shambler's HP, so ×2 couldn't be seen,
  and making it visible as twice the bombs moved the balance checks off
  their edges. The ×2 still works in the background. A new game starts with
  Airstrike picked. A save whose pick, research or research queue holds
  `flashbang` or `molotov` loads with them dropped; a pick left empty falls
  back to Airstrike if it is researched, or to none.
- **As built (ID-140): Airstrike auto-aim.** An **Auto** toggle (key **E**,
  in both builds) is a small **pill on the Airstrike button's top-right
  corner** (ID-232; it was a button of its own before): a plain "Auto
  [Hold Q]" while off ("Auto [Hold]" in the full game, which has no skill
  keys; "Auto [Press & Hold]" on touch), filled with the accent colour and a
  tick while on, with an accent ring on the Airstrike button too, ready or cooling. Its
  tap area is 44 × 44 px on touch screens. **Holding** the Airstrike button
  (or Q) for **0.5 s** turns Auto on or off as well: a ring fills round the
  button while held, Auto changes when it closes and letting go then does
  nothing; letting go sooner is a tap, which aims. A tap or Q aims on release,
  not on the press. Holding works while the Airstrike cools down (nothing
  aims) and ignores Q's key repeat. Every change, by hold, pill or E, says
  "Auto on" / "Auto off" above the skill bar for 1 s; the first fight with
  the Airstrike shows "Tap to aim · Hold for Auto" once (5 s, or until the
  first tap; `idle-defender.airstrike-hint-seen`, only `'1'` counts). It can be
  switched any time in a fight, during
  picks too, and is kept in this browser (`idle-defender.airstrike-auto`,
  only `'1'` reads as on, anything else as off; default **off**). While on,
  the Airstrike fires by itself the moment it is ready (cooled down, and
  with its cash in the full game), aimed by `strikeAim`: on the live enemy
  past the outer wall and on the field whose circle (radius 260) covers the
  most such enemies, ties to the one nearest the wall, then the lowest id.
  It holds while no circle covers at least **4** (`AUTO_AIM.min`) and looks
  again every 0.25 fight s (`AUTO_AIM.look`). It fires through the same
  `useSkill` as a tap, so a manual strike, which still works, starts the
  cooldown auto-aim waits on. In the full game it pays the Airstrike's 40
  cash the moment it fires, so a player saving cash for the shop turns it
  off. The scripted player in the balance tests keeps its old aim (the enemy
  nearest the wall once 6 stand on the field), not auto-aim *(PM, ID-140)*:
  aimed by `strikeAim` it won Horde 20 at Recommended Power in every fight
  (target 20–80%) and spread the stats' win rates to 0.27 (target 0.20), so
  a balance pass for auto-aim is left to its own ticket.
- **Reward on success:** mostly **defender XP**, **camp XP** (§11 Camp
  level) and **Mutated Genes**, plus a small chance of materials or a weapon. Higher horde numbers pay more.
  Defender XP goes in full to every defender who took part, injured or
  not, so a recruit never dilutes it *(designer's call)*. Defenders left on the bench get a share of it, win or loss, resting or not: `BENCH_XP_SHARE` (25%) of the fighters' average, rounded down, so +50 each for the fighters is +12 on the bench *(PM, ID-206)*. One who swapped in mid-fight fought, and gets the full amount. Fighters' XP is unchanged, and a bench level-up shows like a fighter's. The result panel adds "Bench +N XP" beside the squad's ("each" with more than one on the bench, a range if their shares differ, as the squad's chip). Patrols are the bench's other way to level (§10).

- **As built (ID-066): the horde-only fight.**
  - The whole squad starts on the wall, each on a tower in join order from
    the middle out (rows 5, 7, 3, 9, 1, 10), a row apart so each one stands
    clear of the tower behind (ten rows hold only five such towers, so the
    sixth is next to the fifth's). No recruit cards or replacement offers
    come; the bench comes in only by mid-fight swaps (ID-148, §11 below).
  - Horde cash and the shop row are hidden: kills pay no cash and no skill
    is researched.
  - **As built (ID-100): skills** *(before ID-139: the pick is Airstrike
    alone now, picked for a new game, §4)*. Before every horde the start or result
    screen picks up to 2 of Flashbang, Molotov and Airstrike
    (`SQUAD_SKILLS.max`); the last pick is saved and pre-selected. A new
    game (and an older save) starts with Flashbang and Molotov picked
    (`START_SKILLS`), so a player who skips the pick
    still fights with skills. No cash, so they run on cooldown only, on fight time.
    One picked alone works ×2 (`SQUAD_SKILLS.solo`) with the same cooldown:
    a Flashbang throws 8 bursts instead of 4, a Molotov's fires burn at
    2× DPS, an Airstrike's bombs hit for 2× damage. The picked skills sit in
    the fight's bottom row, left to right in Flashbang, Molotov, Airstrike
    order, on keys Q and W (by key position, so any layout works); each
    pulses once when it is ready again, and arming a skill says on
    screen how to aim it (tap a row for the Airstrike, an area for the
    others, ID-107). The pick cards always say what each skill does;
    the one picked alone adds its ×2 line. The balance pass (ID-102) kept
    their numbers; its scripted player picks and uses Flashbang and Molotov.
  - Steady Fire is the one perk, always on at level 1; no perk screen.
  - The top bar is minimal: the horde number, the wave and enemies left
    in the wave (on the field and still to come), with the speed buttons; the
    fight XP bar (its level and XP to the next) sits under it on the left.
    Wave progress and the enemies-left count show once, on the wave line
    (ID-167): the corner's tooltip names the horde (and the swaps left), never
    a wave or enemy count, since a tooltip keeps the text it opened with and
    went stale beside the live one.
  - Enemy HP grows ×1.20 per horde up to Horde 6 (the squad grows by a
    survivor a win until then), then ×1.06 (×1.03 before ID-099),
    instead of ×1.17 (§9). Hordes
    1–2 are eased to ×0.8 and ×0.9 of that (ID-097, `SQUAD_EARLY_HP`), so
    the first hordes are sure wins while the player learns the cards; Horde 3
    takes it in full and Horde 4 ×1.2 (ID-163: Hordes 1–4 couldn't be lost,
    then Horde 5 jumped), each enemy still no tougher than Horde 5's; Hordes 8, 9 and 10 to ×0.85, ×0.75 and ×0.75 (ID-102:
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
| Steady Fire | Ranged weapons +12.5% fire rate (15% before ID-125, §6 Stats) |
| Butcher's Hunger | Melee kills heal the nearest wall a little |
| Overclock | Turrets +20% damage, +10% energy use |
| Scavenger's Eye | +25% horde cash |
| Second Look | Extra card rerolls: one a wave (they add to the card pick's 3, §8) |
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
  guns (not blades, tools or turrets) ×1.125 fire rate (×1.15 before ID-125); **Scavenger's Eye**
  kill cash ×1.25 (fractions kept, whole cash shown); **Fortify** every
  segment ×1.3 HP and max HP for the fight, and the base keeps the same
  share of its own max afterwards; **Butcher's Hunger** each blade or tool
  kill heals the damaged standing segment nearest the
  defender 3 HP, up to max; **Rally Call** recruit chance ×2, still one
  recruit per offer at most; **Second Look** one extra reroll of the
  card pick a wave, added to the pick's 3 a horde (§8, ID-210); **Overclock** turret damage ×1.2 and draw ×1.1; **Power
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
  1 and 2 in turn at level 2, and 2 at level 3; they add to the card pick's 3
  rerolls a horde (ID-210) and carry across the horde's waves, as the 3 do. The Perks view shows each
  perk's level and an Upgrade button that queues the next level.

## 6. Defenders, weapons and professions

Defenders are a **permanent roster**: levels, stats, titles and gear stay.
**No fixed class:** any defender can use any weapon, and the equipped
loadout decides which profession they are working as.

- **As built (ID-066): no professions in the horde-only build.** Survivors
  are plain: no profession, so no Gunner fire rate, reload, crit or spread,
  no Ripper melee or shield, no Engineer repair or buff, no titles, title
  bonuses or badges, and no off-profession penalty. A survivor fights with
  their primary gun only (the pistol if they have none) and their level's
  §6 bonus (ID-146; stat points before). The roster keeps each
  loadout as it was. Each survivor does have a profession from before the
  outbreak (ID-149, §6 Professions), which has nothing to do with the loadout.

### Loadout → profession

Each defender carries a **primary** (always a gun), an optional
**secondary** and one **item** slot *(designer's call)*. Melee range was
the problem with a melee-only defender: every defender now shoots, and
close-quarter weapons come out only when an enemy is close.

| Kind | Examples | Slot | Who handles it well |
|---|---|---|---|
| **Sidearm** | Pistol, Hand Cannon, Machine Pistol | Primary or secondary | Everyone: low damage, but fast to reload and light to handle |
| **Specialised gun** | SMG, rifle, assault rifle, shotgun, LMG, sniper rifle | Primary | Gunners; anyone else takes a penalty |
| **Blade** | Knife, machete, sword, chainsaw (machine saw) | Secondary | Rippers: close-quarter damage at walls and gates |
| **Tool** | Toolkit, welder | Secondary | Engineers: a weak blunt weapon up close; mostly for repairing barriers and turrets, buffing turrets and crafting better batteries |

- **Profession from the loadout:** a blade makes a Ripper, a tool makes
  an Engineer, anything else (a specialised gun, or only a sidearm) makes
  a Gunner. Typical loadouts: Gunner rifle + pistol; Ripper pistol +
  knife; Engineer pistol + toolkit.
- **Gunner handling** *(starting points)*: a Gunner is better with every
  gun, sidearm included: fires 12.5% faster (15% before ID-125), reloads 25% faster and aims
  better (+5% crit chance, on top of the level's). A non-Gunner firing a
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
  non-Gunner rules above, rarity and affixes. A shotgun round is several pellets
  (the table's Pellets: 4 for the Pump Shotgun, 6 for the Drum Shotgun since
  ID-199), each rolling its own angle in the cone and hitting on its own for the listed
  damage (no distance falloff, one muzzle flash); the crit is rolled once per
  round, so all of a round's pellets crit together. The sniper rifle pierces one
  enemy by default; a pierce affix adds one more.

  | Gun | Damage | Every | Range | Magazine | Reload | Speed | Spread | Pellets | Pierce |
  |---|---|---|---|---|---|---|---|---|---|
  | Pistol | 6.2 | 0.6 s | 600 | 10 | 1.5 s | 1,800 | ±2.5° | 1 | 0 |
  | SMG | 4.5 | 0.17 s | 480 | 30 | 1.6 s | 1,600 | ±3.5° | 1 | 0 |
  | Carbine (was Rifle) | 7 | 0.4 s, in 3-round bursts | 750 | 21 | 2 s | 2,200 | ±1° | 1 | 0 |
  | Pump Shotgun (was Shotgun) | 10 per pellet | 0.8 s | 350 | 6 | 5.4 s, shell by shell | 1,400 | ±9° | 4 | 0 |
  | LMG | 6.5 | 0.22 s | 500 | 80 | 5 s | 2,000 | ±6° | 1 | 0 |
  | Sniper rifle | 38 (35 before ID-199) | 2 s | 1,100 | 5 | 3.5 s | 3,000 | ±0.5° | 1 | 0 (10% chance of 1) |
  | Hand Cannon *(sidearm)* | 20 | 1 s | 500 | 6 | 2.5 s | 2,000 | ±0.75° | 1 | 0 |
  | Machine Pistol *(sidearm)* | 3.5 | 0.08 s | 380 | 16 | 1.6 s | 1,600 | ±9° | 1 | 0 |
  | Assault Rifle | 8.8 (8 before ID-199) | 0.35 s | 500 | 30 | 2.2 s | 2,100 | ±2° | 1 | 0 |
  | Drum Shotgun | 3.5 per pellet | 0.6 s | 380 | 8 | 3.5 s | 1,400 | ±12° | 6 | 0 |

  As built since ID-135 (the roster rework, below); the ID-046 numbers were the
  first six guns' rows before it. The balance table that follows is ID-046's, kept
  as history.

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
- **The gun roster (as built, ID-135) *(starting points)*:** every gun was given
  a character by the project owner, and four guns were added. The ids in a save
  stay the same, so old saves load; two guns show new names (the Rifle is the
  **Carbine**, the Shotgun the **Pump Shotgun**).
  - **Pistol** — all-rounder; fastest reload of any gun.
  - **SMG** — high fire rate, mid reach (shorter than the Carbine), fast reload,
    decent accuracy; +25% damage near the wall (kept).
  - **Carbine** — long to mid range, accurate, ok damage; **burst fire**: 3
    rounds 0.08 s apart, then a pause, so its average time a shot stays the
    listed 0.4 s (DPS, Squad Power and the gun compare need no change); it keeps
    the Rifle's +10% crit chance (its "high accuracy"; Recommended Power and the
    stat caps, ID-125 and ID-128, were fitted with it, and without it Sharp Mind
    fell 26 points behind Agility).
  - **Pump Shotgun** — slightly slow fire, very high damage up close, short
    range; **loaded shell by shell**: one shell every reload ÷ magazine s while
    it is not full, each shell starting once the fire cooldown is over (so fire
    at the wall settles at the same DPS as emptying and refilling the
    magazine). It loads to full first and fires mid-load only at an enemy
    within 250 px of the wall's front (the SMG's "near the wall"). A hit
    **knocks back** an enemy near the wall 25 px.
  - **Drum Shotgun** *(new; specialised)* — a drum-fed shotgun: faster than the
    pump, less damage a pellet, a magazine reload, a bit more reach; the same
    near-wall knockback.
  - **LMG** — very fast fire (slower than the Machine Pistol), low accuracy,
    slow reload, high damage; **+8% crit chance** (zombies are already dead, so
    the old suppression slow is gone).
  - **Sniper rifle** — the highest single hit, slow fire and reload; **+20% crit
    chance and +×0.5 crit damage** (more than any other gun), **its crits ignore
    armour** (a non-crit hit takes a Brute's 3 off like any gun), and each shot
    has a **10% chance to go through 1 more enemy** (a pierce affix still adds
    its own).
  - **Hand Cannon** *(new; sidearm)* — slow fire, slow reload, high damage, very
    accurate; a hit **knocks back** the enemy 12 px at any range.
  - **Machine Pistol** *(new; sidearm)* — the fastest fire of any gun, fast
    reload, low accuracy, a small magazine.
  - **Assault Rifle** *(new; specialised)* — decent fire rate, reload and
    accuracy, high damage; +5% crit chance.

  **Knockback** (both shotguns and the Hand Cannon): once a shot, however many
  pellets land and in whatever step; a heavy kind (Brute, Swollen, Horror) half
  of it; at most 100 px an enemy in all, so steady fire can't hold it in place;
  never a Crawler on the wall, one inside the camp, or past the spawn edge. It is
  apart from Concussion Rounds' push and daze.

  The Hand Cannon and Machine Pistol are sidearms but owned items, not free like
  the pistol: horde drops picked evenly with the specialised guns, with rarity,
  affixes, gun levels and Combine like them, and, as sidearms, no off-profession
  penalty and either slot in the full game. Every win's drop is now an even pick
  of all ten guns: the Pistol drops too, never below **Military** (every survivor
  already has a free Common one, so a Rusty or Common drop would be no reward; a
  rolled Rusty or Common Pistol drops as Military, on every drop path, guaranteed
  upgrades included).

  Old saves: an LMG's slow affix (5–15%) is read as the crit affix the LMG now
  rolls (5 → 3% … 15 → 8%); every other affix reads as before.

  Art: each new gun has an icon, the model held in every survivor look (idle
  and aim) and its rarity tints, each passed by the art reviewer one gun at a
  time. The Drum Shotgun was drawn from the owner's description of a drum-fed
  shotgun as an edit of the Pump Shotgun's model, and the Machine Pistol (a boxy
  receiver, a threaded stub barrel, the magazine through the grip, a folded wire
  stock) from a text description of the owner's sample; no outside picture was
  sent to the image service. Sound: each new gun reuses the closest recording (no new
  file): the Hand Cannon the sniper rifle's (the heaviest single shot), the
  Machine Pistol the 9 mm SMG's, the Assault Rifle the 7.62 × 39 mm automatic
  rifle's (the LMG's), the Drum Shotgun the pump shotgun's.

  Balance (`balance/guns.test.ts`, the scenes above plus the ID-101 role scenes,
  the lone Common-gun Gunner; the shotguns', Assault Rifle's and Sniper rifle's rows are before ID-199's retune, below):

  | Gun | Close crowd | Far | Lane | Sustained | Boss with plates | Six held Brutes | Walking crowd, mean x |
  |---|---|---|---|---|---|---|---|
  | Pistol | 8.3 | 8.0 | 8.3 | 27.8 | 41 | 116 | 619.0 |
  | SMG | 28.3 | 8.6 | **21.5** | 65.8 | 127 | 326 | 619.0 |
  | Carbine | 18.0 | **17.9** | 18.1 | 53.8 | 87 | 227 | 619.0 |
  | Pump Shotgun | **30.2** | 0 | 12.0 | 60.8 | 153 | 474 | 665.3 |
  | LMG | 23.0 | 12.6 | 19.6 | **66.2** | 136 | 355 | 619.0 |
  | Sniper rifle | 12.4 | 12.4 | 12.5 | 34.6 | **372** | **527** | 619.0 |
  | Hand Cannon | 19.2 | 11.6 | 19.2 | 57.4 | 158 | 335 | 625.0 |
  | Machine Pistol | 21.5 | 0 | 14.3 | 60.4 | 148 | 167 | 619.0 |
  | Assault Rifle | 20.9 | 11.9 | 20.6 | 62.4 | 140 | 340 | 619.0 |
  | Drum Shotgun | 21.0 | 0 | 13.9 | 65.6 | 161 | 206 | **674.0** |

  Each gun leads its role: the Pump Shotgun up close, the Carbine far, the SMG
  in a lane, the LMG in sustained fire, the Sniper rifle on a boss (by a fifth or
  more) and on heavies, the knockback guns (both shotguns, the Hand Cannon) hold
  a walking crowd farther out than any other gun. No gun leads more than two of
  the four kill scenes, and no gun is strictly worse than another across the
  seven measures. Horde-only (`balance/horde-only.test.ts`, 20 seeds) still wins
  Hordes 4–10 at the first try on at least 60%.

  Tuning notes: the new sidearms first came in as true backups (Hand Cannon 14
  damage, Machine Pistol 3), and with two weak guns in every eight drops the
  horde-only squad fell to 35% at Horde 8 (a control with the Machine Pistol's
  slot dropping an SMG gave 75%, one dropping a second Hand Cannon 40%); the
  owner chose stronger sidearms. Damage barely moves the kill scenes (a 20-HP
  Shambler takes 4 hits from 5 to 6.6 damage), so fire rate is the lever; the
  Pump Shotgun's 8-pellet start had the highest DPS of any gun on paper while
  reaching 300 px, so the scripted squad equipped it and fell to 50% at Horde 8 —
  6 pellets and 350 px fixed that.
- **Shotgun retune (as built, ID-199):** on paper (damage × pellets × magazine
  over the time to empty and reload) the Pump Shotgun did ~30 DPS, about 30%
  above every other gun, and the Drum Shotgun ~23, the LMG's, with a faster
  reload; in a real fight the horde closes in, so short range held neither back.
  The two now differ in kind:
  - **Pump Shotgun:** 4 pellets of 10 (was 6 of 7) in a ±9° cone (was ±12°), a
    5.4 s full load shell by shell (0.9 s a shell; was 3.6 s): **~23.5 DPS**,
    under the LMG's 24.8 (its crit counted). Few heavy slugs in a tight cone: two
    pellets drop a 20-HP Shambler with nothing wasted, and Brute armour takes
    less of each. Its pellet affix adds **+1** (two on four pellets was +50%).
  - **Drum Shotgun:** a 3.5 s drum swap (was 2.5 s): **~20.2 DPS**, near the
    SMG and Assault Rifle. Six light pellets, the wide cone, fast fire and the
    quicker swap; the pellet affix keeps +1–2.

  Gun scenes before → after (`balance/guns.test.ts`; probe of the same scenes, "before" re-measured on main):

  | Gun | Paper DPS | Close crowd | Lane | Sustained | Boss with plates | Six held Brutes | Walking crowd, mean x |
  |---|---|---|---|---|---|---|---|
  | Pump Shotgun | 30.0 → 23.5 | 30.2 → 29.1 | 12.0 → 11.7 | 52.4 → 46.4 | 153 → 184 | 474 → 457 | 665.3 → 652.8 |
  | Drum Shotgun | 23.0 → 20.2 | 21.0 → 17.0 | 13.9 → 13.9 | 65.6 → 65.4 | 161 → 140 | 206 → 178 | 674.0 → 674.0 |

  The Pump Shotgun still leads a close crowd (29.1 to the SMG's 28.3), now by
  little; the LMG leads sustained fire by more; neither shotgun reaches far.

  **The others came up instead of the shotguns only coming down (owner's call):**
  with the shotguns alone cut, the horde-only squad (which equips the drops) lost
  offence: Horde 8 first tries fell from 17 to 12 won of 20 and Horde 6 injuries
  rose 1.35 → 1.95 a try. Two guns gained **+10% damage**: Assault Rifle 8 →
  8.8 and Sniper rifle 35 → 38 (paper DPS 19.8 → 21.8, 16.6 → 18.3). The rest
  stayed: the SMG would take the close crowd from the Pump Shotgun; the LMG at 7
  damage drops a 20-HP Shambler in 3 hits, not 4, and led the close crowd and
  the lane (29.7 and 23.8); the Carbine is the balance tests' reference squad's
  gun, and +10% on it, the Hand Cannon and the Machine Pistol too left the
  balance squads too strong (Hordes 3–4 stopped denting the wall, the Horde 15
  survivor-card fight stopped being close). The Pistol is the free gun.
  Horde-only first tries, 20 seeds, main → after: Horde 6 18 → 19 won (injured
  1.35 → 1.25), Horde 7 18 → 18, Horde 8 17 → 16, Horde 9 14 → 12, Horde 10
  16 → 18.

  Three balance bars moved with it (owner's call): Hordes 3–4 dent the wall on
  3 of 40 first tries, not 4 (main 5; every bump tried gave 3); farming near the
  wall gives more XP a minute on 8 of 10 seeds and over the seeds together, not
  on every seed (seeds 6 and 10 within 3%: 74.7 / 73.7 against 75.2 / 75.6;
  1044.9 against 651.2 over the ten); and a Barbed Wire level need not
  hold 5 points more than the one below once that one holds nearly all the
  fight (Horde 10: Lv 2 97%, Lv 3 100%).
- **Gun roles (as built, ID-101; kept by the balance pass, ID-102):**
  each gun has a role and a built-in trait every one of it carries, Rusty or
  Relic, plus role affixes only it rolls (below, in Gear). The Inventory, the
  drop tile and the gun picker name the role and trait ("Marksman: Fires 3-round
  bursts; +10% crit chance"); the slot's screen-reader label and the picker's description read it.
  A picker option reads "30.3 DPS · Lv 4 Prototype LMG · Shredder (role +6%
  crit chance)": the role right after the name, and in such a bracketed list a
  role affix is "role …"; listed one a line (Inventory, drop tile) it is "… (role)".
  Every DPS figure says whose it is (ID-166): the gun's own reads "22.6
  DPS" (ID-176: "DPS", not "dmg/s"; drop tile and lines, Inventory, Combine), a survivor's "26.7 DPS with
  Ivan" (their level and profession counted: the Roster's held gun, the Inventory
  beside the gun's own for a held gun, screen-reader labels). A survivor's gun
  picker keeps its options' figures bare so the gun's name keeps its room, under
  a caption "DPS with Ivan"; the Roster's gun tiles carry it in their hint.
  DPS counts the gun's own crit (its trait — the Carbine's, the Assault Rifle's, the LMG's, the
  Sniper rifle's, with the Sniper's crit damage — and crit and crit damage
  affixes), so ranking, stash-full discards and guaranteed upgrades see it; the
  situational effects (near-wall damage, knockback, a crit ignoring armour, the
  Sniper's pierce chance, boss damage, cone) are not in DPS. *(Examples and
  traits as since ID-135.)*

  | Gun | Role | Built-in trait | Role affixes |
  |---|---|---|---|
  | Pistol | All-rounder (Backup before ID-135) | Fastest reload of any gun (1.5 s, data) | +3–8% crit chance |
  | SMG | Swarm shredder | +25% damage to an enemy within 250 px of the wall's front (the outermost built layer's face; the player reads "near the wall") | +10–25% close-range damage, added to the 25% |
  | Carbine | Marksman | Fires 3-round bursts (ID-135); +10% crit chance | +3–8% crit chance, +20–50% crit damage (added to ×2) |
  | Pump Shotgun | Wall stopper | Loads shell by shell; a hit knocks an enemy near the wall back (ID-135; a short stagger before) | +20–40% wider cone, +1 pellet (ID-199; +1–2 before) |
  | LMG | Shredder (Suppression before ID-135) | +8% crit chance (a 20% slow before) | +3–8% crit chance (+5–15% slow before), +40–80% magazine (its own range of the general magazine affix) |
  | Sniper rifle | Boss and heavy killer | +20% crit chance, +50% crit damage; crits ignore armour; 10% chance to pierce (ID-135; it ignored armour and pierced 1 on every shot before) | +15–35% damage to bosses, mini-bosses and the heavy kinds (Brute, Swollen, Horror), +1–2 pierce (its own range of the general pierce affix) |
  | Hand Cannon *(ID-135)* | Heavy sidearm | Each hit knocks the enemy back a little (12 px) | +15–35% damage to bosses, mini-bosses and the heavy kinds (the Sniper rifle's affix) |
  | Machine Pistol *(ID-135)* | Close backup | Fastest fire of any gun (0.08 s, data) | +50–100% magazine (its own range of the general magazine affix) |
  | Assault Rifle *(ID-135)* | Assault | +5% crit chance | +3–8% crit chance |
  | Drum Shotgun *(ID-135)* | Crowd stopper | A hit knocks an enemy near the wall back (25 px) | +20–40% wider cone, +1–2 pellets |

  Since ID-135 the knockback and Shock Rounds' paralysis stack, but the
  knockback is capped at 100 px an enemy (`roles.test.ts`). Squad Power and DPS
  count a gun's own crit (its trait and crit affixes, the Sniper rifle's crit
  damage). An older save's guns keep their affixes (an LMG magazine roll below
  the new 40% still reads; an LMG slow affix becomes crit) and gain their trait,
  which comes from the base gun, not the save.

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
  opens it in the panel's place: each defender's level and XP, the level's bonus line
  (ID-146; stats and points to spend before) and rest time, and three pickers
  (primary, secondary, item). Swaps are free between hordes, injured or
  not; a loadout the rules refuse says why and changes nothing.
- **As built (ID-108), the horde-only Roster:** one compact dialog, as tall as
  what it shows (a tab of the one window since ID-183, see Inventory below: no
  bottom sheet on a phone and no title of its own any more). The Roster button carries no
  badge (ID-146: the number of survivors with points to spend before). The dialog has
  a header ("Best gun for everyone" and the close, in the window's header since
  ID-183), the squad tabs (rows of four,
  desktop and phone, since ID-187; one row on desktop before)
  (portrait, name, level, profession, and, as built ID-180, the held gun's icon on its
  rarity tint with their DPS in their hands; HP on hover and
  for screen readers), the selected
  survivor beside their gun slot,
  and one panel that is either **Level** or
  **Choose a gun**. A survivor's name on the result screen still opens that
  survivor here. Each card is two equal columns (ID-187), portrait and gun
  filling theirs without stretching, at most 100 px wide on desktop (bench cards
  too); on a 320 px phone the split is 2:3 so every profession stays whole.
  - **Level** *(ID-146; a Stats panel with + buttons, Undo and mid-fight
    spends before, ID-108, ID-116, ID-126)*: "Level 7" with the XP into it and
    what the next costs, the profession's benefit, the level's bonus line in
    full words (§6 Stats), and the stat table split into level and profession
    (§6 Professions, ID-149).
    The gun picker's way back is labelled Level.
  - **Choose a gun** (between hordes): tiles for the free pistol and every
    stash gun except the one held, strongest first by DPS in this
    survivor's hands (ID-152: their level and profession counted, as Squad
    Power counts them, so a Hunter's Sniper rifle can outrank a gun that
    hits harder on its own; the survivor's gun slot shows the same figure),
    each with its base gun, a rarity frame and a change badge against the
    held gun ("▲ +4.2", "▼ 1.1", "= same"; the symbol and number carry the
    meaning, colour is second). The hint under the tiles says whose DPS
    it is. It opens on the best upgrade. Above the tiles, the chosen gun is
    compared with the held one: a verdict in words ("Stronger: +8.9 DPS
    (+72%)" or "Weaker: …", in their hands too) with one Equip button, then
    Now, New and Change for DPS (in their hands, the row named "Ivan's
    DPS"), damage a shot (pellets
    shown as "4.0 × 6"), fire rate, reload, range, role and affixes, the change written out ("0.50 s slower",
    "200 px shorter", "new role"). Equip follows the same rules as the gun
    pickers: the stash holds 40 (20 before ID-122), the pistol is free and unlimited, and a gun
    is not given back for the pistol into a full stash (the reason is shown
    in the status line). In a fight the slot says guns change between
    hordes.
  - **Best gun for everyone** acts at once (ID-152): each gun is scored in
    the hands of the survivor who would hold it (DPS with their level and
    profession, as Squad Power counts it: a fighting job's own guns count for
    more). It keeps making the one change that raises the squad's total the
    most: a survivor takes a stash gun (theirs goes to the stash; the free
    pistol just goes), or two survivors trade guns. When no change helps, the
    bench does the same with what the stash has left (ID-188), trading only
    among itself: a bench survivor never takes a squad survivor's gun. A gun
    the bench gives back may suit the squad better, so the squad looks again,
    until neither changes; a second tap moves nothing. The status line says
    what moved, once per survivor from what they held to what they hold, the
    squad first, then the bench marked ("Equipped: Mara → Military SMG · Sam
    (bench) → Rusty SMG"; past four, the rest are counted, with how many are
    on the bench), or that everyone already holds the best gun they can get.
    A gun never goes into the stash for the pistol, so the stash never grows.
    (ID-108 to ID-149: the stash's strongest gun by the gun alone went to
    the weakest gun held, and survivors never traded.)
- **The start and result screens' survivor cards (ID-146)** *(off the panel since ID-196, §6)*: under the gun,
  a small line gives the level's bonus with short labels (§6 Stats), in the
  Level up badge's colour on a card that levelled this win; its XP line ends
  in "level up!". The hint over the cards
  reads "Tap a name for their card." (ID-126's "+N" badge, in-place stat
  block and Undo are gone with the points.)

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
  turret ±1°)*; a Gunner's is halved, and the level narrows it further (ID-146; Sharp Mind before)
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

**Levels give an all-round bonus (ID-146).** Levelling up makes a survivor a
little better at everything, a rookie growing into a veteran: no points to
spend and no stat buttons. (Before ID-146 each level gave 1 stat point to
spend by hand on Instinct, Agility or Sharp Mind, with Tinker locked; ID-084,
ID-096, ID-125 and ID-126 tuned that system. Its numbers and balance tables
are in the git history of this section.)

- Defender XP comes from hordes and from patrols (§10); both are full
  sources, so a defender can level by patrolling alone.
- Level L → L+1 costs 25 × L defender XP (ID-011), so a defender in every
  win reaches level 2 after Horde 2 and level 3 after Horde 4.
- **Six bonuses, every level, no input** (`LEVEL_BONUS` in the core): max HP
  (over the base 100, whole HP), armour (flat off each hit; a hit keeps at
  least half its damage), fire rate (every gun, sidearm included; not blades
  or tools), reload speed, accuracy (a narrower spread cone) and crit chance
  (every hit, gun shot or blade or tool strike; added to the Gunner's +5% on
  gun shots). Crit damage stays ×2 before guns and cards.
- **The bonus shrinks as levels go up** *(starting points, ID-146)*: with
  P = level − 1, each bonus with cap C is **C × P / (P + 20)**. Nothing at
  level 1, half the cap at level 21, never the cap, so a high level can't
  break a fight.

  | Bonus | Cap | Lv 2 | Lv 5 | Lv 7 | Lv 10 | Lv 15 | Lv 21 | Lv 30 |
  |---|---|---|---|---|---|---|---|---|
  | Max HP | +60 | +3 | +10 | +14 | +19 | +25 | +30 | +36 |
  | Armour per hit | 2 | 0.10 | 0.33 | 0.46 | 0.62 | 0.82 | 1.00 | 1.18 |
  | Fire rate | +30% | +1.4% | +5.0% | +6.9% | +9.3% | +12.4% | +15.0% | +17.8% |
  | Reload time | −30% | −1.4% | −5.0% | −6.9% | −9.3% | −12.4% | −15.0% | −17.8% |
  | Spread | −30% | −1.4% | −5.0% | −6.9% | −9.3% | −12.4% | −15.0% | −17.8% |
  | Crit chance | +20% | +1.0% | +3.3% | +4.6% | +6.2% | +8.2% | +10.0% | +11.8% |

- **What it replaced:** Instinct's injury dodge and damage near the wall and
  Sharp Mind's crit damage went with the stats; the six above are the
  ticket's list. A hit that drops a survivor to 0 HP injures them, with no
  roll.
- **The survivor card** shows the level in its header and what it gives on
  one line, every bonus as "+X stat": in the Roster "+14 HP · +0.5 armour ·
  +6.9% fire rate · +6.9% reload speed · +6.9% accuracy · +4.6% crit"; on the
  result and start screens' squad cards, short labels so a card stays two
  lines ("+14 HP · +0.5 arm · +6.9% fire · +6.9% reload · +6.9% aim · +4.6%
  crit"). A line breaks only between bonuses. At level 1 it says what levels
  bring: "Each level: more HP, armour, fire rate, reload speed, accuracy and
  crit" (shorter on a card). A win's XP line ends in "level up!" when it
  brings one.
- **Squad Power** (§11 Farming) counts the level's crit, aim, fire rate,
  reload and extra HP the way it counted the stats.
- **Old saves (v16 and older, ID-146):** points spent, unspent and banked
  are dropped as the save loads; each survivor's bonus comes from their level
  alone, so nobody is weaker than a fresh survivor of the same level. A save
  with anyone past level 1 shows a one-time note ("Survivor stats were
  reworked: stat points are gone, and each level now makes a survivor a
  little better at everything.").
- Patrol strength (§10) counts level and weapon only.
- **Balance (ID-146):** a first try, no grid, measured against the balance
  suite (every file green). The numbers keep a squad's damage per level about
  where the old scripted build (every point in Sharp Mind) had it up to level
  10, then grow more slowly; the extra HP and armour make up the rest.
  - A squad at Recommended Power, with the scripted player's cards: Hordes 9,
    12, 15 and 20 won 2, 4, 2 and 7 fights of 10 (target 2–8 each, a mean of
    3.5–6.5; mean 3.75).
  - The throwables canary's full-line scene moved from level-7 to level-9
    survivors: at level 7 the line won more and Frag Grenades led (19,
    Flashbang 16, Molotov 15 of 40); at level 9 Flashbang leads again (27,
    25, 24), the same thin margin as before (11, 9, 9).
  - The stat balance tests (each stat as strong a choice, ID-125) went with
    the stats.

### Professions (ID-149)

Each survivor has a **profession** from their life before the outbreak (not
the loadout professions above, which the horde-only build doesn't use). A
level gives the all-round bonus (§6 Stats) **plus** the profession's bonus.
Every profession bonus uses the level's curve, cap × P / (P + 20) with
P = level − 1: nothing at level 1, half the cap at level 21, never the cap.

| Profession | Kind | Good with | Cap (half at Lv 21) |
|---|---|---|---|
| Police officer | Fighting | Pistol, Hand Cannon, Machine Pistol, Pump Shotgun, Drum Shotgun | +36% reload speed, +36% fire rate |
| Soldier | Fighting | Assault Rifle, LMG | +30% accuracy, +30% magazine size |
| Hunter | Fighting | Sniper rifle, Carbine | +24% crit chance, +36% crit damage |
| Security guard | Fighting | SMG, Machine Pistol | +30% fire rate, +30% reload speed |
| Construction worker | Self (+ wall) | any gun | +70 max HP, +2.5 armour; +10% wall max HP while on the field |
| Paramedic | Self (+ squad, + camp) | any gun | +40% injury dodge; everyone on the field heals 0.4% of max HP a second; patches up the downed: 20 points at level 1, rising with level (30 at level 21, never 40), every Paramedic in the camp adding up (ID-155, under the bench and rest) |
| Student | Self | any gun | +100% own XP (levels faster, so stronger late), plus a tenth of the all-round caps |
| Chef | Squad | on the field | +20 max HP for every survivor on the field |
| Mechanic | Squad | on the field | the wall repairs 0.4% of each standing segment's max HP a second |
| Teacher | Squad | on the field | +30% horde XP for every survivor who fought |
| Scavenger | Camp | on the field | +30% bonus-gun chance after a won horde (added to the 50%) |

- **Same budget** *(starting points)*, counted in all-round caps (the
  all-round bonus is 6): a fighting job puts about 40% of it (2.4 caps) into
  its two specialty stats, 1.2 caps each, only with its guns; a self job gets
  about 25% (1.5 caps) with any gun; a squad or camp job spends its share on
  the shared effect. **Then measured (PM, ID-149):** fights are lost when the
  whole squad is worn down on the line, mostly with the wall still standing,
  so survival bonuses at the starting points barely moved a fight. The
  Construction worker got more HP and armour plus a little wall, the
  Paramedic a squad heal (always under First Aid Kits' first level, 0.5%/s),
  the Soldier and Security guard were trimmed to 1.0 cap a specialty, and
  the Student levels twice as fast at the cap. Every gun is covered by at least one fighting job (the
  Machine Pistol by two).
- **No penalty.** Everyone always gets the full all-round bonus. A fighting
  job with any other gun is exactly a plain survivor of their level.
- **Squad effects don't stack**, and count only from the field (the
  Construction worker's wall share and the Paramedic's heal too): with two
  Chefs on the field only the higher-level one counts. A Chef's HP is there
  while the Chef is on the field (gained HP comes with it; leaving takes the
  max back down). Teacher and Scavenger count when they fought the horde.
- **Injury dodge** (Paramedic): a hit that would drop them to 0 HP leaves
  them at 1 HP instead, by that chance, while above 1 HP. (ID-147's chance that
  their own injury rests a horde less is gone since ID-155: Paramedics patch
  up any downed survivor instead.)
- **Getting one:** each new survivor rolls a profession at random, every one
  as likely, repeats allowed (core RNG): one who joins after a win from that
  horde's seed, a new game's first survivor from its start time. Old saves:
  each survivor rolls one from their id and the save's time, the same each
  time it loads.
- **Squad Power** counts a fighting job's specialty with its gun, and the
  self jobs' stats, the way it counts the level's.
- **On screen:** each Roster tab (squad and bench) is two columns: the
  portrait beside the name, "Lv 7" and the profession (short names of 8 letters
  at most so they fit a 375 px phone: "Police", "Guard", "Medic", "Scav", "Mech",
  "Teach"), then the held gun's icon on its rarity tint beside the bare DPS in
  their hands (ID-180: the number the gun slot shows, ID-152; the free pistol
  shows as the pistol on the common tint). Up to 8 squad cards share the row on
  desktop; when the Roster is 460 px or narrower (a phone) the squad sits in rows
  of four, so 8 take two rows, none pushed off. The bench's cards are 84 px (a
  quarter of the row on a phone) and scroll. A ★ after the DPS marks a fighting
  job holding one of its guns (the gun picker's mark: the profession's bonus works),
  and the label adds ", suits a Hunter". A resting survivor shows "Rest N"
  in place of the profession. The tab's label ends "…, Lv 3 Military Rifle, 17.2
  DPS". Tabs redraw on every Equip, Best gun, Best squad, Auto, Combine, buy
  and outside change. The selected survivor's line says "Level 7 · Hunter · HP …"; on a
  phone the survivor and the gun slot share the row 2:3, so the gun's name
  always shows. Their panel highlights the profession's benefit in the accent
  colour ("Hunter: +12.0% crit chance, +18.0% crit damage with Sniper rifle,
  Carbine"; at level 1 "from level 2, more …"), greyed and struck out with
  "No bonus with this gun" when a fighting job holds another gun, and with
  "Only counts on the field. Doesn’t stack: Cole is also a Chef. Cole’s counts (higher level)." (whose counts only when the levels differ; for a
  Construction worker it starts "The wall part:", for a Paramedic "The heal part:", as
  their own HP, armour and dodge do add up) when
  another squad survivor has the same job with a squad or camp effect (the
  Construction worker's wall and the Paramedic's heal included). Under it the
  level's line, then a table of max HP, armour, fire rate, reload speed,
  accuracy, crit chance, crit damage and injury dodge: the total, the level's
  part and the profession's (a fighting job's part off its guns is struck out
  and left out of the total). A Chef on the field adds their max HP to the Max HP
  total of everyone on the field (ID-408), named under it: "(+11 Chef (Cole) on
  the field)"; in a fight the field is the fight, between hordes the squad that
  takes it, so the total matches the HP in a fight (the Roster tab says the same
  between hordes) and a bench survivor has none.
  The Roster's gun picker marks a fighting job's
  guns with ★ and says so under the tiles (its DPS counts the bonus since
  ID-152; before, it left it out).
  The start screen's gun picker stars them too, and the card says "No Hunter
  bonus with this gun" under the gun's role when the held one isn't theirs.
  The start and result cards read "Lv 7 · Hunter"; a first clear's newcomer
  asking to join reads "Lv 1 · Hunter · Pistol" (ID-150).
- **Balance (ID-149):** see the balance test (professions): each profession
  at the same level, a squad of 5 plain survivors and 1 of it (a fighting job
  with its own gun, the plain 5 with the reference Carbine): what it adds to
  the win rate over a plain survivor with the same gun must not land more
  than 12 points over the average (10 before ID-178; too strong fails; too weak is printed for
  a person to judge, PM's call: one survivor in six moves the win rate by
  less than 60 seeds can resolve); a fighting job off its guns never below a
  plain survivor. Measured at Horde 12, level 13, 60 seeds: Security guard
  +0.08, Soldier +0.05, Police +0.02, Mechanic, Teacher and Scavenger 0
  (their effects come after the fight or on a wall that rarely falls first),
  Construction worker, Paramedic and Chef −0.02, Hunter −0.03, Student −0.13
  (seed noise: it only adds); mean −0.01. The Barbed Wire check went from 2
  seeds to 6 (at 2 it swung from 1.0 to 0.84 on squad makeup alone).
  ID-178 (carried throws) moved the fights on these seeds: Police +0.12,
  Soldier and Security guard +0.02, Builder, Mechanic, Chef, Teacher,
  Scavenger 0, Paramedic and Student −0.02, Hunter −0.03; mean +0.01. Police
  at 10.9 points over the mean is under a seed of 60; trimming it to +30%
  broke the campaign checks (Horde 18 took 194 fights), so the PM raised the
  cap to 12 points instead.

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
  mutants wait for burning effects and mutants. A spare stash gun can be salvaged by
  hand too (Salvage, ID-207, under Gun upgrade).
- **As built (ID-067): weapon drops, stash and equip in the horde-only build.**
  Better guns are how the squad gets stronger.
  - **Drop:** every horde won drops one gun (SMG, Carbine, Pump Shotgun, LMG or
    sniper rifle, picked evenly; since ID-135 also the Assault Rifle, the Drum
    Shotgun and the sidearms, Hand Cannon, Machine Pistol and, at Military or
    better, the Pistol, which every survivor also has free). Never a blade or
    tool, which a survivor doesn't use. Its
    rarity comes from the horde's band *(starting points)*:

    | Hordes | Rusty | Common | Military | Prototype | Relic |
    |---|---|---|---|---|---|
    | 1–3 | 50 | 50 | – | – | – |
    | 4–6 | 25 | 45 | 25 | 5 | – |
    | 7–9 | 10 | 35 | 35 | 15 | 5 |
    | 10+ | – | 25 | 40 | 25 | 10 |

    Affixes roll as above. Duplicates are allowed. The drop is rolled from the
    horde's seed on a stream of its own, so the same seed drops the same gun at
    1×, 3× and 5× and however the fight went. Nothing drops after a loss.
  - **Bonus guns (as built, ID-122) *(starting points)*:** to soften the
    grind, every win, first clear or replay, then tries 2 more times, each at
    50%, to drop one more gun (about 1 more a win): a specialised gun picked
    evenly, at the horde's gun level, its rarity by the horde's band moved
    *down* one rarity (Rusty stays Rusty, so a band's Relic share becomes
    Prototype), so the lower grades come most and feed Combine. Their uids
    are the drop's with `-1` and `-2`. They roll after the drop on the same
    stream, so the drop itself is the gun it was before. Any of the win's
    guns that is an upgrade (ID-152: for some survivor, in their hands)
    resets the bad-luck count (§11 Farming). The result screen lists them under the
    drop, one compact row each (icon on its rarity's tint, level, rarity,
    gun, DPS, or "Thrown away"). At the worst luck the scripted player
    throws them away too.
  - **Stash:** the camp's armoury, shown as the stash. It holds 40 weapons
    (20 before ID-122; more slots for Scrap, as built ID-179, below). Each gun
    a win drops goes in in turn, the drop first: with 40 in it, the weakest
    of the stash and that gun is thrown away (it may be one of the win's own
    guns); a tie throws away the later one. "Weakest" is the
    lowest damage per second through a magazine and its reload (pellets,
    rarity and affixes counted), the gun's own DPS (the Inventory's
    figure; the pickers show a survivor's, ID-152). An older save's armoury
    past 40 is kept as it is and never grows. A save holds at
    most 52 owned weapons (40 in the stash, a gun in each hand of 6 survivors);
    with every slot bought (ID-179) `MAX_OWNED` allows 160 (80 in the stash and
    two hands each for the camp's 40 survivors).
  - **As built (ID-179): Scrap, squad slots and stash slots.** The horde-only
    build's currency is the existing Scrap stock (`stock.scrap`; "Parts" is
    the radio parts' name). It is earned two ways, with no RNG and no change
    to any fight: every win, first clear or replay, pays
    `SQUAD_SCRAP.base + SQUAD_SCRAP.perHorde × the horde's number` (10 + 5 ×
    horde; Horde 4 pays 30), and a loss pays nothing; and every gun thrown
    away from a full stash (a win's own gun too, or one a let-go survivor's
    gun pushes out) is salvaged for its rarity's `salvage` Scrap (Rusty 5,
    Common 10, Military 25, Prototype 50, Relic 100). The sum is capped at
    `MAX_COUNT` where a save reads it, and the screens show what was actually
    added. The balance is always on screen: a read-only chip ("Scrap 620", a
    live region, not a button) in the top bar left of the Roster button, on the
    page itself so it stays above the Roster and Inventory dialogs (hidden only
    under the intro). The result screen has a short chip ("+35 Scrap", the full
    "+55 Scrap (20 from salvage) · now 655" as its hover hint and in its lines),
    and the drop tile's thrown-away note ends "salvaged for 20 Scrap". Scrap buys
    slots, one purchase at a time, between hordes only, each after a confirm
    (the game's confirm panel, as Let go): a squad slot costs
    `SQUAD_SLOT_COSTS` (500, then 1,200), so the squad's cap goes 6, 7, 8; stash
    slots come `STASH_SLOT.add` (10) at a time at `STASH_SLOT.costs` (150, 250,
    400, 600), so the stash goes 40, 50, … 80. The Roster's squad row has the
    squad button ("+1 slot · 500 Scrap", with a bench) and the Inventory's stash
    heading the stash one ("+10 slots · 150 Scrap"); each shows progress and is
    greyed when short ("+1 slot · 120/1,200 Scrap", its tooltip "Needs 1,200
    Scrap"; the greyed look is dashed, its text still clearly readable), greyed
    with "Buy slots between hordes" in a fight, and
    gone once every slot is bought. A new squad slot is filled from the bench
    like any open one (highest XP first, then "Auto" if it is on). The caps are
    `squadCap(game)` and `stashCap(game)` (`GameState.slots`, the purchases
    made); `SQUAD_CAP` and `STASH_CAP` stay the base values, and keep driving
    the difficulty (`squadHpScale`), the joiners' chances and the balance
    fixtures: a bigger squad shifts fights only for a player who buys. A
    squad of 7 or 8 meets steeper enemy HP over Normal Hordes 31–50, and
    Recommended Power asks the same of it (ID-224, §11 Recommended Power), so
    the slots make late Normal a little easier, not a skip. The
    scripted player never buys. After a purchase the status line says "Bought 1
    squad slot · 500 Scrap spent, 120 left." (stash: "Bought 10 stash slots …").
    Help says "40 slots to start" and where each kind is bought. Numbers in
    these texts use thousands separators. At the worst luck (§11) the scripted
    player gets the win's Scrap only, no salvage for guns it keeps out of the
    stash. On a phone the Roster's eight tabs take two rows of four (the label row wraps).
  - **Equip** *(off the panel since ID-196: guns change in the Roster or with
    "Best gun for everyone"; the rules below still hold there)*: between
    hordes, on the start and result screens, each survivor
    in the squad had a one-click gun picker (a select; the pick applies and
    saves at once). It lists the free pistol, the stash's guns and the gun
    they hold, strongest first, each led by its DPS in that survivor's
    hands (ID-152: level and profession counted, as in the Roster) ("30.3 DPS ·
    Prototype LMG (+12% damage, +21% magazine)") so a closed select never
    cuts the number off; the full label shows on hover. A caption over the
    select, "DPS with Ivan", says whose the figures are (ID-166). The gun they had goes to
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
    the 3 weakest of the set by DPS, so the best one stays. Combine asks
    first: it shows the 3 guns used up as the grid's tiles (icon, rarity frame,
    level and DPS badges; a tile's tooltip and screen-reader name give its affixes)
    and what comes out as a tile with its name, "No affixes" or "1 random affix,
    rolled on combine", and its DPS, "before affixes" while they are still to roll
    (ID-198), with Confirm (read as "Combine into …") and Cancel (Esc cancels; focus
    starts on Cancel). After it, a status line names the new gun with its
    affixes and DPS ("Made: Common SMG, 14.2 DPS"), and the gun pickers
    update, and the new gun is selected; focus moves to that line (Cancel
    returns it to the Combine button). The result screen's drop tile stays a
    record of the win (its stash count then), so a combine on that screen
    doesn't change it. In a fight the set's count shows with Combine greyed out
    and no ▲ marks, and "Combine between hordes, on the start or result screen."
  - **The details hold still (ID-198):** the details are one fixed box, whichever
    gun shows, with nothing selected, and through a confirm and a combine (240 px
    beside the grid; on a phone 55% of the window's height under it). The gun's
    lines (or the confirm's tiles) scroll at the top; a dock pinned at the foot
    keeps one shape: "Equip on…" with one cell per survivor (a cell with nothing
    to do stays, blank; a held gun's Unequip sits in its holder's cell), then
    Combine's two-line status (the set's count, why not, or "Made: …"; longer is
    cut) and one button row. Combine fills that row and stays, greyed out, when it
    can't be pressed; the confirm's Confirm takes its first two thirds, under the
    pointer, and Cancel the last third. So a run of combines needs no pointer move
    in the details.
  - **The panel between hordes (a debrief):** the start, win and loss
    screens share one layout, 640 px wide, scrolling inside the window with
    the button pinned in a footer. At the top are the title and chips (waves,
    squad size, boss, "No XP on a loss", "No weapon drop on a loss"). A win
    then shows two tiles side by side: the weapon drop (rarity in its colour —
    Rusty copper, Common grey, Military blue, Prototype purple, Relic gold —
    a 56 px icon framed in that colour, the gun, its affixes, its DPS, the
    stash count, and any weapon thrown away) and the survivor joining (or
    "6/6 full"). *(ID-092)* The icon is the gun's own icon, as the
    Inventory's slots show it (the model the survivors hold, on its rarity's
    tint), decorative (empty alt text). When the full stash throws the drop itself away, the tile
    says "Stash full: thrown away" and "No better than any gun in the stash",
    and its icon goes grey. A loss shows a red callout saying where they got
    in. Below that is one card per survivor (on a win only those who
    levelled up, see below): name and level, on a win the XP
    it gave with a bar and a "Level up" badge, their gun select (bordered in
    the gun's rarity), and the level's bonus line (ID-146; on a win stat buttons
    before, ID-084). The loss screen keeps the cards, so guns can change before the
    retry. The footer says how a horde is lost.
  - **A win shows only who levelled up** *(ID-134)*: the result screen has a
    card only for each survivor who gained a level in that horde, so the
    level-ups stand out. Nobody else gets one, not a survivor whose only news
    is points left over from earlier hordes, nor the new survivor (the
    recruit tile names them). With no level-up, the Squad heading (and its
    stash count) has one line under it, "No level-ups this horde. Change guns
    in the Roster.", so the win's dropped gun still has a way in. Survivors
    without a card change guns and spend points from the Roster; a win's gun
    pickers are on its cards only, with no list for the rest. The loss
    screen is unchanged and keeps every card.
  - **A win at a glance** *(ID-186)*: the win screen is built to be read in
    a few seconds, desktop and tablet first. Nothing it said before is gone:
    the long lines wait behind one **Details** button.
    - **Chips** carry the numbers and what happened: waves, Scrap, the XP
      ("+126 XP each"; "+126 XP" for one survivor; "+98–126 XP" when they
      differ), each boss killed, then a chip for each sentence the win has:
      "Radio part 1/3", "1 patched up", "2 resting", "Auto: 2 in · 1 out",
      and, with nobody asking to join, "Camp 6 · nobody new" (or "· full").
      Those last chips are buttons that open the details, as "Details" does.
    - **Details** (closed on every new screen, not saved) show: the win's
      sentences as a list (boss reward, patched up, resting, Auto squad);
      the drop's role sentence, affixes and farm note; the camp tile with
      why nobody came; and on each card the XP count, the gun picker and the
      level's bonus line, with the hint and stash count over the cards.
    - **The drop** is one row: a 40 px icon, the kind chip, "Relic · Wall
      stopper" (rarity and the role's name), the level and name, and at the
      right the DPS over the stash count. Bonus guns stay as small rows
      marked "bonus"; a thrown-away line stays in sight, in the warning
      colour.
    - **Asking to join** is one row per survivor: name, "Lv 3 · Paramedic ·
      Pistol", what the profession brings, and Accept and Refuse at the
      right (40 px tall). "Refused survivors are gone for good." stays in
      the tile's head.
    - **Level-ups** are small cards: the name (still opens their Roster
      card), "▲ Lv 6" and the XP, the profession, and a thin XP bar.
    - **Width:** from 700 px the panel is up to 720 px wide, the title and
      chips share a row, and the drop, the join tile and the squad share the
      next (three level-ups or more take a row of their own). From 1000 px
      it is up to 760 px, or up to 1,120 px with someone asking to join or
      three level-ups or more. A phone stacks them, two cards across (one under about 340 px).
    - **One card size:** every card of a grid is the same size, as wide as
      its column and as tall as the tallest card, on the start and loss
      screens too; tiles that share a row are equally tall.
    - **The footer** (start, win and loss screens) is one compact bar: the
      skill as a small toggle (name and cooldown; its description is its
      tooltip), the horde select, the power and win-cost lines small beside
      it, and the button. It stays pinned in a short desktop window too; on
      a phone (480 px wide or less, or a window 500 px tall or less, as a
      phone on its side) only the button is pinned, as before (ID-169).
  - **One panel, one size** *(ID-196; replaces the layout, widths, tiles,
    cards and footer above where they differ)*: the start, win and loss
    screens are the same panel at the same size, with a win's Details open
    too: up to 640 px wide and 442 px tall (520 px on a phone, 480 px wide
    or less), never taller than the window less 128 px. That holds a win's
    weapons row over six squad cards, three to a row. From the top:
    - **Header:** the title, centred, over the reward pills, a win's
      Details button last. A win's title is "Horde 4 - You hold the line"
      (a replay adds "(replay)"; the finale keeps "The evacuation is
      called"), a loss's "Horde 4 - Camp has fallen"; the start screen's is
      the horde alone ("Horde 10"): its "Boss horde" and "Replay" pills
      say the rest, once.
    - **Body** (the only part that scrolls): a loss's callout; a win's
      sentences (with Details open) and its weapons; the Squad section;
      anyone asking to join; then the screen's line (how a horde is lost,
      or a loss's way on).
    - **Weapons** (a win): one chip per dropped gun, the drop first, then
      the bonus guns, three to a row. A chip has two columns: the gun's icon
      on its rarity's tint, then the level and gun ("Lv 4 Sniper rifle")
      over its DPS. Nothing says "First clear" or "bonus" on the chip. A
      gun thrown away (the stash full of better ones) is greyed and says
      "Thrown away" where the DPS was. A click on a chip shows that gun's
      details under the row (its kind and rarity, role and trait, affixes,
      then the stash count, anything thrown away and where to farm
      instead); a second click closes them. A caret at the chip's right
      says it opens, and turns up while its details show.
    - **Squad:** three cards to a row (two on a phone). A card has two
      columns: the avatar, then the name (it opens their Roster card), with
      a triangle pointing up after it for a level-up, or a "New" badge. No
      guns and no stats: the gun pickers, XP counts, bars, professions and
      level bonus lines are off the panel, and guns change in the Roster or
      with "Best gun for everyone". A win shows only who levelled up
      (ID-134); the start and loss screens show the squad.
    - **Asking to join:** one line under the squad for each, "Eli · Chef
      asks to join", then Accept and Refuse. What the profession brings is
      Accept's tooltip, and "Refused survivors are gone for good." is
      Refuse's; leaving with someone still asking asks first, as before. An
      answer stays as a line in its place ("Eli joined the squad"). With
      nobody asking, why is a sentence in the win's details. While someone
      asks, the header has an amber pill ("Asks to join", "2 ask to
      join"): the line can sit below the body's fold, and a click on the
      pill scrolls to it and puts the keyboard on Accept.
    - **Skills row:** the footer's first row, the skill toggles (name and
      cooldown) after a "Skills" label ("Skills (up to 2)" once there is a second one), with room for more.
    - **Start row:** three columns. The horde select, with the pick's
      power under it ("Power 815 · rec 242" and its band), then where to
      farm instead; the win cost ("Win cost:" and its pill, on one line);
      and the button ("Start Horde 7", "Replay Horde 5", "Retry Horde 5",
      with no boss suffix: the select says "Boss"). Readiness is said
      once: the select's options are short ("Horde 7 (new) · Boss",
      "Horde 5 · best to farm") and the select is as wide as its pick, no
      wider, so it never cuts them. On a phone the select with its power
      line, the win cost and the button each take a row.
    - **No radio:** the panel has no radio pill, no explanation and no
      word of it (ID-190 is undone here). A boss's first clear has a "New
      card: …" pill when it unlocks one, and "Boss horde beaten. New card
      unlocked: …" in the details.
    - **One stash count:** in a gun's details; the Squad heading has none.
    - **Pills:** a boss killed on a win is green ("Elite Brute (Roar)
      dead"), as the win's other good news; red stays for "Boss horde"
      on the start screen.
    - **A loss's line** is one line: "Retry Horde 5, or farm an easier
      horde: the squad and the wall are back at full strength".
    - **A level-up on the last kill** opens no pick: the fight is over, so
      the cards would change nothing, and the result is never drawn over an
      open "Level up: pick one".
    - A finger gets 44 px of each control (coarse pointers).
    - In a window 540 px tall or less (a phone on its side) the whole panel
      scrolls instead of its body, at the same size.

## 7. Turrets, energy and traps

### Turrets

- **Built before a horde** with materials, in build mode between hordes;
  they stay between hordes. A turret is jammed (condition 0), never
  destroyed, so a loss can't delete your build *(designer's call)*. They
  can't be built or bought during a horde.
- Fire automatically from mounts on walls and towers; an adjacent Engineer
  adds damage and fire rate (nothing scales it yet; Tinker would have, before ID-146).
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
  gives +15% damage and fire rate (not stacked)
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
    running while the game is closed. Faster crafting and better batteries
    (more charge) were to come from Tinker, gone with stat points (ID-146).
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
  reloads, +crit chance, +crit damage (ID-130), survivor armour and HP
  recovery (ID-131), scavenged ammo (ID-132).
- **Behaviour cards:** pierce, ricochet, incendiary rounds, shock rounds,
  concussion rounds, frag grenades, oil bombs from wall mortars (ID-132).
- **Barrier cards:** +layer HP, repairs, barbed wire out
  in the field, sandbags in front of the outer layer (ID-132).
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
  rules (Extended Mags from each gun's next reload; Barbed Wire's rows,
  broken or worn, are rebuilt at the new level's full durability, ID-123).
  Levels last the horde, like every card.

  | Card | Kind | Rarity | Lv 1 | Lv 2 | Lv 3 (max) |
  |---|---|---|---|---|---|
  | Speed Loaders | stat | common | Every squad gun's reload time **−10%** (it reloads in 90% of the time) | −20% | −30% |
  | Extended Mags | stat | rare | Every squad gun's magazine holds **×1.33** the rounds (rounded), from its next reload (a survivor who joins mid-fight, too: they come with a standard magazine loaded) | ×1.67 | ×2 |
  | Piercing Rounds | behaviour | rare | Each squad shot has a **25%** chance of +1 pierce, rolled on the fight's seeded RNG as it's fired (every pellet of a shot alike) | 50% | 75% (ID-124; was 35%, 70%, always) |
  | Ricochet | behaviour | rare | A bullet's first hit bounces one new bullet to the nearest other enemy within 150 px, at **10%** damage; a bounce never bounces | 18% | 25% |
  | Incendiary Rounds | behaviour | rare | The enemy hit burns **3%** of this wave's Shambler HP a second for 3 s (ID-124; was a flat 1 DPS); a new hit resets it at the new hit's rate, never stacks | 6% | 9% (was 3 DPS) |
  | Shock Rounds | behaviour | rare | A squad bullet hit paralyses the enemy for **0.2 s** (half for a Brute, Swollen or Horror): it stops moving and attacking, then carries on. No damage. A hit during a paralysis doesn't extend it, and after a paralysis ends the enemy can't be paralysed again for **1 s** | 0.3 s | 0.4 s |
  | Flashbang (ID-139; a skill before) | behaviour | rare | Throwable slot. Each survivor on the line carries **3** and gets one back every **10 s**, up to 3 (ID-178); the squad throws at most one every **1.5 s**, aimed as Frag Grenades is (within **600 px**, the most others within **100 px**, landing **0.6 s** later). It stuns (no moving, no attacking) every enemy within **100 px** for **3 s**. An enemy can't be stunned again until **3 s** after its stun ends, and isn't aimed at till then, so a group or a boss is never held for good. **Cost:** the squad's guns reach **15%** less while it is held (the glare). Its throws take no one's hands | 4 s | 5 s |
  | Molotov (ID-139; a skill before) | behaviour | rare | Throwable slot. Each survivor on the line carries **3** and gets one back every **12 s**, up to 3 (ID-178); the squad throws at most one every **1.5 s**, aimed as Frag Grenades is (within **600 px**, the most others within **50 px**, landing **0.6 s** later). It leaves a fire of **50 px** burning **4 s**, each second **10%** of this wave's Shambler HP to every enemy inside (`fireDps`). A fire overlapping an unlit Oil Bomb slick lights it (ID-181). **Cost:** enemies inside a fire move **30%** faster. Its throws take no one's hands | 6 s | 8 s |
  | Barbed Wire | barrier | rare | Coils strung across the field in the band **250–400 px** in front of the outermost layer, where most kills happen; enemies inside move **15%** slower; each row has **10** durability, more in a big wave, and is rebuilt at each level-up (more below) | 25%; 20 durability | 35%; 30 durability |
  | Aim for the Head (ID-130) | stat | rare | Every squad hit, any weapon, has **+5%** crit chance, added to the gun's own (the Rifle's trait, crit affixes), the level's and the Gunner's | +10% | +15% |
  | Hollow Points (ID-130; id `hollow-point-rounds`, as `hollow-points` is Heavy Rounds) | stat | rare | Every squad crit deals **+25%** of the hit more, added to the ×2 (and to a crit damage affix's share): ×2.25 with nothing else | +50% (×2.5) | +75% (×2.75) |
  | Kevlar Vests (ID-131) | stat | common | Every hit on a survivor on the line takes **1 HP** off, added to the level's armour; a hit still keeps half its damage (a Shambler's 5 is never under 2.5) | 2 HP | 3 HP |
  | First Aid Kits (ID-131) | stat | common | Every survivor on the line recovers **0.5%** of their max HP a second, up to max | 1% | 1.5% |
  | Sandbags (ID-132) | barrier | rare | The outermost built layer takes **10%** less of every hit (an enemy's blow, a Swollen's blast, a slab), shown as a low layer of bags on the ground in front of each standing segment of it | 20% | 30% |
  | Scavenged Ammo (ID-132) | stat | rare | Each squad gun shot has a **20%** chance not to use a round, rolled on the fight's seeded RNG (a whole shot: every pellet of a shotgun's) | 30% | 40% |

  **Epic cards are unique:** one level, which is max, taken once per horde.

  | Card | Kind | Rarity | Effect |
  |---|---|---|---|
  | Concussion Rounds | behaviour | epic | A squad bullet hit that leaves its enemy standing knocks it back **0.5 px per point of damage** dealt (after armour; about 3 px a pistol hit); half that for a Brute, Swollen or Horror. Never a Crawler on the wall, an enemy inside the camp, or past the spawn edge. After a push the enemy can't be pushed again for **0.5 s** (hits in that window still deal their damage), so steady fire pushes it at most twice a second, and each enemy is pushed at most **100 px** in all (ID-124), so steady fire can't hold it in place. Each hit that could push it (outside the 0.5 s gap, even once its push is used up) also **dazes** it for **1 s**: the squad's bullets deal it **+30%** (ID-137). The bullet that dazes deals its plain damage and any landing after it gains, the rest of a shotgun's pellets in the same volley too (with the daze starting a step later, the farming balance test fell off its knife edge); each such hit renews it, so steady fire keeps an enemy dazed. Turret bullets neither daze nor gain, and burns and blasts don't gain. **Cost (ID-137):** the squad's fire rate **−10%** while held (a blade or tool swings slower too) |
  | Frag Grenades | behaviour | epic | Each survivor on the line carries **3** and gets one back every **8 s**, up to 3 (ID-178); the squad throws at most one every **1.5 s** (ID-178; one every 8 s ÷ the survivors on the line before), as soon as an enemy outside the camp is within **600 px** of a survivor on the line. The target is the enemy with the most others within **70 px** (ties → nearest the wall, then lowest id), thrown by the survivor nearest it and aimed where it will be when the grenade lands **0.6 s** later. It bursts for **25%** of this wave's Shambler HP (ID-137; 35% before, ID-124; a flat 20 before that; armour doesn't reduce it) on every enemy within 70 px. The first throw comes as soon as the card is picked and an enemy is in reach. **Cost (ID-137):** a throw takes its thrower's hands for **1.5 s**: no shot before then, and the shot that was due waits that long too |
  | Field Repairs (research) | barrier | epic | **A skill (ID-231):** the pick adds a Field Repairs button to the skill bar, after the Airstrike and its Auto pill, and does nothing else (no repair, no cost, no wall glow). Using it (tap, click or key **F**, any time in a fight, with an offer or replacement open too; the fight held or not) sets every built wall segment to full HP, broken ones too, and glows the ones it healed. **One use per pick**; unused it stays across waves and never carries to the next horde. It is refused on a full wall (unbuilt slots don't count) and once the horde is over. **Cost (ID-137):** the squad's fire rate **−25%** for **5 s** of fight time after the use (the clock stops while an offer is open); it multiplies with Concussion Rounds'. The held cards strip counts it down on the card's chip, in the warning colour, and the chip goes back to plain when it ends |
  | Oil Bomb (ID-132) | behaviour | epic | Two mortars stand just behind the outermost built layer, one at each end of the wall (**36 px** back, **22 px** in from each end). Every **20 s** the one nearer the target fires a tar bomb at the enemy outside the camp with the most others within **90 px** (as Frag Grenades picks, within **600 px** of a mortar), aimed where it will be when the bomb lands **1.5 s** later. It leaves a tar slick of radius **90 px** for **10 s**: every enemy inside moves **60%** slower (multiplying with Barbed Wire, traps and the rest). **Synergy:** an Incendiary Rounds hit on an enemy in an unlit slick lights it, and so does a Molotov's fire overlapping it, whichever landed first (ID-181): it burns everyone inside for **20%** of this wave's Shambler HP a second, and burns out **3 s** later (gone, no slow). The first bomb comes as soon as the card is picked and an enemy is in reach. **Cost:** the slow shell and the long wait between bombs, and a lit slick burns out (PM, ID-132). Survivors don't fire it, so it is not a throwable and takes no one's hands |

  **Steady across hordes (ID-124).** Frag Grenades' burst and Incendiary
  Rounds' burn were flat (20 damage; 1, 2, 3 DPS), more than a whole
  Shambler early (16 HP at horde-only Horde 1) and a quarter of one late
  (84 HP at Horde 15). Like Molotov's fire (ID-114; a card since ID-139) they are now a share of
  this wave's Shambler HP on the fight's HP curve (`CARD.frag.share`,
  `CARD.burn.share`, `shamblerHp`): **35%** a burst (25% since ID-137), and **3%, 6%, 9%** a
  second. Piercing Rounds is a chance at every level, **25%, 50%, 75%**, and
  Concussion Rounds pushes each enemy at most **100 px** in all
  (`CARD.concussion.cap`). Measured with a squad at 70% of Recommended
  Power (the strongest at or under it), one card at max held from the start
  and no other, using its skills as the scripted player does, wins at
  Hordes 10 and 15 of 10 seeds: Frag Grenades at 50% won 8 and 5, at 35%
  2 and 3, at 20% 0 and 1. Over 20 seeds: Incendiary Rounds at max 1 and 4,
  Piercing Rounds at 75% 4 and 7, Ricochet at max 3 and 8; Sharpshooter
  (five picks), Concussion Rounds, Shock Rounds and no card won none of 10.
  Ricochet and Sharpshooter lose most seeds alone, so they are unchanged.
  The balance test `balance/cards-under-power.test.ts` checks each of these
  cards at max loses Hordes 10 and 15 on most seeds (at most 4 won of 10 seeds: the same seeds as the 10-seed runs above, the first 10 of the 20);
  the Horde 4 card test still passes with every card.

  **Crit cards (ID-130).** Aim for the Head and Hollow Points add to every
  other crit source: a hit crits at the gun's crit (the Rifle's trait, a
  crit affix) + the level's + the Gunner's + Aim for the Head's, and a crit
  deals ×(2 + a crit damage affix's + Hollow Points'). So the pair multiply
  with each other and with the level's crit and the Rifle (Sharp Mind before
  ID-146).
  Hollow Points is offered only while some survivor on the field can crit
  (`squadCanCrit`: Aim for the Head held, a level past 1, the Gunner, or a gun
  with crit), as a power card needs a turret: a fresh squad of pistols
  never crits, so the card would do nothing. Measured: in the Horde 4 card
  test (20 seeds, none wins 2) Aim for the Head wins 10, 14 and 20 at levels
  1–3 and kills further out each level; on top of Aim for the Head Lv 1,
  Hollow Points wins 14, 14 and 16. At 70% of Recommended Power each alone
  at max, and the pair both at max, win none of 10 seeds at Hordes 10 and
  15 (ID-128's harder late hordes: every card above also wins none now, and
  the balance test now applies Sharpshooter's +50% damage, which it held
  without its damage before).

  **Survivor cards (ID-131).** Kevlar Vests and First Aid Kits act only on
  survivors on the field (the bench neither heals nor is hit). Survivors are
  hit only by an enemy in the camp and by a Spewer's spit, so in a fight the
  squad wins cleanly they take nothing: measured once when the cards were
  built (ID-131; the numbers below can drift with later tuning, only the
  Horde 15 max-level comparison is a test), with the horde-only scripted
  player over 20 seeds, no survivor lost any HP at Hordes 4, 6 and 10; at
  Horde 15 with its expected squad (level 20 Military Rifles) the wall breaks
  late on most seeds, 240 of the squad's 600 HP is lost a fight and 14 of 20
  are won; at Horde 20 the squad is overrun (5 won). The pair are the last
  stand's cards: in that Horde 15 fight, held from the start at max, Kevlar
  Vests cut the survivors injured from 51 to 27 and won 19; First Aid Kits
  29 and 17; both together won 20. Levels 1 and 2 shave the injuries (Lv 1:
  47 and 50) but barely move the wins, and a fight already lost (Horde 20)
  isn't saved. At 70% of Recommended Power each alone at max still loses
  Hordes 10 and 15 on most seeds. The balance test
  `balance/survivor-cards.test.ts` checks the Horde 15 fight.

  **Offered only when the line is in trouble.** As commons that do nothing
  until enemies reach the survivors, the pair would crowd the cards a
  fight needs out of the offers: offered always, the horde-only build fell
  under its targets (Horde 8 won 55%, Horde 15 at Recommended Power 10%);
  offered once any survivor was scratched, Horde 9 still won 55% (main:
  65%). So each is offered only while a survivor on the line is **below
  half their max HP**, or one has been injured this fight (`survivorHurt`),
  as Patch Up waits for a damaged segment. Measured then: Hordes 4–10 won
  100, 100, 95, 80, 65, 60 and 85% at the first try (main: 100, 100, 95,
  80, 65, 65, 80). Once held, a card's next level is offered under the same
  rule. An injury counts for the rest of the fight, so after one the pair
  stay on offer even with the line back at full HP. The cost: a player
  can't take Kevlar Vests ahead of trouble.

  **Wall and ammo cards (ID-132).** Sandbags, Scavenged Ammo and Oil Bomb
  bring the horde pool from 20 to 23 cards. Oil Bomb was first a survivor's
  thrown tar bomb (Oil Slick); the PM made it a pair of wall mortars, so it
  stays out of the throwable cards and slows enemies much more than Barbed
  Wire, kept fair by its 20 s wait. Measured with the horde-only scripted
  player over 20 seeds (first-try wins, Hordes 4–10; main: 100, 100, 95,
  80, 65, 60, 85): with all three always on offer Horde 8 fell to **30%**.
  Taking each card out in turn showed Oil Bomb alone did it (65% without
  it), and ranking it low or not at all still left 40–45%: as an epic it
  takes offer rolls from Frag Grenades, not because it plays badly. So
  **Sandbags and Oil Bomb are offered only once enemies have reached the
  outer wall** (`outerWallHit`: a built segment of the outermost built
  layer below its max HP or broken), as Patch Up waits for a damaged
  segment: before that neither does anything. With the gate: 100, 100, 90,
  70, 70, 75 and 75%. Scavenged Ammo, a rare that works in every fight, is
  always on offer. The scripted player ranks Scavenged Ammo after Speed
  Loaders (ranked after Extended Mags, it was taken over better picks), and
  Oil Bomb and Sandbags after Barbed Wire.

  A half offer weight for Scavenged Ammo was tried and dropped: over 40
  seeds the horde-only squad won Horde 8 at the first try 55% with it at full
  weight and 38% at half (main: 48%; Horde 9 main 55%, so main's own mid
  hordes sit under the 60% target past the test's 20 seeds, ID-142). Any
  pool change re-rolls the scripted fights, and three balance tests moved
  with notes: the survivor cards' test plays 60 seeds and asks 10% fewer
  injured (25% over 20 before; Kevlar now −18%, First Aid −12%), the late
  hordes' "not every fight hits the wall" bar is under 98% (97%) and their
  longest fight may run 480 s (420 s; one close Horde 13 win runs 463 s), and the
  farming test compares Squad Power a minute over its three seeds together,
  as one lucky gun drop decides a seed.

  Field Repairs (a campaign research card) stays epic and unique (it is a
  skill the player uses when they choose, ID-231), and
  Heavy Rounds (research) stays once per horde with no levels.

  **Every epic card has a cost (ID-137).** Each epic card names its gain
  and its cost on the card, and no two share a cost: Heavy Rounds' reload
  time (ID-136), Concussion Rounds' fire rate while held, Frag Grenades'
  thrower pause, and Field Repairs' 5 s fire-rate dip (the table above).
  Before ID-137 Concussion Rounds, Frag Grenades and Field Repairs had no
  cost, Concussion Rounds had no daze, and Frag Grenades burst for 35%.
  Measured (wins of 20, one card picked and no other; `balance/epic-cards.test.ts`):
  - Horde 4, three fresh survivors with Pistols, the pick at the start: Frag
    Grenades 20 (the best pick), Incendiary Rounds 19, Sharpshooter 17,
    Concussion Rounds 16, Ricochet 15, Piercing Rounds 14, no card 2.
  - Horde 2, one survivor (40 seeds): Frag Grenades 7, Incendiary Rounds 6,
    Sharpshooter 5: its pause costs a lone survivor all its fire for a
    while, so its lead there is small (19 of 20 with no cost, against
    Sharpshooter's 5 of 20). A 2 s pause made it 2 of 40, not the best, but
    dropped the horde-only build's Horde 8 first-try wins to 40% (target
    60%) and failed four more balance targets, so the pause stays 1.5 s.
  - Horde 4, three survivors, the pick the moment the weakest wall segment
    falls to 30%: Field Repairs 20 (the best pick, with Frag Grenades 20),
    Incendiary Rounds 13, Patch Up 12. At 60%: Frag Grenades 20, Incendiary
    Rounds 17, Field Repairs 13, so it is not. (Those runs pick and use it
    at the same moment; since ID-231 the player may hold the use, so the
    balance test does the same to keep these anchors.) The scripted player
    uses it when the weakest built segment is at 30% or less, looking every
    5 s while it waits.
  - The starting points failed: at −10% fire rate Concussion Rounds won 1
    (8 with no cost; even −3% won 1), and pushing harder (2× push, 200 px
    cap) or slowing the dazed enemy 30% or 50% won 0–2: holding enemies back
    doesn't win these damage races. With the 0.5 s pause Frag Grenades won
    19–20 in every scene, a lone survivor 19 against Sharpshooter's 5.
  - Frag Grenades is still the best pick in every scene measured, and
    Concussion Rounds, a fair pick, the best in none, as Frag Grenades wins
    every squad fight; the PM accepted both (ID-137). The balance test
    checks Frag's lead for a lone survivor stays within 2 wins of 40, and
    Concussion Rounds wins at least 10 more than no card.

  **Heavy Rounds (ID-136): a trade-off, epic.** Squad damage **×1.38**,
  and every squad gun's reload time **+25%** (it multiplies with Speed
  Loaders and the survivor's own reload; the Pistol, 1.875 s, still
  reloads faster than any other gun, with or without it). The card reads
  "+38% damage, +25% reload time". It is **epic** and unique, like the
  other one-pick cards (Concussion Rounds, Frag Grenades, Field Repairs).
  Before ID-136 it was rare, ×1.4 with no cost: four Sharpshooter picks,
  multiplying on top of any held, so it beat every other damage pick.
  Measured (a lone survivor, one Common gun, 90 s of fire at held
  Shamblers, damage over no card): Heavy Rounds ×1.29 (shotgun), ×1.30
  (sniper rifle), ×1.31–1.32 (pistol, SMG, rifle, LMG), against ×1.30 for
  three Sharpshooter picks: about three picks on average, and three
  Sharpshooters beat it with the shotgun and sniper rifle, whose reloads
  are the biggest share of their fire. The steps still multiply with it
  (below). It is still unlocked by Horde 10's boss.

  **One ammo slot (ID-097):** the squad holds at most one of Incendiary
  Rounds and Shock Rounds; both stay in the pool all horde. Picking the one
  held levels it up; picking the other replaces it: the new card starts at
  level 1 and the old card and its levels are gone (it can come back in a
  later offer and replace the new one the same way, even when the held one
  is at max). New hits use the new card from the next shot; burns and
  paralyses already on enemies run out as they were.

  **One throwable slot (ID-139):** the squad holds at most one of Frag
  Grenades, Flashbang and Molotov, so the fight never turns into a
  throwing game; all three stay in the pool all horde. Picking the one held
  levels it up (Frag Grenades is unique: not offered again while held);
  picking another replaces it as the ammo slot does: the new card starts at
  level 1, the old card and its levels are gone, and the offer's red box
  says so ("Replaces Molotov Lv 2. Its levels are lost."; for Frag
  Grenades, which has no levels, "Replaces Frag Grenades."). One timer
  serves the slot: the first throwable throws as soon as it is picked; a
  swap or a level-up waits out the timer, then the new card throws.

  **Throws are carried, not endless (ID-178):** each survivor carries up
  to **3** throws (`CARD.throws.carry`); a throw uses one, and one comes
  back each `every` s of the held card (Frag Grenades 8 s, Flashbang 10 s,
  Molotov 12 s), up to 3. The survivor nearest the target who still carries
  one throws, and the squad throws at most one every **1.5 s**
  (`CARD.throws.gap`), so a full load bursts over a few seconds, then the
  squad must wait for throws to come back. The card text says so ("Each
  survivor carries 3 grenades; one comes back every 8 s"). Each horde starts
  with full loads. *Balance:* a 1 s gap spent the burst on a wave's first
  stragglers (Horde 8 first tries 55% won, below the 60% floor); 2 s hurt
  Horde 6 (1.85 injured a try, 1.25 on main); at 1.5 s Hordes 6–8 come out
  1.35/1.65/2.0 injured and 2/2/5 of 20 lost (main 1.25/1.95/2.45, 2/4/7).
  The scenes below moved: lone Molotov 10, Frag 3, Flashbang 0; pair Frag 3,
  Molotov 1, Flashbang 0; line Flashbang 31, Molotov 29, Frag 25 — each
  still the best pick on its own scene. Frag for a small squad lost the
  most (9 → 3 on the pair), as its burst lands on the first few enemies.
  Throws are the survivor's, not the card's: a swap to another throwable
  keeps what each carries and the refill under way (the refills after it
  come at the new card's `every`). A survivor who comes in for a downed one
  brings their own full load.
  Throws already in the air land as they were (a Flashbang's stun time and
  a Molotov's burn time go with the throw), and fires and stuns on the
  field run out as they were. Flashbang and Molotov are offered only while
  a group stands on the field (**12** enemies outside the camp,
  `CARD.crowd`), so they don't crowd early offers (ID-131); Frag Grenades
  keeps its epic rarity as its only gate.

  *Balance (ID-139, 40 seeds a scene, one throwable picked at the start,
  no skill):* a lone survivor at Horde 2 wins most with Molotov (11, Frag
  7, Flashbang 2); two fresh survivors at Horde 4 with Frag Grenades (9,
  Molotov 2, Flashbang 0); Horde 6's full squad on level 1 Carbines with
  Flashbang (11, Frag 9, Molotov 9). The skill's Molotov numbers (40% a
  second for 6 s, 5 fires every 30 s) thrown this often won every small
  fight, so the card's fires burn **10%** for **4/6/8 s**.

  **Repeatable cards (uncapped):** Sharpshooter (**+10%** damage a pick),
  Rapid Fire (**+7.5%** fire rate; +8% before ID-125), Long Sight (**+6%** range) and Reinforce
  (**+10%** of each segment's max HP at the start of the horde; the segment
  gains the same HP) are common and can be picked any number of times. The
  steps add (five Sharpshooters are +50%), then multiply once with other
  sources (Heavy Rounds, shop buffs, perks). They were ×1.2, ×1.15, ×1.15
  and +25% of the current max each, compounding (ID-022): five Sharpshooters
  were ×2.49.

  **Barbed Wire** (ID-077):
  enemies in its band move slower by its level's share, multiplying with razor wire traps and
  Screamers. Enemies wear it down (ID-090): the band is 10 rows, one per
  wall segment. Each row's full durability goes with the card's level (ID-104,
  `CARD.wire.durability`): **10** at level 1, **20** at level 2, **30** at
  level 3, and with the wave's size (ID-123): × the wave's enemies (a swarm
  wave's doubled count included) over **30** (`CARD.wire.perWave`; 60
  before ID-133) when that's more than 1, rounded. So a Horde 15 swarm wave
  of 208 gives a level 1 row 69, and each enemy of a big wave meets the same
  share of a row as one of a 30-enemy wave; smaller waves
  keep the level's number. The rows are rebuilt only at a pick of the card
  (ID-133): every row, broken or worn, goes back to its full for the new
  level and the current wave's size. At a wave break (as it starts) each
  row's full follows the new wave's size and the row keeps its wear as a
  share of its full, rounded: a broken row stays broken, a half-worn one
  stays half-worn, and a worn one never rounds down to broken. An enemy that
  already wore a row before a level-up still doesn't wear it again. Every
  horde starts the rows at level 1's full for its first wave. (Before ID-133
  each wave break also rebuilt every row to its full, ID-123; before ID-123
  a level-up added 10 to each working row, a broken row stayed broken for
  the rest of the horde, and nothing scaled with the wave.)
  Each enemy that enters a working row's band takes its kind's wear off that
  row (`CARD.wire.wear`), only once per row and never below 0: **1** for a
  Shambler, Runner, Crawler, Spewer or Screamer, **3** for a Swollen, **4**
  for a Brute and **10** for the Horror (a level 1 row on its own). A row at
  0 is broken until the next pick of the card (until the next wave break
  or pick before ID-133): it slows no one, the enemy
  that broke it included, while the other rows still slow. (It was 30 at
  every level and 1 for every kind, ID-090.)

  Measured (ID-104, under its rules, before ID-123's rebuilds and wave
  scaling), horde-only campaigns as the scripted squad plays them,
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

  Measured (ID-123), the same campaigns, 2 seeds, with Barbed Wire held from
  the start of each first try at Hordes 5, 10 and 15 (other offers of it
  turned down): the share of the **last wave fought** (the horde's last, or
  the one a lost first try fell in) its rows were working
  (time-weighted), with the rebuilds alone (no wave scaling) → with
  `perWave` 60.

  | Horde | Lv 1 | Lv 3 (max) |
  |---|---|---|
  | 5 | 92% → 100% | 100% → 100% |
  | 10 | 47% → 85% | 77% → 100% |
  | 15 | 43% → 94% | 86% → 100% |

  The rebuilds alone keep the wire whole through Horde 5 but not late
  waves; with the scaling a level 1 row holds a comparable share of the last
  wave from Horde 5 to 15, and level 3 holds all of it. A `perWave` of 20 or
  40 kept the rows nearly whole at every level (99–100% of the last wave),
  leaving nothing to level up for. The balance test `balance/wire.test.ts` checked level 1's
  last-wave share at Hordes 5 and 15 (at least 75% each, within 20 points of
  each other; replaced in ID-133, below). In the Horde 4 card test levels 1, 2 and 3 now win 9, 11 and
  12 of 20 (no card 2) and kill a mean 163.1, 162.5 and 173.4 px out (no
  card 156.1): no row broke there under ID-123, so levels 1 and 2 differed only
  in slow and their kill distances were within noise; the test checks
  that each level kills further out than no card and max further than
  level 1, with wins never falling by level.

  Measured (ID-133), the same campaigns and seeds, with Barbed Wire held at
  one level for the whole first try at Hordes 5, 10 and 15 (offers of it
  turned down, so the rows are never rebuilt): the share of the last wave
  fought / of the whole fight its rows were working (time-weighted).
  Before ID-133 (rebuilt at every wave break, `perWave` 60) level 1 held
  71–100% of the last wave (ID-123, ID-128), so levelling added little.

  | `perWave` | Horde | Lv 1 | Lv 2 | Lv 3 (max) |
  |---|---|---|---|---|
  | 60 | 5 | 55% / 87% | 96% / 99% | 100% / 100% |
  | 60 | 10 | 0% / 32% | 9% / 55% | 29% / 72% |
  | 60 | 15 | 0% / 23% | 2% / 51% | 10% / 60% |
  | **30** | 5 | 65% / 89% | 99% / 100% | 100% / 100% |
  | **30** | 10 | 11% / 52% | 70% / 90% | 96% / 99% |
  | **30** | 15 | 0% / 38% | 59% / 88% | 97% / 99% |
  | 20 | 5 | 85% / 96% | 100% / 100% | 100% / 100% |
  | 20 | 10 | 45% / 76% | 100% / 100% | 100% / 100% |
  | 20 | 15 | 3% / 54% | 96% / 99% | 100% / 100% |

  Without the break rebuilds, 60 left even a max-level row gone before the
  last wave from Horde 10; 20 made levels 2 and 3 alike. At **30** each
  level holds clearly more than the one below: level 1 wears out over a
  late horde, level 2 holds most of it and level 3 nearly all, and a
  level-up mid-horde rebuilds the rows on top. `balance/wire.test.ts` now
  checks: level 3 holds at least 85% of the last wave fought at Hordes 5,
  10 and 15; level 1 at least 75% of the whole Horde 5 fight; at Hordes 10
  and 15 each level at least 5 points more of the whole fight than the one
  below; and level 1 under 50% of the last wave there. The Horde 4 card
  test passes unchanged.

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
  Hordes 1–3 are sure wins (enemy HP eased, §5 and §9; ID-163: Horde 3 may
  dent the wall on a few seeds, still won), Hordes 4–7 are won
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

- **Card pick: Reroll, Skip and Ban (ID-210).** Three buttons sit under the
  cards on every pick (in the heading's row on a window 540 px tall or less),
  each with a key beside 1 2 3 (a dim key hint on each button, hidden on a
  touch screen). All counts are per horde: a new horde starts
  full and nothing carries over (`REROLL`, `BAN` in `data.ts`).
  - **Reroll** (R, "Reroll · N", greyed at 0): replaces all three cards with a
    new offer. **3 a horde**, plus a Skip's, plus Second Look's (§5): the
    perk's rerolls add to the 3 and are spent from the same count.
  - **Skip** (S, "Skip · +1 reroll", free, unlimited): takes no card, closes the pick (the XP
    stays spent, the level gained) and gives **+1 reroll**. Banked XP opens
    the next pick as after a card. S is the 3× speed key; while a pick is open
    it is Skip instead; R S B are ignored for the first **300 ms** of a
    pick (`OFFER_KEY_GUARD_MS`), so a tap on S for speed as it opens can't skip
    a card unseen (clicks are not delayed).
  - **Ban** (B, "Ban · N", greyed at 0): **1 a horde**. Tap Ban, then a card
    (or 1 2 3; the heading reads "Ban which card?"): that card leaves the offer and is **never offered again this
    horde**, rerolls and later picks included, and a new card takes its slot;
    the pick stays open. Ban again cancels. A recruit card can't be banned
    (it greys out in ban mode).
  - **Seeded:** the fight's RNG makes every new card, only when a button is
    used (a pick answered with a card draws nothing extra, so the balance tests'
    scripted player, which never uses the buttons, moves nothing). The same
    seed and the same choices deal the same cards. A reroll and a ban follow
    the offer's own rules: never a maxed or locked card, never the same card
    twice in one offer, at most one recruit, Hollow Points only while the squad
    can crit, a card pool's limits.
  - **A short pool:** when bans or the fight's card pool leave fewer than
    three cards, the offer is shorter (a ban with nothing left to fill the slot
    leaves it empty). An empty pick keeps its heading, says "No cards left to
    offer" above the buttons, and Skip closes it.
    Nothing crashes and nothing loops. Auto-picking never uses the buttons.
  - Not saved: a fight in progress is never saved (§12), so the counts and
    the banned cards live in the fight only.

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
    green glob arcs to it and splashes there, 0.3 s in all (art: ID-118).
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
  count waits out the stun too. The HUD marks a boss horde on the base view's start button ("Boss horde"; the Horde panel says it with its pill and the select's "Boss") and
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
    be fitted to it. A squad over 6 (ID-224, `SQUAD_BIG_HP`): a squad of 8
    meets ×1.0725 a horde over Hordes 31–50 instead (×1.12 at Horde 40,
    ×1.26 at 50, held from there on into Nightmare and Hell), a squad of 7
    half the step in the exponent; a squad of 6 or fewer is unchanged. For 7
    and 8 the HP then outgrows the gun level's ×1.06 over those 20 hordes
    (the ID-102 match), by at most that ×1.26.
  - **Swarm waves:** from Horde 5, 25% of a horde's waves (at least one), +1% a
    horde, at most 50%, spread evenly back from the last wave, which always
    swarms (Horde 5: wave 7; Horde 9: waves 4 and 9; Hordes 11–19: 3, 7 and 10;
    Horde 30: 2, 4, 6, 8 and 10). ID-102: counted from wave 1 before (Horde 5:
    wave 4; Horde 9: 4 and 7), so with wave sizes held from Horde 10 a growing
    share slid the swarms onto smaller waves and Horde 14 brought less HP than
    Horde 13. A swarm wave spawns 2× the enemies at twice the rate (the same time),
    with Runners at 2× their share (Shamblers give way). The warning (ID-121), in
    the field's upper middle: through the 3 s break before it, "Swarm incoming"
    with a 3-2-1 countdown, held still; when it hits, "Swarm!" bigger and solid
    red for its first 3 s, a red glow at the field's top and side edges for its
    first 8 s, timed apart from the banner (ID-175; clear of the wall and kept
    faint at the spawn edge so incoming enemies stay readable),
    and a siren (three rising whoops over a drone; two blares before ID-121). The
    fight corner's wave line reads "Swarm · Wave n/m" in red from the break until
    the swarm wave ends: its last enemy down, even after the counter has moved on
    to the next wave (waves overlap). With Reduce motion (the game's setting or
    the system's) the banner and glow hold still.
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
    Horde 4 previews it (ID-163, `ELITE.preview`): an elite Brute with Roar
    with the first spawn of its last wave, at 2.5× its HP, so the wall is
    threatened before Horde 5's (20 seeds, first try: Hordes 3–4 dent the wall
    below 95% on 5 seeds, against 2; all still won). Grid: 2× dented Horde 4 on
    2 seeds; 3× and 4× on 3 and 8, but took more of its wall on average (3.1%
    and 4.8%) than Horde 5's (1.9%); 2.5× takes 2.2%.
    From Horde 11 (ID-128, `ELITE.more`) every horde but a boss horde brings
    one more with the first spawn of its last wave, its kind and skill the next
    in turn after the middle one's (an odd horde's two always differ in kind):
    Horde 11 brings two, Horde 12 one (an elite Brute with Regen).
  - **Shorter fights (ID-128).** From Horde 6 (`SQUAD_PACE`, when the
    squad is full) enemies spawn 0.6 s apart (0.8 s in the full game and
    before Horde 6), and the next wave comes before the field is clear (since
    ID-171 the overlap ramps: see the pacing table below; from Horde 8 it comes
    once the current one has all spawned, after its 3 s break); the
    last wave still has to be cleared to win, and a mini-boss's wave still waits
    for it. Before, each of 10 waves waited about 28 s for its last enemy to
    walk in and die, about 310 s of a Horde 15 fight. Before Horde 6 waves wait
    for a clear as before: with overlap a lone pistol was buried at Horde 1
    whatever its HP (0–30 of 60 seeds won with first-card picks; 60 of 60 on
    main and now).
    - **Wave pacing table (ID-171).** Spawn gap, break and overlap now live in
      one table, `SQUAD_PACE` in `src/core/pacing.ts` (`FULL_PACE` for the full
      game): each row holds from its horde on, so a horde that comes too slow
      or too fast is retuned by editing one row. `overlap` is a share from 0 to
      1: 0 waits for a clear, 1 brings the next wave once this one has all
      spawned (the ID-128 rule), and in between the next comes once at most that
      share of this wave's size is still standing. Overlap used to arrive in
      full at Horde 6 with the Spewers, and Horde 6 went from 20/20 first-try
      wins to 13/20, every loss downing all six. It now ramps: 0.5 at Horde 6,
      0.75 at Horde 7, 1 from Horde 8, all 0.6 s apart (20 seeds, first try:
      Hordes 5–8 won 20, 18, 16, 13; injured a try 0, 1.25, 1.95, 2.45).
      Wherever overlap jumped straight to 1 that horde was the cliff (ramping
      0.25 and 0.6 first moved it to Horde 8, 11/20). Recommended Power still
      counts only spawn time, so a partial overlap's longer fight makes it ask
      slightly more than needed.
    - **Retuning it (ID-172).** `npm run tune:pacing -- [--apply] [from] [to]
      [candidates]` (default Hordes 5–8, 16 candidates, Node 22.6 or later)
      plays the horde-only balance test's 20 seeds and prints, for each horde,
      first-try wins and losses, injured a try, wall loss and the injury
      forecast's few/some/heavy split, against ID-171's targets (a horde loses
      at most 4 more first tries and adds at most 1.5 injured a try over the
      one before; "some" squads mostly win). Where a horde misses, it moves one
      knob at a time halfway across the step (that horde's overlap or interval
      slower, or the horde before's faster), keeps the best table, and repeats
      until every horde passes or the candidates run out, then prints the
      suggested `SQUAD_PACE` with its numbers, or the closest one. Tables keep
      `pacing.test.ts`'s rules and prefer the smallest change; a table that
      stalls a campaign is skipped. Only the default range is the balance
      test's (it also wants some squad in "some"); the tool notes when a
      result can't vouch for the test. A candidate takes
      about 40 s, so a default run is about 10 minutes, under `nice -n 19` in
      one process. Candidates are swapped in memory; without `--apply` it only
      prints. With `--apply`, a table that meets every target, with no note, is
      written into `pacing.ts` itself: its rows and the measured numbers above
      them inside `SQUAD_PACE`'s brackets, nothing else in the file (a table
      already passing just has its numbers refreshed). `pacing.test.ts` pins
      only what the default range can't move (Hordes 1–4 wait for a clear,
      full overlap by Horde 10), and the horde-only balance test holds the
      targets, so an applied table needs no test edits; check the diff and run
      the suites before committing, and update the numbers quoted above.
    - Enemies carry the wave they came with. Waves cleared (the top bar's
      "Waves cleared", a loss's XP share) counts only waves that have all come
      with none of their enemies left; the top bar's count reads "N left" (all
      standing and still to come), not "N left in this wave".
    - The wire's full at a wave break (resized, wear kept, since ID-133; rebuilt
      before it) and at a level-up is sized for every enemy still to face when
      that is more than the wave (the last wave's still standing too).
  - **Skills.** Each timed one winds up for 1.2 s first: the boss glows in the
    skill's colour, leans back and swells, a low growl rises, and its boss bar
    says "Roar!". A stun hides the wind-up and holds every clock.
    - **Roar:** every 14 s, the other enemies within 300 px move 40% faster for
      4 s (an amber ring under each).
    - **Slab Throw:** every 16 s, from at least 150 px out, a concrete slab
      that lands 0.6 s later: with Barbed Wire it breaks the working wire row
      nearest the boss's row (ties: the upper one; it's rebuilt at the next
      pick of the card, ID-133, and a slab still in the air when a wave ends
      breaks its row too; before ID-133 the next wave break rebuilt it and such
      a slab landed without breaking it, ID-123), else 300 damage to the
      outermost wall's standing segment nearest it.
    - **Armour Plates:** steel plates on its body; bullets do half damage until
      25% of its HP is gone, then they're gone for good (regen doesn't bring them
      back). A Sniper rifle's rounds go through them (the hook ID-101's
      armour-piercing builds on). Looks (ID-211): generated frames, not shapes
      drawn over the sprite. The Horror and the elite Swollen wear tan army
      plates (a plate carrier, a curved plate over the hump or belly, a shoulder
      pad); the elite Brute keeps its riot gear and carries a tan steel riot
      shield, slung on its back as it strikes. Once they break, each shows a
      broken look (torn straps and an empty vest; the Brute a shield scrap on
      its hand), and the plate pieces burst out under it and lie flat on the
      ground, fading over 1.6 s. Each look has the kind's walk and attack
      frames, at its scale and on its feet; it dies in the look it had. The
      Horror's attack is a wind-up (the arm swung up and back behind its head).
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
- **Party strength** = defender levels + weapons, plus profession
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

### Horde-only build: the World map (ID-219)

The shipping build has its own small slice of this section, apart from the full game's
patrols above (no plazas, car, orders or deaths). Numbers are starting points, to tune
(`AREAS`, `DANGERS`, `MAP_PATROL` in `core/data.ts`).

- **The map:** a World map tab in the camp window (opened from the start screen's World
  map button, which shows "World map · 2 out" and a mark when a report is ready) shows 4
  areas, each kind once, drawn from the core RNG with the map's seed. Each card shows the
  area's picture, name, danger, trip time and its two drops with the chance per member.
  When a patrol's report is taken its area is replaced by a new kind not on the map; areas
  with no patrol stay until searched.
- **Areas:** Police station (mostly weapons, sometimes Scrap), Military depot (weapons one
  rarity step better, blueprints), Pharmacy (Medicine 1–2, Scrap), Hospital (Medicine 2–4,
  blueprints), Hardware store (Scrap, blueprints), Electronics store (blueprints, Scrap). A
  find is "mostly" 3 times in 4.
- **Danger:** Safe 30 min, 40% a roll, replay rarity at the best horde, 25% of a win's XP,
  a Scrap find half a win's Scrap; Risky 1 h, 60%, one step up, 50%, one win's Scrap;
  Dangerous 2 h, 80%, two steps up, 100%, one and a half. The best horde is the strongest
  beaten on any mode (at least 1), fixed when the patrol leaves.
- **Team:** 1 to 4 fit bench survivors, one patrol per area, several areas at once. Team
  power is the members' Squad Power shares (level and gun, as the squad's). The danger asks
  for 1, 2 or 3 survivors at the best horde's Recommended Power per squad survivor; the
  ratio of power to that sets each member's injury chance, 70% / (1 + 3.25 × ratio²), and
  adds up to 15% to each roll's chance (full at a ratio of 2, at most 95%). The picker
  rates the team Safe (ratio 1.5+), Risky (0.75+) or Dangerous, live as members are picked.
- **Away:** members on patrol can't fight, swap in, join the squad, be let go or
  combined, and earn no bench share. On the Roster (ID-234) each patrol out is a block of
  its members' cards, the soonest back first, under a header in the World map card's words:
  "Patrol 3 · Pharmacy", "Back in 42 m" (then "Back · report ready"), and "Risky · 1 h ·
  Finds Medicine, Scrap"; a member's own card names the patrol ("Patrol 3 · Pharmacy").
- **Report:** on return each member rolls for an injury, then once for loot (a gun by the
  existing drop rolls, uid `m<no>-<k>`, into the stash, a full stash throwing away and
  salvaging the weakest; a blueprint, lost at the cap; Scrap; Medicine, kept up to 999).
  Every member earns the XP, injured or not; the injured rest as if downed in a won fight.
  Everything is rolled from the patrol's seed, so a reload gives the same report, and it
  pays once, on OK, between hordes. It opens by itself on the start screen when a patrol is
  back. Time is real time, also with the game closed. Time that runs backwards counts as 0:
  a clock set back (even while closed, against the save's time) moves every trip back as
  much, so it keeps exactly the time it had left and never finishes early. A clock set
  forward can't be told from real time passing, so it does shorten a trip. A Paramedic out
  on patrol patches nobody up, and a gun out with its holder can't be taken back meanwhile.
  The scripted player in the balance tests does not patrol.
- **Save v25:** `map` (seed, draws, 4 areas, the patrols out) and `medicine`, each written
  once there is one; an older save loads with a fresh map and no Medicine.
- **Medicine (ID-220):** between hordes, a resting survivor's Roster card has **Treat · 1
  Medicine** (`TREAT`): one Medicine ends the whole rest, so they can fight the next horde at
  full HP; with none in stock it reads "No Medicine", greyed. Hidden for anyone not resting
  (one downed mid-fight rests only once the fight ends), greyed mid-fight; allowed on the
  result screen, whose debrief still reports the fight as fought. "Auto" re-picks the squad.
  The patrol's injured are treated the same way once its report is taken. No save change.
  The scripted player in the balance tests does not use Medicine.

## 11. Resources and research

| Resource | Main source | Spent on |
|---|---|---|
| Scrap | Patrols | Building, repairs, crafting, turret maintenance |
| Parts | Patrols (electronics, military) | Turrets, maintenance, batteries, weapon rarity |
| Building materials (wood, metal, concrete) | Patrols (hardware, construction) | Barrier tiers |
| Gas | Patrols (gas station) | Generator (recharges the battery bank), car (faster patrols) |
| Batteries | Patrols, crafting | Turret energy |
| Food (snacks count as Food) | Patrols (supermarket, gas station) | Injury recovery |
| Medicine | Patrols (pharmacy, hospital) | Injury recovery (faster than Food; horde-only: 1 ends a rest, ID-220) |
| Chemicals | Patrols (pharmacy, hospital) | Chemical traps (slow, burn, corrode, paralyze) |
| Mutated Genes | Hordes, especially mutants and bosses | Research |
| Defender XP | Hordes, patrols | Defender levels → the all-round level bonus (ID-146) |
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
  - Skills: Airstrike 60, 1 h (Lab 2), with no earlier node since ID-139.
    *Before ID-139:* Flashbang 10, 15 min; Molotov 20, 30 min (after
    Flashbang); Airstrike after Molotov. Those two are cards now (§8); a
    save's research or queue that holds them loads without them (no Genes
    back).
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
    45 min (epic, once: +38% damage, +25% reload time, §8; before ID-136
    it was rare, +40% damage with no cost); **Field Repairs** 80, 1 h 30 min
    (Lab 2; epic, once: every wall segment to full HP, −25% fire rate for
    5 s, §8; before ID-137 with no cost). In the horde-only
    build they come from the boss hordes instead (ID-127, Start and pacing).
  - Camp: **More cars** 150, 2 h (Lab 2): a second car.
  - Perk levels share the queue (§5). The whole tree, levels included,
    costs about 4,300 Genes (about 4,270 since ID-139 took Flashbang and
    Molotov out): Horde 10's Genes buy Metal walls, Flashbang (before
    ID-139) and Perk slot 2 even with no mutant killed (about a dozen nodes when
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
- **Horde-only (ID-220):** rest counts hordes, not time; 1 Medicine clears the whole
  rest (one horde) instead of cutting time, and Food is not used (see the World map
  section).
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
  level's bonus (ID-146; its stat points rolled before), a name from the recruits' list and
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
- **Survivors:** each horde won brings one survivor, who asks to join (since
  ID-150; before, they joined with no accept step). No camp slot or recruit
  card. The squad cap is 6 (ID-067 adds the weapon drop); past it, the bench
  below. The first survivor of a new game always joins (nothing to refuse).
- **Joining the camp (ID-150):**
  - Every join is an offer. The result screen shows each newcomer's card
    (name, level, profession and what it brings, gun) with **Accept** and
    **Refuse**, under "Refused survivors are gone for good." Accept puts them on the squad while it has an open slot, else
    on the bench. Refuse sends them away for good: their recruit number is
    spent, so the next offer is someone new.
  - Pressing the result screen's button with someone still asking asks first
    ("… is still asking to join. Go on without answering? They are refused
    and gone for good."): No keeps the screen and the offer; Yes refuses
    them. A later first clear also turns away any offer left unanswered, so
    offers never pile up.
  - The offer is saved (`joining`), so a reload on the result screen keeps
    it: the start screen shows the same card with Accept and Refuse.
  - **The result and the popup always agree (ID-182).** One decision: the
    finish (`finishSquadHorde`) is the only place that rolls the joiners, and
    the result reads what it decided (`SquadResult.joined`, and `noJoin`, the
    reason when nobody asks), never a second roll. The result's camp tile is
    on every win and follows the live offer (`joining`), not a snapshot: the
    Accept and Refuse rows while someone asks, then each answer, which stays
    after the toast is gone and is the toast's own string ("Ava joined the
    squad" / "Ava joined the camp, on the bench" / "Ava was turned away";
    the bench is named the same on the tile, the toast and in the save).
    With nobody asking the tile says why, with the numbers read off
    `SQUAD_JOIN` / `SQUAD_CAP`: a replay "Nobody new this time. A replay
    rarely brings a survivor (about 1 in 20)."; a first clear at 6 or more
    "Nobody new this time. At 6 survivors or more, a new horde brings one
    about 1 in 7."; a full camp (`SQUAD_JOIN.max` or the recruit
    counter's cap) "Camp is full (N): nobody new can join."; a replay past
    `FARM.maxReplays` "No drop and nobody new: replay limit reached." A lost
    fight has no camp tile. The result's list of lines no longer carries the
    joining text (the debrief never drew it). The Roster's own move reads
    "X moves into the squad." / "X moves to the bench.", so it can't pass for
    a newcomer. On a start screen reloaded mid-offer, the answers show in the
    toast only.
  - **Let go:** on the Roster (on every survivor, next to Add to squad /
    Move to bench), between hordes, after a confirm that names their gun. They
    leave for good; their gun goes back to the stash (a full stash throws its
    weakest away, as a drop does, and the confirm names it); the free pistol
    just goes. Refused at 6 or fewer survivors in the camp so the squad can
    always be filled: the button looks greyed and a press says why on the
    Roster's status line and under the button ("Needs 7+ survivors to let one
    go (camp 6)").
  - **Combine (ID-170, `SURVIVOR_COMBINE` in `data.ts`) *(starting
    points)*:** on the Roster, between hordes, a survivor with another of the
    same profession in the camp (squad or bench) has a **Combine** button
    before Let go. It opens a pick under the buttons ("Take in another
    Soldier: they leave for good.", one button per partner with name, level
    and gun, then Cancel); a pick asks first, naming who leaves, the XP and
    levels the keeper gains, where the gun goes and anything a full stash
    throws away. The keeper gains 50% of the other's lifetime XP, at least
    one level's worth from level 1 (25 XP), so a fresh joiner still counts;
    capped as XP is everywhere. The other leaves as with Let go (gun to the
    stash, the free pistol just goes); the keeper keeps their gun, rest and
    slot, and "Auto" fills a slot the other leaves. Locked as Let go is (6 or
    fewer in the camp: greyed, a press says "Needs 7+ survivors to combine
    (camp 6)", and the line under the buttons names both, "… to combine or
    let one go …"); refused for another
    profession, the same survivor, or anyone still asking to join. No save
    change: one survivor fewer, more XP. The scripted player never combines.
    With "Auto" off the keeper keeps their slot; with it on, "Auto" picks the
    best squad again (the keeper's new XP can move them, as any change can).
  - The scripted player in the balance tests accepts every offer, a replay's
    newcomer too (ID-170), so its bench grows a little faster than before.
- **The bench and rest (ID-147, `SQUAD_JOIN`, `INJURY_REST` in `data.ts`):**
  - No camp cap below `SQUAD_JOIN.max` (40). Up to 6 fight a horde (one per
    slot on the firing line; 7 or 8 with bought slots, ID-179); the rest wait
    on the bench.
  - Under 6, each first clear adds one survivor as before. From 6 on, each
    first clear has a 15% chance (seeded from the horde, core RNG) that one
    joins, and then 20% that a second comes too (about 3% of first clears).
    A loss adds nobody. A replay win that drops a gun has 5%
    (`SQUAD_JOIN.replay`, ID-170) that one joins, at any camp size, never a
    second: about one per 20 replay wins, so farming grows the bench slowly
    and first clears stay the better source. Each replay is a new seed, so
    each roll is fresh; a replay past `FARM.maxReplays` (no drop) adds
    nobody. A replay's newcomer turns away an offer left unanswered, as a
    first clear's does; a replay with nobody new leaves it standing. Each
    joiner asks to join (ID-150); once accepted, they take an open squad
    slot, else wait on the bench.
  - Rest, in hordes *(ID-155; `INJURY_REST`, `PATCH_UP`)*: after a **won**
    fight, only a survivor who was downed rests, for 1 horde. Anyone who ends
    it standing, at any HP, is fit for the next horde (ID-147's 2 hordes for
    the downed and 1 for under 25% HP are gone: a win left most of the squad
    resting). A lost fight rests nobody (everyone is down by then). Rest
    counts down one per horde played, won or lost. A v19–v21 save's rest of 2
    loads as 1.
  - **Paramedics patch up the downed (ID-155):** each downed survivor rolls
    once after the win (core RNG, the horde's seed). The chance is the
    camp's Paramedic points as a %, capped at **80%** (`PATCH_UP.chance`).
    Each Paramedic in the camp (squad or bench, resting or not, the downed
    one too) adds **20** (`base`) + **20** × P / (P + 20) (`level`), P =
    level − 1: 20 at level 1, 30 at level 21, never 40. They stack, unlike
    the squad effects. On a success the survivor doesn't rest: they fight
    the next horde at **50%** of max HP (`hp`), plus half a % (`over`) for
    each point over **80** (`from`), at most **80%** (`hpCap`): 80 points
    50%, 90 55%, 140 and up 80%. After that horde (played, won or lost) they
    are at full HP again. That holds even if they sat it out on the bench,
    as a rest counts down per horde played, not per horde fought. On a
    failure they rest 1 horde. The Roster shows
    "HP 58/115 · patched up"; the result screen says "Patched up by
    Paramedics, back next horde: Bob (50% HP)."; with a Paramedic in camp, one
    whose roll failed is listed as "Resting (not patched up): …". The
    profession text says "Paramedics in camp add up, to 80%".
  - *Measured (ID-155, the late-hordes balance test's 16 campaigns to Horde
    18, seed i × 1000):* fights to beat Horde 18, ID-147's rule → this one:

    | Seed | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | Mean |
    | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
    | ID-147 | 55 | 56 | 92 | 60 | 42 | 56 | 67 | 48 | 66 | 67 | 72 | 65 | 157 | 67 | 48 | 79 | 68.6 |
    | ID-155 | 57 | 90 | 48 | 84 | 58 | 28 | 62 | 41 | 106 | 34 | 52 | 83 | 55 | 78 | 72 | 68 | 63.5 |

    Most replays at one horde: 37 (seed 13) → 24 (seed 14); every seed is now
    within the farming bound (120 fights, 30 replays at a horde). New-horde
    tries at Hordes 11–18 ending with 90%+ wall HP: 17.6% → 21.3% (ID-153's
    band is 8–30%). One seed's count swings a lot with which fights it wins
    (the same rule took seed 2 from 56 to 90 and seed 6 from 56 to 28), so
    the mean is the measure.
  - *The seed 13000 spiral (ID-155, #312):* under ID-147's rule it took 157
    fights, with 37 replays spent at Horde 16 (and 33 of 37 Horde 15 replays
    lost). Two causes fed each other. **Rest after the few won replays:** a
    won replay that downed anyone left the next two fights short every time
    (18 of 18 fights), and short replays won 1 of 37. The scripted player
    farms 3 replays then tries the new horde again, so each block had at
    most one real try. **A squad weaker than its Squad Power:** its full
    squad won only 4 of 29 Horde 15 replays at 1.66–1.71× Recommended, where
    the 16 seeds win 60% at 1.6–1.8×. Drops come only from wins and a loss
    pays little XP, so with so few wins Squad Power hardly grew (about
    6,700 → 6,900 over 30 fights). A loss rests nobody, so nothing else in
    the loss and replay path shortens the squad. With only the downed
    resting, 1 horde, the same seed beats Horde 18 in 55 fights, at most 9
    replays at one horde (its full squad won 14 of 20 replays); no other
    change was needed.
  - *Measured (4 seeds to Horde 18, the scripted player refilling open
    slots from the fit bench):* the ticket's first bands (downed 3, under 25%
    2, under 50% 1) with a loss resting the whole squad locked every
    campaign at Hordes 5–8 (a lone survivor woken, losing every replay).
    Those bands on wins only took 83% more fights to beat Horde 18 than no
    rest; downed 2 / under 25% 1 on wins only took 40% more (PM's pick);
    downed-only 1 horde took 15% more.
  - A survivor who rests leaves the squad for the bench; their slot stays
    open until the player fills it on the Roster. The Roster lists the bench
    under the squad: "Add to squad" / "Move to bench" between hordes (a full
    squad or the last in it refuses), and a resting survivor shows
    "Resting: N hordes" and can't be added. A bench survivor's gun can be
    changed, so no gun is stuck there.
  - **Best squad (ID-154):** with a bench, the Roster's "Squad N/6" row ends
    with a **Best squad** button and an **Auto** checkbox (between hordes;
    greyed with "Pick the squad between hordes" in a fight). Best squad makes
    the squad the 6 fit survivors with the most Squad Power share
    (`survivorPower`: level, profession, gun), ties to camp order (the squad
    first, so a tie never swaps). Who stays keeps their slot; a newcomer takes
    the slot of one benched, the rest go on the end; the benched go on the
    bench's end. Guns don't move; resting survivors are never picked; a second
    press moves nobody. The status line names who came in and went out.
  - **Auto (ID-154)**, off by default and saved, runs the same pick on its own
    after each horde's result, an accepted joiner, a let-go and "Best gun for
    everyone"; ticking it runs it once. The player's own moves (Add to squad,
    Move to bench, a gun change) stand until the next of those, and loading a
    save never runs it. The scripted player in the balance tests leaves it off.
    Ticking it says when it runs ("Auto on: the best squad is picked again after
    each horde, joiner, let-go and Best gun."), then who it moved. When it moves
    someone after a fight, the result screen says so: "Auto squad: in A · out
    B." In a fight a line under the row says "Pick the squad between hordes"
    (a tooltip never shows on a phone). The Roster's status line is pinned to
    the dialog's foot so what a press did stays in sight on a phone.
  - The start screen shows the squad, a bench line ("Bench 3 · 1 resting ·
    2 open slots: pick on the Roster") and a "Change squad" link to the
    Roster.
  - The game can't lock up: with nobody fit, the shortest rest ends at once
    (ties to camp order); an empty squad takes the fit bench, highest XP
    first.
- **Mid-fight swaps (ID-148, `MID_SWAP` in `data.ts`):**
  - A survivor on the line who drops under 20% of max HP (still standing)
    pulls back, and a fit bench survivor takes the same slot at full HP with
    their own gun. Up to 3 swaps a fight. Automatic, no pause, no RNG, so the
    same seed gives the same swaps.
  - Who comes in: the fit bench, highest level first (ties to camp order).
  - They are seen: the newcomer runs in from just behind the line (1.75× the
    walk, firing only a sidearm on the way) and shouts a swap line (chatter,
    shown on Low too); the hurt one limps back off the frame's left edge
    with their HP bar and a dimmed name. The fight's view shows 70 px of
    ground behind the line (was 24, about 3–4% further out) so both are seen.
  - A note "X takes over from Y" shows under the toast's place for 3 s of
    fight time and at least 2 s of real time (readable at 5×, held while
    paused); swaps close together join it ("… · …").
  - The corner's wave line ends with "Swaps left N", the swaps still to come
    (no more than the bench has left; a tooltip explains it); hidden in a
    fight that started with an empty bench.
  - The one who pulled back is still standing: on a win they don't rest
    (ID-155; before it they rested by their HP then), and a loss rests
    nobody as before. They don't come back that fight. A bench survivor who came in
    gets horde XP, levels and rest like anyone who fought.
  - Nobody fit on the bench, or 3 swaps used: the old rule (fight on to 0 HP).
- **Progression:** survivor XP and levels, at twice the full game's XP per
  win (`SQUAD_XP_RATE`). One result screen shows the XP, level-ups (with the
  stat picker) and the new survivor. Camp XP, the camp level and Mutated
  Genes are hidden.
- **Pacing:** a boss horde every 10th horde.
- **Goal (ID-127, `RADIO_HORDES`, `BOSS_UNLOCKS` in `data.ts`):** the boss
  hordes 10, 20 and 30 each yield a radio part on their first clear; the
  third calls the evacuation and Horde 30 is the finale.
  - Parts are counted from the boss hordes beaten (the horde number), so an
    older save gets its parts and the save stores nothing new.
  - The panel between hordes has no radio chip *(ID-196)*: the start
    screen's "Radio 1/3" chip and its three-line note (ID-190, with its
    `idle-defender.radio-seen` flag) are gone. In Endless the start screen
    keeps its "Endless · best N" chip and the line naming the horde to hold.
  - One line names the next goal *(ID-217, `nextGoalLine`)* on the start
    screen and a win's result, worked out from the horde number (a replay
    names the goal ahead, not the horde replayed): "Next: Horde 20 boss ·
    radio part 2/3 · new card Field Repairs" (the card only when the boss
    unlocks one), or "Next: Horde 30 · call the evacuation" for the finale.
    None on a loss, on the ending screen or in Endless.
  - A boss horde's first clear adds a "New card: …" chip to its result
    screen when it unlocks one (below), and the line "Boss horde beaten."
    to the result's details; this replaces Horde 10's old soft ending.
  - Each boss's first clear also unlocks a card for good: **Heavy Rounds**
    joins the card pool from Horde 10's, **Field Repairs** from Horde 20's
    (in every fight after, replays included). These are the full game's
    research cards; the horde-only build has no research, so the bosses
    unlock them instead.
  - Horde 30's first clear is the ending screen (title "The evacuation is
    called", a "Horde 30 held" chip, Continue), and Continue goes on into
    Horde 31: **Endless**.
    From then the start screen's chip reads "Endless · best N", the
    highest horde beaten, and its line asks for the next one.
  - Replays of a boss horde give no part, no unlock and no ending.
- **Balance** (scripted player, 20 seeds, `balance/horde-only.test.ts`): the expected
  squad (a survivor more per win, the level bonus, ID-146, every point in
  Sharp Mind before; damage cards first)
  wins each of Hordes 1–10 at the first try on at least 60% of seeds, and
  every campaign beats Horde 10's boss; the lone starting survivor wins
  Horde 1 on every seed and loses every horde from Horde 4. A fight from
  Horde 10 on lasts about 5 minutes at normal speed (ID-128, §11 Balance pass).

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
  that number (same waves, enemies and HP); a replay win rarely adds a
  survivor (5%, ID-170, see The bench and rest) and doesn't move the next
  new horde on.
- **First clear:** the drop rolls the horde's band (§6 Gear) moved up one
  rarity (Rusty → Common … Prototype → Relic; Relic stays). Uid `h<n>`.
  Older saves get no first-clear drops for hordes already beaten.
- **Replay:** the band with its top rarity's share halved, the half moved to
  the rarity below. Uid `r<k>`, the k-th replay win.
- **Bonus guns (ID-122):** first clears and replays alike may drop up to 2
  more, lower-grade guns (§6 Gear, Bonus guns).
- **Bad-luck guarantee (replays only):** "an upgrade" is a drop some squad
  survivor would do more DPS with than with their own gun (the free
  pistol included), in their hands: their level and profession counted, as
  Squad Power and "Best gun for everyone" count them (ID-152; before, more
  DPS than the weakest held gun on its own, which is the same at level 1).
  The weakest held gun is the one that does least in its holder's hands.
  Each replay win whose drop is no upgrade adds 1 to a saved
  count (at most 5); each count moves 5 points of rarity weight up one band,
  taken from the lowest rarity with weight left. At 5 the next replay drop is
  a sure upgrade: a gun and rarity (at or above the weakest held gun's where
  the band has one) that can be one, picked evenly, its affixes rerolled up
  to 64 times and then its best roll, so it always ends. Any upgrade resets
  the count. When no gun the horde can drop could be an upgrade (every affix
  maxed), the count doesn't move, there is no reroll, and the
  result screen says "Farm a higher horde for upgrades". First clears
  neither count nor reset it.
- **Gun level:** every dropped gun's level is its horde number; each level
  above 1 multiplies base damage by 1.06, before rarity and affixes (a Horde 20
  drop hits ×3.03 a Horde 1 drop of the same gun). ID-102: +5% of base damage
  a level, added, before (×1.95 at Horde 20). Combine takes 3 of a gun and
  rarity at any levels; the new gun has the highest. The free pistol and
  older saves' guns are level 1. DPS everywhere includes it.
- **Gun upgrade (ID-208) *(starting points)*:** a gun can be upgraded with Scrap to
  +1, +2 … up to +`GUN_UPGRADE.max` (5), one step at a time. Each step adds
  `GUN_UPGRADE.damage` (4%) of base damage, so +5 is ×1.2, multiplied with the gun
  level's ×1.06 a level and the rarity's power, before affixes (Rusty +5 is ×0.96 of a
  Common +0). Reaching step `s` costs `GUN_UPGRADE.cost` (10) × `s` × the gun's level in
  Scrap (a Lv 3 gun: 30, 60, 90, 120, 150). It is player-driven only, so the scripted
  player (and so every balance test) never upgrades and the fixtures are unchanged. The
  step is `OwnedWeapon.step`, written to the save only when above 0 (an older save's
  guns load at +0; the save version is unchanged), read as a whole number from 0 to the
  top step and nothing else. It shows after the name everywhere ("Lv 3 Common SMG +2").
  Held and stash guns can both be upgraded, between hordes and in a fight (a held gun
  fights with the new numbers from the next shot; Squad Power follows). The free pistol
  can't be upgraded. Combine's new gun takes the highest level of its three inputs
  and the step of the gun that brings that level (on a level tie, the highest step among
  the tied): a step is never taken from a lower-level gun, or a cheap low-level +5 gun
  (10 + 20 + 30 + 40 + 50 Scrap at Lv 1) could be combined into a high-level result that
  would otherwise cost 150 × its level. Combine still uses the 3 weakest by DPS as before,
  so an upgraded gun, being stronger, stays unless it is dragged in by hand; the confirm
  shows the result with its inherited step. DPS, Squad Power, Recommended Power's
  comparison, Best gun for everyone and the gun pickers all count the step (they all read
  the gun's numbers).
  - **Salvage (ID-207, `UPGRADE_REFUND` in `data.ts`) *(starting point)*:** a salvaged gun
    pays its rarity's `salvage` Scrap (Rusty 5, Common 10, Military 25, Prototype 50, Relic 100)
    plus `UPGRADE_REFUND` (half) of the Scrap its upgrade steps cost, rounded down. The steps
    of a Lv `L` gun at +`s` cost `GUN_UPGRADE.cost` × `L` × `s` × (`s` + 1) / 2 in all (a Lv 2
    Military +2 spent 20 + 40 = 60: it pays 25 + 30 = 55). `gunSalvage` (`armoury.ts`) is the
    one amount, used everywhere a gun is salvaged: by hand (`salvageGun`), a drop thrown away
    when the stash is full, a survivor's gun returning to a full stash (the weakest of the
    stash and the gun goes: `salvageOf`), and a gun a patrol brings home to a full stash.
    **Combine inputs pay no refund** (the result keeps the step instead). Hordes only ever
    drop +0 guns, so the balance tests, whose scripted player never upgrades, are unchanged.
  - **Salvage in the Inventory:** a stash gun's details have a Salvage button in the dock under
    Combine, always there so the dock keeps its shape: it names what it pays ("Salvage · +25
    Scrap", "Salvage · +55 Scrap" with a refund; thousands separators; the tooltip and
    screen-reader name have the full "Salvage Lv 2 Military SMG +2 for 55 Scrap"). The label
    wraps rather than clip or scroll the dock sideways (desktop 1280x720 and iPad 1024x768 show the
    whole dock; in a window under 541 px tall, a phone sideways, the details scroll as one box,
    lines then buttons, so Salvage is reached by scrolling, never hidden).
    Rusty, Common and Military go in one tap. A Prototype or Relic asks first, in the game's own
    confirm panel ("Salvage Lv 3 Prototype SMG +1 for 65 Scrap? The gun is gone for good.",
    Confirm labelled "Salvage"), and is checked again after the answer. A gun in a survivor's
    hands (squad or bench) can't be salvaged: its button is greyed and says "Put it back in
    the stash first" in visible text (Combine's rule; a touch screen has no tooltips); the
    free pistol says "Can't salvage the pistol" and a blade or tool "Can't salvage: not a
    gun". After it the gun leaves the stash and the next one is selected, the Scrap chip and a
    result screen's "now" figure update, the camp is saved, and the status line says
    "Salvaged Lv 2 Military SMG +2 · +55 Scrap, 555 now." It works between hordes and in a
    fight, like Upgrade (the stash is not in the fight). A press locks the button for 400 ms
    (and while a confirm is up), so a double tap salvages one gun, never the next one that
    slides into the same spot.
  - **Drops are always +0:** every gun a horde can drop is +0, so a heavily upgraded squad
    can reach "no gun this horde can drop is an upgrade" (the farming guarantee's
    sure-upgrade roll and "Farm a higher horde for upgrades"). That is intended: upgrades
    are the player's own route past the drops.
  - **Save:** the version stays 23 deliberately (the field is optional and read only when
    present, so every older save loads at +0). The rollback caveat: an older build refuses a
    save holding a step (its weapon reader knows no such key). A step is accepted only on a
    gun in the stash or in a survivor's hands; a weapon left on the patrol map or carried by
    a survivor waiting to join was never in the camp's hands (upgrades are horde-only), so a
    step there is refused.
  - **Result screen:** Scrap spent while a win's result screen is up (an upgrade or a slot
    purchase) sets the "now" figure in its Scrap chip tooltip in place; nothing else on the
    screen is redrawn, so a skill pick, open details or scroll stay as they are.
  - **In the Inventory:** a gun's details have an Upgrade section in the dock, between
    "Equip on…" and Combine, always there so the dock keeps its shape: one button naming
    the next step and cost ("Upgrade +2 · 60 Scrap", thousands separators; the tooltip and
    screen-reader name have the full "Upgrade to +2 · 60 Scrap"). The label wraps to a
    second line rather than clip or scroll the dock. Short of Scrap it is greyed and dashed
    like the slot buttons and shows progress ("Upgrade +2 · 20/60 Scrap", its tooltip adding
    "Needs 60 Scrap (40 short)"); at +5 it says "Maxed at +5" greyed; for the free pistol
    or a blade or tool it is greyed and says why in its text ("Can't upgrade the pistol",
    "Can't upgrade: not a gun"), since a tooltip doesn't show on a touch screen. An
    upgraded gun's tile has a "+N" badge top right (none at +0). There is no confirm (a
    step is cheap and a fight can't wait). After it the status line says "Upgraded Lv 3
    Common SMG +2 · 60 Scrap spent, 120 left."; an open combine confirm over the gun is
    dropped, as its gun changed.
- **Blueprints and the Craft tab (ID-209) *(starting points: the PM's call)*:** guns also
  come from crafting, instant in this build (timed workbench jobs stay with the full game).
  - **Blueprint drops:** a won horde that drops (a first clear, or a replay under
    `FARM.maxReplays`) can also drop one blueprint: `BLUEPRINT.chance` (15%) a win, at most
    one a horde. A blueprint names a gun type only (never the free Pistol; "Blueprint:
    LMG"); the rarity is rolled when crafted. The roll comes from its own stream (the
    horde's seed XOR `BLUEPRINT_STREAM`), so it never moves the gun drops or the bonus
    guns (every drop test and balance fixture is unchanged) and the same seed always drops
    the same blueprint. The result screen shows it with the loot: a "Blueprint: LMG · craft
    it in the Craft tab" line under the weapon row, and in the win's lines. At most
    `BLUEPRINT.cap` (99) of a gun type are held; over it the blueprint is lost, and is then
    not shown either (the line only names a blueprint actually added). A loss drops none.
  - **Craft tab:** the third tab of the Roster and Weapons window, after Weapons. It lists
    every blueprint held with a count per gun type (the first is picked; picking one opens
    its crafting area): a heading row with the gun type and, at its right, "Scrap 500 ·
    Stash 3/40"; "Makes a Lv N <gun>" (N the highest horde beaten, at least 1, as a drop's
    level); a Scrap slider from `CRAFT.min` (20) up in `CRAFT.steps` (10) steps of
    `CRAFT.step` (20) to 220, with the live amount beside its label and "20" and "220"
    under its ends; the odds of each rarity for that amount, live as it moves; the Craft
    button (the one filled button) and "Salvage for 5 Scrap" (an outline, secondary). The
    last amount chosen is kept for the session (in memory, not saved). The tab's label
    carries the blueprints held, "Craft · 3", and is plain "Craft" with none (it follows
    the camp while the window is shut, too). Blueprint rows show the gun's icon at full
    strength with the stash tiles' pale rim, an unselected row only slightly dimmed (0.8).
    Dense and content-sized; the blueprint list sits left of the area on a wide window and
    above it in a narrow one; the five odds cells always sit in one row; on a short screen
    (a phone in landscape) the padding tightens and the standing note is dropped so Craft
    and the Scrap line stay in view, and the pane scrolls as a last resort. With crafting
    shut (in a fight) the reason, "Craft between hordes, on the start or result screen.",
    stands in place of the "Makes a Lv…" line, in the warning colour, up with the
    controls; the standing note below says it only when there is no area.
  - **Odds (percent):** at the minimum (20 Scrap) Rusty 30 / Common 45 / Military 20 /
    Prototype 5 / Relic 0 (the horde drop's band); each extra step moves every rarity
    evenly toward Rusty 0 / Common 20 / Military 45 / Prototype 30 / Relic 5, reached at
    the cap (220 Scrap, 10 steps). Both ends and every step sum to 100. Relic is possible
    only above the minimum: the odds are linear, so it rises from the first step (0.5% at
    40 Scrap) to 5% at the cap. Spend more Scrap and a better rarity comes more
    often; it is never certain.
  - **Craft:** makes the gun at once into the stash, uid `f<n>`, with the affixes its
    rarity rolls (as a drop's), and uses up the blueprint and the Scrap put in. The roll
    uses the seeded generator from the number of guns crafted and the horde number, so a
    camp replayed from the same state rolls the same gun (and a reload doesn't re-roll). It
    works between hordes, on the start and result screens (greyed in a fight, as Combine
    is). Greyed with "Needs N more Scrap" when short, or "Stash full" when the stash holds
    its cap (`stashCap`, bought slots counted): a crafted gun is never thrown away for room
    and nothing is spent; both read from one function the button and the craft share
    (`craftRefusal`; a full stash is reported before short Scrap, as it can't be fixed by
    changing the amount). The result shows "Crafted: Lv 12 Military LMG" with a "View in
    Weapons" button that opens the Weapons tab on the new gun; it takes the place of the
    "Makes a Lv…" line, so the area never grows and Craft stays where it was, even when the
    last blueprint of a type was used and the next type's area shows. On a win's result
    screen the drop tile's "Stash n/cap" is refreshed in place after a craft, like the Scrap
    figure.
  - **Salvage:** a blueprint not wanted turns into `BLUEPRINT.salvage` (5) Scrap, between
    hordes, after the game's own confirm: "Salvage 1 LMG blueprint for 5 Scrap?" with
    Salvage and Keep (Keep leaves everything as it was).
  - **Balance:** the scripted player and so every balance test never craft, so they are
    unchanged. Crafting lets a player choose a gun type and buy a rarity; the knobs are the
    blueprint chance, the step cost (`CRAFT.step`) and the odds cap (`CRAFT.to`), to be
    tuned from play.
  - **Save:** the version stays 23 deliberately (the key is optional and written only by this
    build). A save may hold `craft`, written only once a blueprint has dropped (or a gun was
    crafted): exactly `blueprints` (a plain object whose keys are known blueprint gun types
    only, each a whole count from 1 to `BLUEPRINT.cap`) and `made` (guns crafted, 0 to
    `CRAFT_MADE_MAX`), nothing else. A crafted gun's uid is `f<n>`, n at most `made`; a `craft`
    key with a bad shape, an unknown or look-alike gun type, `__proto__`, a count that is
    negative, a fraction, NaN, text, zero or huge, an extra key, or nothing at all, refuses
    the save (as a bad weapon does), and a v22 or older save holding it is refused. Old
    saves load with no blueprints.
- **XP:** a replay pays that horde's survivor XP; more than 3 hordes below
  the highest beaten, half. A loss pays 25% of that horde's win XP (halved far
  down too) × waves cleared ÷ its waves (0 cleared → 0), rounded down. Still no
  drop on a loss.
- **Squad Power:** per squad survivor, their gun's sustained DPS (rarity,
  level, affixes; the level's crit chance, reload and fire rate) × (1 + 0.5 ×
  the level's spread cut) × (1 + 0.5 × the level's extra HP share) × 10
  (ID-146: from the stats before, with a × (1 + 0.5 × Instinct's damage near
  the wall) term), summed over the squad and rounded. Cards and skills don't
  count. (Gun role traits join it with ID-101.)
- **Recommended Power (ID-102, refitted ID-128):** 3 × the DPS a horde
  asks for (9.7 before ID-128, 10.3 before ID-125's true-rate shots): its
  expected enemy HP over the seconds its waves take to spawn (each wave's size
  × its spawn gap, 0.6 s from Horde 6 and 0.8 s before, plus the 3 s break). The HP is each wave's size × its mix's mean HP,
  a swarm wave's (ID-099) weighted 2× on top of its doubled size (it comes
  twice as fast), plus its bosses and mini-bosses at their HP. A boss horde asks
  ×1.12 more (its bosses' skills ask for more than their HP says). Hordes 1 to
  10 take ×0.3, ×0.6, ×2, ×2.1, ×1.9, ×1.7, ×1.25, ×1.1, ×1.4 (×1.33 before ID-137) and ×1.25 of it:
  Hordes 1–2 sure wins (the expected squad stands at 4–7× it); Hordes 3 and 4
  (ID-163; 1 and 1 before) put it at about 2.6× and 2.2×, so the readout
  closes in on Horde 5's 1.6× in steps instead of falling from over 6×; Hordes 5–10
  fitted so the scripted campaign's squad stands at about 1.5× it, where it
  wins 75–95% at the first try (at Hordes 9 and 10 a squad at it wins about
  half). Past Horde 10 it takes ×1.2 (ID-136: Heavy Rounds, unlocked by
  Horde 10's boss, became an epic trade-off, so the card build there is
  weaker; ID-137 gave the other epic cards costs; ×1.05 before ID-137).
  Horde 1 asks 18, 3 asks 115, 5 asks 778, 9 asks 1,774, 10 asks 1,899, 15
  asks 4,038, 20 asks 6,653, 30 asks 13,673 (before ID-137: 1,685, 3,534,
  5,821 and 11,963; before ID-136: 3,365, 5,544 and 11,394 past Horde 10).
  - ID-224, a bigger squad: Recommended Power takes the squad that fights
    (`squadSize`, the roster up to the bought slots), and a squad over 6 asks
    more past Horde 30, by the same factor its enemies' HP takes
    (`SQUAD_BIG_HP`, below). A squad of 6 or fewer asks what it did. Horde 40
    asks 24,486 of a squad of 6 and 27,530 of 8; Horde 50 asks 43,847 and
    55,435.
    - Measured first (main, 40 seeds: the balance seeds and a second 20): at
      equal Squad Power (the squad of 8 about 5 gun levels below the 6), a
      squad of 6 and of 8 win alike, so Squad Power was already fair across
      sizes. At 1.0× Recommended Power, Hordes 30, 40 and 50: 6 won 22, 27
      and 28 of 40, 8 won 30, 25 and 32 (pooled 64% and 72%, inside the seed
      noise; the balance seeds alone 42 and 42 of 60). At 0.85×: 9, 12, 9
      against 10, 10, 12; at 1.15×: 34, 36, 39 against 38, 36, 37; at 1.3×
      39 or 40 everywhere. A squad at Recommended Power wins 55–80% at
      Hordes 30–50 for both sizes, not 50% (from before ID-224).
    - So the issue was the cheap jump: two slots (1,700 Scrap) are +33%
      Squad Power. A scripted campaign that buys each slot once it can
      afford it had slot 7 by Horde 9–12 and slot 8 by 14–23, stood at
      1.4–1.7× Recommended Power over Hordes 31–50 and won Horde 50 at the
      first try on 18 of 20 seeds (one that never buys: 13 of 20, at 1.29×).
      With the steeper late stretch for 8: 13 of 20 (Hordes 41–50 first
      tries 185 of 200, 196 before); the one that never buys is unchanged.
      A gentle bump on purpose (PM): a player who fields 8 wants a little
      breathing room, so 8 stays easier than 6, it just no longer skips late
      Normal. A save at 2.1× Recommended Power before stands at about 1.7×
      after and still wins easily, which is fine (a strong squad winning is).
    - A global ×1.07 (every squad) gave the buyer 13 of 20 too but dropped
      the squad of 6 to 7 of 20 (Hordes 41–50 90% → 69%); ×1.065 left the
      buyer at 17 of 20 and the 6 at 8. Only a squad-size term separates them.
    - Held by `balance/squad8.test.ts`: a squad of 6 and of 8, each at its
      own Recommended Power, win at Hordes 30, 40 and 50 on 30–90% of 20
      seeds and within 30 points of each other; at 130% both win at least 8
      of 10. The ticket's "expected squad of 8 wins Horde 50 on 30–70% at the
      first try" is the campaign's 13 of 20 above, measured once (about 15
      CPU-minutes) and not regression-tested; a fixed squad at the campaign's Squad Power is no stand-in
      (it won 20 of 20 where the campaign won 13–18).
  - ID-137 refit: with the epic cards' costs, a squad at Recommended Power
    won 1, 0, 1 and 5 of 10 at Hordes 9, 12, 15 and 20, and a squad at 130%
    won 3 of 5 at Horde 15. Horde 9's factor goes 1.33 → 1.4 and `late`
    1.05 → 1.2 (a grid of 1.33–1.5 and 0.97–1.25): 4, 4, 5 and 7 of 10, and
    130% wins 5 and 4 of 5 at Hordes 10 and 15 (×1.17 gave 4, 2, 4, 7, at
    the floor at Horde 12; ×1.25 with 1.5 won 10 of 10 at Horde 9). The
    stats test still passes at it.
  - ID-136 refit: with Heavy Rounds weaker and rarer and no `late` factor, a
    squad at Recommended Power won 3, 1 and 5 of 10 at Hordes 12, 15 and 20
    (4, 3 and 7 before ID-136), and the stats' spread at it was 11 points.
    A grid of the factor (1, 1.03, 1.05, 1.07, 1.1, 1.15) found ×1.05 the one
    passing both: 3, 5 and 8 of 10, and Sharp Mind 50%, Agility 43%,
    Instinct 49% (7 points; ×1.07 and ×1.1 spread 13–14 points). A knife
    edge: a few fights move it. The late-hordes test now lets enemies hit
    the wall in up to 97% of new hordes' first tries (95% before ID-136;
    measured 96%, 88% before; ID-153 replaced this measure, see Mid-game
    walls below).
  - ID-128: fitted to the scripted player's cards and skills, an average
    build, since no player fights without cards. Before it was fitted with no
    cards, and with cards a squad at 70% of it still won Hordes 10 and 15 on 5
    of 5 seeds; the scripted campaigns stood at 0.51–0.65× it past Horde 10
    and won (a player beat Horde 12 at 3,669 against 6,102). Now they stand at
    1.2–1.6× it.
  - Before: 3.19 × HP^0.59 (ID-099; 7.1 × √HP in ID-098), fitted only on
    Hordes 6–20. With waves growing ×1.1 a horde, a horde's length grew as
    fast as its HP, so HP alone over-counted: at Horde 30 it asked about half
    of what a squad needed. Over HP a second, one fit holds from Horde 9 to
    Horde 30 within ±10% of each horde's measured 50%-win power.
  - Fitted (`balance/squad-power.test.ts`, 10 seeds, Military Rifles at the
    expected squad's size and level, the scripted player's cards and skills)
    so a squad at it wins about half the time: Horde 9 50%, 12 60%, 15 60%,
    20 50% (25: 70%). Each horde's 50% point, Hordes 11–20, lies at 2.7–3.3 ×
    the DPS (mean 3.0); Horde 9's at 4.0, Horde 10's at 3.7 (hence their
    factors). At 70% of it a squad loses Hordes 10 and 15 on 5 of 5 seeds; at
    130% wins on 5 of 5. (ID-102's no-card fit: Horde 9 60%, 12 50%, 15 60%,
    20 60%.)
- **Bands:** green at or above Recommended, amber within 15% below, red
  further. The numbers are always shown; it never blocks a start.
- **Injury band (ID-155, `INJURY_BAND` in `data.ts`):** beside the horde
  select the picker shows how many survivors a win is likely to cost: "Win cost:" and
  a short pill that says the result (ID-184; it said few / some / heavy until then):
  **"nobody down"** at 2× Recommended or more, **"~1 down"** from
  1.6×, **"1+ down"** under it, in the green / amber / red band colours
  (the words are always there, so colour is never the only cue). It follows
  the picked horde. The pill's tooltip says it in full: "If you win, usually
  nobody goes down", "about 1 survivor goes down on average", "1 or more survivors
  go down on average".
  A band, not a %: Squad Power counts DPS only, not HP or armour, so a
  precise figure would mislead. Advice only, like the power bands: a green
  power band can still read "1+ down", and it never blocks a start.
  - *Measured (16 scripted campaigns to Horde 18, the ID-155 rest rule, 607
    won fights; downed = dropped to 0 HP):*

    | Squad Power ÷ Recommended | Wins | Downed per win | No one downed | 2 or more downed | Band |
    | --- | --- | --- | --- | --- | --- |
    | 2.5 and up | 115 | 0.03 | 97% | 1% | few |
    | 2.0–2.5 | 146 | 0.38 | 82% | 10% | few |
    | 1.8–2.0 | 108 | 0.71 | 74% | 21% | some |
    | 1.6–1.8 | 137 | 0.95 | 64% | 26% | some |
    | 1.4–1.6 | 73 | 1.25 | 49% | 38% | heavy |
    | 1.2–1.4 | 27 | 0.85 | 70% | 22% | heavy |

    Under 1.2 the campaigns hardly win (1 of 14 full-squad fights), so it reads
    heavy. The 1.2–1.4 row (27 wins) is too few to trust its dip under 1.4–1.6.
    Squad Power counts max HP, so a squad of patched-up survivors (starting
    at half HP) reads the same band: a reason it stays advice. The same fights under ID-147's rule read alike (0.16, 0.53, 0.86,
    1.23 and 1.38 downed per win from 2–2.5× down).

### Difficulty modes *(as built, ID-218; starting points, tuned by the balance pass)*

After Horde 50 the game does not end: it opens **Nightmare**, then **Hell**.

- **Unlock.** Holding Horde 50 (beating it) on Normal opens Nightmare; holding
  Horde 50 on Nightmare opens Hell. Permanent: read off the hordes, so an older
  save that already holds Horde 50 has Nightmare. The start and result screens
  show a mode switch (Normal, Nightmare, Hell) once Nightmare is open; a locked
  mode says what opens it ("Hold Horde 50 on Nightmare"). A mode is switched only
  between fights; switching loses no progress. The squad, guns, stash, Scrap
  and blueprints are shared by every mode.
- **Own hordes.** Each mode keeps its own next horde (from Horde 1) and its own
  best: the start screen's chip reads "Nightmare · best N". Each runs Horde 1 to
  30, then Endless. Radio parts, Normal's boss cards and the evacuation ending are
  Normal's only; a higher mode's boss hordes unlock mode cards instead (below).
- **Strength: the effective horde.** A mode's Horde n fights as Normal's Horde n
  plus an offset: Normal 0, Nightmare 50, Hell 80 (a multiple of 10, so boss
  hordes and the boss skill cycle keep their places). Nightmare was 40 until
  ID-223: its Hordes 1–7 then asked less Recommended Power than Normal Horde 50,
  which the player had already beaten; at 50 a new mode starts at the player's
  edge, and Nightmare 30 (effective 80) sits about level with Hell 1 (81).
  Enemy count and HP, waves, pace, swarms and the mini-bosses follow that
  number; so do the gun
  level a drop comes at, XP and Scrap. A per-mode HP factor on top is the
  tuning knob (`MODES.hpScale`: Nightmare 1.16, 1.12 before ID-224; Hell 1),
  and `MODES.recBoss` on a boss horde's Recommended Power (Normal and Nightmare 1,
  Hell 1.2: at 1.1 the four-boss Hell 30 beat a squad at 130% of it on 2 of 5 seeds, ID-222).
- **Bosses.** A boss horde (every 10th of the mode's own) brings as many bosses
  as Normal's rule gives its own number (Horde 10: 1, 20: 2, 30 and on: 3),
  Hell one more (up to `BOSSES.max` + 1 = 4); each has the HP of its effective
  horde and **3** skills (Hell: a **fourth**, a new Hell skill, below). With 1 or 2
  bosses no skill repeats in the horde
  (each keeps its pair of the set and takes one of the set's unused third
  pair). With 3 or more every skill is used, none more than twice, and no two
  bosses share the same three. Fixed by the horde alone, so a replay meets the
  same bosses. Mini-bosses get no Hell skill.
- **Rewards.** Scrap × 1.5 (Nightmare) and × 2 (Hell). The gun drop's rarity
  band is shifted before a first clear, replay or bonus moves it: each mode step
  moves half of every rarity's share up one rarity (Relic keeps its own). A first
  clear's Relic odds from Horde 10's band: about 35% Normal, 55% Nightmare, 71%
  Hell. A first clear's gun uid is `n<k>` (Nightmare) or `x<k>` (Hell).
- **Recommended Power** reads the mode's own bosses and HP factor at the
  effective horde, so the meters and bands stay advice for the mode in play.
- **Hell's boss skills (ID-222, as built; starting points for the balance pass).**
  Each Hell boss has its three skills and one of Enrage, Shield and Poison pool
  (`HELL_SKILLS`), boss k of Hell Horde `h` taking number `(k + (h + 80) / 10) mod 3`:
  with 3 bosses or fewer no two share one, with 4 (Hell 30 on) exactly one is
  used twice, and it rotates by horde. Each winds up for `BOSS_SKILL.windUp` =
  1.2 s with a glow in its colour (Enrage red, Shield ice blue, Poison
  yellow-green) and the boss's pose, like the older skills, and shows in the boss
  bar's name and cue; the bar lists a Hell skill first, so on a phone the
  ellipsis cuts an old skill, never the new one.
  - **Enrage.** Its tell starts at exactly 50% of max HP (one HP above: nothing)
    and the effect lands one wind-up later (a stun pushes it like any clock).
    Then, for good (Regen healing back over 50% does not end it): speed × 1.4,
    which multiplies with a charge's ×3, and hits on walls and survivors × 1.5.
    No spawn clock: it is armed only by the HP. A steady red ring and glow mark it.
  - **Shield.** 4 s into the fight it winds up once; from then until its boss dies
    or is stunned, every other enemy within 220 px takes 0.6 of a bullet's damage
    (plates stack with it; an armour-piercing round, fire, frags and skills are
    not reduced). Flashbang answers it. The boss wears a blue aura ring and each
    covered enemy a thin one.
  - **Poison pool.** Every 15 s after a wind-up a glob flies 0.6 s to the slot of
    the nearest living survivor (by row; survivors cannot move, so the target
    slot is marked on the ground from the wind-up's start), never thrown from the
    camp. It leaves a 70 px pool for 6 s that takes 4% of each survivor's max HP a
    second (once, in overlapping pools), straight off HP: 24% for a full pool. A
    line slot is 100 to 133 px apart, so one pool hits one survivor.
- **Mode reward cards (ID-222, as built).** Each higher mode's boss horde 10, 20
  and 30 unlocks one card on its first clear; it is offered in that mode and the
  ones above it (a Nightmare card in Nightmare and Hell, a Hell card in Hell only).
  Nightmare: Suppressing Fire, Cauterise, Momentum; Hell: Gas Masks, Breaching
  Rounds, Tranq Darts. Rare, once only, behaviour cards that act only on a boss
  skill or a boss kill (never flat damage or HP), and offered only in a fight whose
  bosses have what they answer (read at the fight's start), so they never crowd
  the offers:
  | Card | Effect | Offered when a boss has |
  | --- | --- | --- |
  | Suppressing Fire | A squad hit on a boss winding a skill up makes that wind-up last 2 s longer (once per wind-up; the tell stays lit) | a timed skill |
  | Cauterise | Regen bosses can't heal for 3 s after a squad hit (a scorch tint shows it) | Regen |
  | Momentum | A boss dying reloads every gun at once and gives each survivor a throw back | a boss (not a mini-boss) |
  | Gas Masks | Poison pools hurt survivors 60% less | Poison pool |
  | Breaching Rounds | Squad bullets take back half of what Armour plates and Shield cut | Shield or Armour plates |
  | Tranq Darts | A hit takes Enrage's speed off an enraged boss for 3 s (its harder hits stay) | Enrage |

  The unlock is not stored: it is read off each mode's saved horde (`modes`, already
  allow-listed and range-checked on load, with Hell needing Nightmare past 50), as
  Normal's boss cards are read off its horde, so a second clear changes nothing and
  an older save that already cleared a boss horde has its card. Normal's pool and
  offer rolls are unchanged (no new id is in its pool). The result screen's note and
  chip name the card; no radio part is found in a higher mode.
- **Balance.** Nightmare starts where Normal ends (ID-223): a squad that just holds
  Normal Horde 50 wins Nightmare Horde 1 at the first try on 30–70% of 20 seeds
  (measured: gun level 54, 9 of 20; gun level 49, 10 of 20 before ID-224); a squad at 2× Normal
  Horde 50's Recommended Power (gun level 63), not gearing up between fights, is stopped by Nightmare Horde 20
  on most (measured: 20 of 20, at Hordes 6–11 since ID-224, 9–17 before; gearing up on Nightmare's drops it was
  stopped on only 4 of 20, accepted: a strong squad winning is fine); a squad well over
  Recommended Power does not lose repeatedly at Nightmare 20 and 30 or Hell 30
  (`balance/modes.test.ts`). `MODES.nightmare.hpScale` stayed 1.12 (no wall at
  Nightmare 30) until ID-224, which raised it to 1.16: the mode tests field a squad of 8, whose
  steeper late Normal (`SQUAD_BIG_HP`) moved the hold level up and Nightmare 1 to 16 of 20 at
  1.12, over the 70% cap; at 1.16 it is 9 of 20. The check swings by about 4 seeds across
  knobs at the same strength (the hold level is a 5-seed bisect), so it is not finely tuned. Before ID-223 (offset 40) the check was Nightmare 1–10 on 60% of seeds
  and stopped by Nightmare 30. Hell (ID-222):
  a squad that holds Nightmare Horde 50 wins Hell Hordes 1-10 at the first try on at
  least 60% of 20 seeds and is stopped by Hell Horde 30 on most, and a squad well over
  Recommended Power does not lose repeatedly at Hell 10 and 20 (`balance/hell.test.ts`;
  the retune order is `MODES.hell.hpScale`, the skill numbers, the offset in steps of
  10, then `recBoss`). Normal's numbers are held by a golden test
  (`golden-normal.test.ts`).

### Balance pass *(ID-102)*

One pass over farming, harder hordes, horde-only skills, gun roles, stat
points and horde cards together (ID-096 to ID-101), baselined on main first,
then grid-tuned with the scripted player (`src/core/sim.ts`).

- **The scripted player now plays like a stuck player.** After a loss at a
  new horde it replays the highest beaten horde 3 times (`SQUAD_FARM`), then
  tries again; it uses its picked skills (Flashbang and Molotov; the Airstrike
  alone since ID-139, and it keeps the first throwable it takes) once 6 enemies
  stand on the field, aimed at the one nearest the wall (not auto-aim, ID-140,
  §4). A worst-luck mode
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
| Horde-only HP ease (`SQUAD_EARLY_HP`) | Hordes 1–3: ×0.8, ×0.9, ×0.95 (ID-163: ×0.8, ×0.9, ×1, and Horde 4 ×1.2) | Also Hordes 8–10: ×0.85, ×0.75, ×0.75 | Brutes join at Horde 8 (mean enemy HP +55%), the first boss at 10. 20 seeds, first try: 85%, 70%, 65% (target at least 60%) |
| Swarm wave placement (`swarmWave`) | Counted from wave 1 | Counted back from the last wave, which always swarms | With wave size held, a growing share slid swarms onto smaller waves and Horde 14 had less HP than Horde 13 |
| Recommended Power (`POWER.rec`) | 3.19 × HP^0.59 | 9.7 × HP ÷ spawn seconds (10.3 until ID-125); ×1.12 on boss hordes; early ×0.3, ×0.6, 1, 1, 1, 1, ×0.8, ×0.8 (refitted since; ID-163: Hordes 3–4 ×2, ×2.1) | Refitted on each horde's measured 50%-win power, Hordes 3–30 (above) |
| Swarm share (`SWARM.share`) | 0.25 | 0.25 (kept) | 0.20 and 0.30 both made walls shallower (first-try losses at Hordes 11+: 25% and 29% against 46%) |
| Boss count and HP (`BOSSES`) | n ÷ 10 up to 3, 4× HP | Kept | HP 3 and at most 2 bosses: no change to Horde 18; HP 5: a little easier (fewer replays) |
| Mini-boss HP (`ELITE.hp`) | 4× | 4× (kept) | 3× and 5×: 29% and 50% first-try losses against 46% |
| Boss skills (`BOSS_SKILL`) | Roar +40%, Slab 300 | Kept | Roar +60% changed no fight to Horde 18; Slab 450 about the same |
| Drop odds (`SQUAD_DROP`, Horde 10+ band) | Relic 10% | Kept | Relic 15%: walls take at most 6 replays (drops feel free); 5%: a little harder |
| Bad-luck ramp (`FARM`) | 5 points a count, sure at 5 | Kept | At the worst luck a sure upgrade at 8 slowed campaigns to Horde 13 (94 fights against 70); 3 didn't speed them up |
| Skill ×2 (`SQUAD_SKILLS.solo`) | ×2 | Kept | The scripted player picks two skills; ID-100's tests cover ×2 |
| Gun traits and role affixes (`TRAIT`, `AFFIXES`) | SMG +25% close, … | Kept | SMG +15% and +35% didn't move the targets; the gun balance tests still pass |
| Stat caps (`STAT_EFFECT`, removed ID-146) | Sharp Mind crit 0.5 | 0.5 (kept) | The most sensitive horde-only knob (0.4: 54% first-try losses, 0.6: 17%), and the band the full game's Horror test needs (ID-096) |

Targets, each with a balance test:

- **Hordes 1–10** (`balance/horde-only.test.ts`, 20 seeds): Hordes 1–3 won
  at the first try on every seed, 4–10 on at least 60% (restored from
  ID-097's relaxed targets); every campaign beats Horde 10 (farming where it
  lost).
- **Mid-game walls** (`balance/late-hordes.test.ts`, 16 seeds to Horde 18
  since ID-153, 4 before): every campaign beats Horde 18; in new-horde fights
  from Horde 11 (every try at a new horde), enemies reach the Barbed Wire's
  band in at least 75%, and **8–30% end with at least 90% of the wall's HP**
  (ID-153: "the wall is hit in most fights, not every one"). Enemies reach
  the wall itself in almost every fight (97% over 40 seeds, 2.5% end with it
  untouched), so "any wall HP lost" can't tell a scratch from a breach; it
  read 97–100% from ID-136 on and ID-147 dropped its bound. Measured 16.9%
  over 40 seeds (15–18% over 16), and no such fight was lost (21.3% with
  ID-155's rest rule). On all 16 seeds (since ID-155; 28–106 fights), every
  campaign beats Horde 18 within 120 fights (ID-147:
  the scripted player replays the highest beaten horde while a rest leaves
  the squad short, `restWait`); most seeds (at least 3 in 4; 16 of 16 measured) lose at least one new horde at the first try
  (every seed before ID-127: Heavy Rounds, unlocked by Horde 10's boss, makes
  the squad stronger past it, by design); on all 16 seeds, farming past any
  one horde takes at most 30 replays with average luck (24 measured; seed 13
  took 37 before ID-155, see the seed 13000 spiral under the bench and rest).
- **Recommended Power** (`balance/squad-power.test.ts`): about half the
  fights won with no cards or skills, most with them (above).
- **Worst luck** (`balance/farming.test.ts`, 2 seeds): with every replay
  drop but the guaranteed ones thrown away, every campaign still beats Horde
  13, at most 45 replays at any one horde (12 measured).
- **Farming far down is never faster** (`balance/farming.test.ts`): a full
  squad stuck at Horde 16 gains about twice the Squad Power and 1.4–1.9× the
  XP per fight minute replaying Horde 15 as replaying Horde 11, on each of 3
  seeds.

### Balance pass *(ID-128)*

Late fights ran far too long (Horde 15 about 13 minutes at normal speed
against a 3–5 minute target), and Recommended Power assumed no cards, so any
card build beat it easily. Baselined on main first, then grid-tuned with the
scripted player; the PM picked overlapping waves after a probe showed the
ticket's own levers (wave size held earlier, faster spawns) could only reach
about 9 minutes: each wave waited about 28 s for its last enemy to walk in.

Measured with the scripted campaign (`playSquadCampaign`), 4 seeds to Horde 20
unless named:

| Measure | Before (main) | After |
|---|---|---|
| Fight length, new hordes 10–20 (mean per horde) | 706–840 s (Horde 15: 803 s) | 282–324 s (Horde 15: 319 s) |
| Fight length, Hordes 6–9 | 406–664 s | 182–274 s |
| First-try wins, Hordes 1–5 (20 seeds) | 100% | 100% (played as before) |
| First-try wins, Hordes 6–10 (20 seeds) | 100, 100, 95, 90, 90% | 95, 90, 80, 75, 75% |
| First-try losses, new Hordes 11–20 | 4 of 40 (10%) | 10 of 40 (25%) |
| Seeds with a first-try loss past Horde 10 | 3 of 4 | 4 of 4 |
| Most replays at any one wall | 6 | 9 |
| Enemies hit the wall, new hordes 11–20 | 51% | 85% |
| Campaign Squad Power ÷ Recommended, Hordes 11–20 | 0.51–0.65 | 1.17–1.55 |
| Squad at Recommended, with cards: wins at Hordes 9/12/15/20/25 | 100% at each | 50/60/60/50/70% |
| …at 70% / 130% of it, Hordes 10 and 15 | 5/5 and 5/5 | 0/5 and 5/5 |
| Enemies a calm Horde 15 brings (spawn seconds) | 613 (520 s) | 419 (281 s), each with 1.15× the HP |

| Value | Before | After | Why |
|---|---|---|---|
| Wave size growth (`WAVE_GROWTH.until`) | Held from Horde 10 | Held from Horde 6 (the full game keeps ×1.1) | The ticket's starting point; the squad is full at Horde 6 |
| Horde-only waves (`SQUAD_PACE`, ID-171: was `SQUAD_WAVES`) | 0.8 s apart, the next wave waits for a clear | From Horde 6: 0.6 s apart, the next wave comes once this one has all spawned (ID-171: overlap ramps 0.5, 0.75, then full from Horde 8) | Only overlap reaches ~5 minutes (§9 Shorter fights); before Horde 6 a lone survivor was buried, so early hordes play as before |
| Late HP (`SQUAD_EARLY_HP`, last entry) | 1 from Horde 11 | ×1.15 from Horde 11 | The held waves' size moved into HP. Grid: 1 kept every target but made walls shallow (3 of 4 seeds walled, at most 3 replays a wall, wall hit 74%); 1.15: 4 of 4, at most 9, 85% |
| Mini-bosses (`ELITE.more`) | One on odd hordes from Horde 5 | Plus one with the last wave of every non-boss horde from Horde 11 | The ticket's ask: more mini-bosses past Horde 10 |
| Recommended Power (`POWER.rec`) | 9.7 × HP ÷ spawn seconds, no cards; early ×0.3, ×0.6, 1, 1, 1, 1, ×0.8, ×0.8 | 3 ×, with cards; early ×0.3, ×0.6, 1, 1, ×1.9, ×1.7, ×1.25, ×1.1, ×1.4, ×1.25; past Horde 10 ×1.2 (ID-136, ID-137) | Refitted to the card build (§11 Farming); k grid 2.2–4.0 per horde, Hordes 6–20 |
| Instinct's damage near the wall (`STAT_EFFECT.wallDamage`, removed ID-146) | ×1.75 | ×2 | With cards Instinct trailed Sharp Mind by 11 points at Recommended Power (§6 Stats) |
| Wire full (`wireFull`; `rebuildWire` before ID-133) | Sized for the new wave | For every enemy still to face when more | With overlap a level 1 row held 71% of Horde 15's last wave (target 75%, measured with the rebuild at every wave break; ID-133 replaced the target, §8 Barbed Wire) |
| Loss XP's waves cleared (`wavesCleared`) | The wave reached − 1 | Waves with all their enemies gone | With overlap the wave reached runs ahead of the fight |

Targets, each with a balance test (as in ID-102 unless named):

- **Hordes 1–10** (`balance/horde-only.test.ts`, 20 seeds): unchanged, met
  as above; a lone starting survivor still wins Horde 1 on every seed and
  loses every horde from Horde 4.
- **Mid-game walls** (`balance/late-hordes.test.ts`): every campaign beats
  Horde 18; ID-128 adds a fight lasting 240–360 s on average (none over
  420 s) in new hordes from Horde 11.
- **Recommended Power** (`balance/squad-power.test.ts`): with the scripted
  player's cards and skills, each of Hordes 9, 12, 15 and 20 won 20–80%,
  35–65% on average; at 70% of it at most 1 of 5 won at Hordes 10 and 15, at
  130% at least 4 of 5. The no-card test is gone (no player fights without
  cards); `balance/cards-under-power.test.ts` builds its 70% squad from Common
  Rifles where level 1 Military ones are already over it.
- **Every horde past Horde 10 asks for more Squad Power than the last**
  (`farm.test.ts`, `harder.test.ts`; past a boss horde, more than the one
  before it).
- **Farming far down is never faster** (`balance/farming.test.ts`): the
  stuck squad now holds Lv 17 Military Rifles (Lv 15 before: with the card
  fit it stood at Horde 16's Recommended Power, short of the ~1.4× the
  campaigns reach it with, and lost half its replays). Near the wall it gains
  2.5–7× the Squad Power and 2.2–2.5× the XP a fight minute of farming Horde
  11, on each of 3 seeds.
- **Stats** (`balance/stats-close.test.ts`): the close-fight measure plays with
  cards (§6 Stats). Since ID-139 (PM) its bar is 20 points, not 10: with
  Airstrike the one skill, Agility leads (Mind 0.47, Agility 0.67, Instinct
  0.56; main before 0.47, 0.53, 0.50), and the stats were not retuned in that
  ticket.

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
- **Intro** *(as built, ID-106; art redone in ID-117)*: at launch a title screen covers the camp: the
  title art (three unarmed survivors from behind, at the near side of the wall,
  looking over it at the horde coming at dusk, kept between the title and the
  buttons on a phone, a desktop and a 16:9 window; lazy
  art that fades in, under a 70 % dim) with the title and a one-line tagline in
  the sky and, at the foot, **Continue** (only with a save, the main action),
  **New game** (asks first over a save; without one the new camp is saved at
  once, so the next launch continues) and Mute (kept in step with the Menu's).
  Enter is the main action, Esc goes back. On a first launch (no save, never
  shown) New game opens a short how-to-play card (the wall, survivors, skills,
  between hordes) that can be skipped; the Menu's Help tab opens it again. The
  "seen" flag is its own key, read back as seen only for the exact value written.
  Sound still starts only with the first click or key, and ticking Mute on
  plays no click.
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
- **Confirm panel** *(as built, ID-191)*: every question the game asks before
  something that can't be taken back (buying slots, Let go, Combine, going on
  with someone still asking to join, and in the full game Dismiss, Salvage,
  Remove a trap and Line the wall) is one small panel in the game's own dialog
  style, never the browser's popup. It shows the question with a **Confirm**
  and a **Cancel** button. Esc, a tap outside the panel or Cancel says no;
  Enter or Confirm says yes (with focus on Cancel, Enter presses Cancel).
  Focus starts on Confirm, stays inside the panel and goes back to what opened
  it. It sits above the Roster and the Inventory, and its keys go no further:
  Esc closes only the panel, and the fight's shortcuts stay quiet. The rest
  of the page is inert behind it. Only one is up at a time (a second question
  cancels the first). A no changes nothing. After a yes, the game checks again:
  if a horde has started, or the question's numbers (a price, what a full stash
  throws away) have changed meanwhile, nothing is done and the Roster says so.
  It fits a 375 px phone (the panel is at most the window's width less 32 px,
  its buttons wrap).
- **One window with tabs** *(as built, ID-183)*: the Roster and the Inventory's
  Weapons are tabs of one window ("Roster" left of "Weapons"), so moving between
  them never closes it. Each button opens it on its own tab: the top bar's
  "Roster" and "Weapons" (the button once named "Inventory"), and the start
  screen's "Change squad" and a survivor's name, which open the Roster on that
  survivor. The window has no title: its header is one row of the tabs, the
  open tab's "Best gun for everyone" ("Best gun" on a window under 360 px) and
  the close; its foot holds the Esc hint, the open tab's status line (emptied
  on a switch) and Close ("Resume" in a fight). Both tabs share one width
  (720 px, the screen's on a phone) and hang from under the top bar, so the tab
  strip stays put on a switch; the Roster tab is as tall as its content, the
  Weapons tab 620 px (the screen's height on a phone). Left and Right, Home and
  End move between the tabs; Esc steps back a layer (the gun picker, a drag, a
  Combine confirm), then closes; closing gives the keyboard back to what opened
  it. In a fight both tabs open read-only, as each did before. The build
  without the Roster has the one Weapons tab.
- **Inventory** *(as built, ID-079; a tab of the window above since ID-183,
  its button named "Weapons")*: an "Inventory" button in the top bar, left
  of the Menu (its own place, not a Menu tab), opens a dialog (between hordes
  guns are equipped and combined there too: Combine, ID-091, §6 Gear; drag and
  drop, ID-095) of what
  the camp holds now: the stash against its cap ("Stash 6/40"; from the cap on
  "Stash 40/40 (full)", as the next drop throws the weakest away), strongest
  first as in the gun picker (anything that is no gun, from an older save,
  last); each squad survivor and the gun they fight with, in squad order (not
  the reserve, which this version doesn't show, nor its guns). Each weapon shows its name in its rarity's colour, its affixes and its
  DPS. The start and result screens keep their gun pickers. It opens between
  hordes and in a fight, which it holds like the Menu; Esc or Close shuts it.
  - **As a grid (ID-092):** the dialog has tabs (Weapons only for now; items and
    materials can join later). The squad row (each survivor's gun with their
    name under it; no free-pistol tile, since Unequip already gives it) sits over the stash grid: one
    64 px square slot per stash place up to the cap, empty places drawn empty.
    A slot shows the gun's icon (one per base gun, the model the survivors
    hold, long guns laid across the square) on its rarity's tint inside a frame
    of its rarity's colour, with its DPS rounded in a corner badge (its
    tooltip gives the figure). Selecting
    a slot (click, tap, or the arrows, Home and End from its single Tab stop)
    rings it and fills the details beside the grid (under it on a phone): the
    name in its rarity's colour, "Military rarity · Rifle", its role and trait
    (ID-101), each affix on its own line, the DPS (a held gun's also in
    its holder's hands: "22.6 DPS · 26.7 DPS with Ivan"), who holds it,
    and Combine.
    Hovering a slot shows its details until the pointer leaves the grid. It
    opens on the strongest stash gun.
  - **Sort and filter the stash (ID-192):** a row of three selects sits under
    the stash heading (hidden while the stash is empty). "Sort: DPS" (the
    default: the badge figure, high to low), "Sort: Rarity" (Relic down to
    Rusty, then DPS) or "Sort: Newest" (the gun that went into the stash last
    first: a drop, a patrol find, a combine's result or a gun taken off a
    survivor all append); ties keep the stash's order and an older save's
    blade or tool is always last. "All types" or one type: Pistols (Pistol,
    Hand Cannon, Machine Pistol), SMGs (SMG), Rifles (Carbine, Assault Rifle),
    Snipers (Sniper rifle), Shotguns (Pump Shotgun, Drum Shotgun), LMGs (LMG); "All rarities" or one rarity. Each
    filter lists only what the stash holds (plus the one picked), each with its
    count over the whole stash; the two filters combine (AND), and blades and
    tools show only under "All types". Filtered, the heading adds " · N shown",
    the empty places are hidden, and a filter that hides everything shows "No
    stash guns match." with a "Show all" button (clears both filters, not the
    sort). The pick is view-only (the armoury's own order never changes), stays
    set over every redraw while the Inventory is open and resets to DPS, all,
    all each time it opens; nothing is saved. A combine whose result a rarity
    filter would hide clears that filter so the new gun stays selected. On a
    375 px phone the three selects share one row. Each slot's screen-reader label names the
    gun, its rarity, role and trait, DPS and affix count. The result screen's
    drop tile shows the same icon and tint.
  - **Drag and drop (ID-095), between hordes:** a stash gun dropped on a
    survivor's slot is theirs, the gun they held going to the stash; a
    survivor's gun dropped anywhere in the stash section (a gun, an empty
    place, its heading) goes there and they fall back to the free pistol. A
    full stash refuses that with "Stash full", so the
    stash never passes its cap and no gun is thrown away. A stash gun dropped
    on another of its set (same base gun and rarity, below Relic) with 3 or
    more opens that set's Combine confirm (the weakest 3, as ever); a short set,
    a Relic or a blade is refused with the details' wording ("1 more for a
    Common SMG"), another kind with both names first ("Rusty SMG and Common
    LMG don't combine.", the rule staying in the dragged gun's details); a gun in hand never combines.
    While dragging, the gun follows the pointer in its rarity frame (by touch,
    a slot above the finger, with a short buzz where the phone has one), its
    own slot fades, valid drops get a green ring and invalid ones grey out (red
    under the pointer); picking up a survivor's gun with the
    stash full says "Stash full" at once. Dropping on nothing, Esc, or a release
    the page never sees (the window lost it) puts it back. A mouse drag starts
    after 6 px; a touch drag after a 350 ms still press, so a finger that
    moves first still scrolls the grid, and the grid note on a touch screen
    says "Tap a gun for its buttons, or hold and drag it…". By touch the drop
    goes where the gun is drawn, above the finger, and a gun let go over the
    gap between slots goes to the nearest slot; a long-press in the grid
    selects no text (#272). Held near the grid's top or bottom edge, a drag
    scrolls the grid. Without dragging, a gun's details do the same: a
    stash gun has "Equip on…" with a button per survivor, a survivor's
    gun Unequip, beside
    Combine. Hovering a slot shows its details with a mouse only: a tap on a
    touch screen selects the gun at once, so its buttons work on the first tap
    (#272). Each move or refusal is said in a status line in the dialog's
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
- **As built (ID-146): save version 17** holds no stat points: a defender
  or survivor waiting to join is id, name, XP and loadout (or weapon), and a
  `stats` or `banked` key is refused. A v16 or older save's `stats` and
  `banked` are dropped unread as it loads (any value, prototype keys
  included, never reaches the game), each survivor's bonus comes from their
  level, and a save with anyone past level 1 says so once ("Survivor stats
  were reworked: …"), in the same places as ID-084's note.
- **As built (ID-149): save version 18** holds each roster and reserve
  survivor's profession, `job`, which must be one of the 11 (an allow-list:
  any other value, a missing one or a prototype key refuses the save). A v17
  or older save has none, and a `job` key there is refused: each survivor
  rolls one from their id and the save's `savedAt`, the same every load, and
  the next save keeps it. Survivors waiting to join (full game) have none
  until they join.
- **As built (ID-147): save version 19** keeps the camp past 6: the squad in
  `roster` (at most 6), the bench in `reserve`, both together at most
  `SQUAD_JOIN.max`. A survivor may hold `rest`, a whole number from 1 to
  `INJURY_REST.max`, written only while resting (0, a negative, a fraction,
  text or anything past the most refuses the save). A v18 or older save has
  no rest, and a `rest` key there is refused. As a save loads, anyone resting
  in the squad moves to the bench, and with nobody fit the shortest rest
  ends. The owned-weapon bound grows with the camp (`MAX_OWNED`: the stash
  and two hands per survivor).
- **As built (ID-150): save version 20** keeps survivors asking to join in
  `joining`, written only while someone waits: 1 or 2 free recruits, each
  already counted in `camp.recruits`, not in the camp, and new (level 1, the
  free pistol and nothing else, not resting or injured), with the camp and
  them together at most `SQUAD_JOIN.max`. Anything else refuses the save. A
  v19 or older save has nobody asking, and a `joining` key there is refused.
- **As built (ID-218): save version 24** may hold `mode` and `modes`, both written
  only when set. `mode` is `nightmare` or `hell` (an allow-list: look-alikes,
  hidden marks, other types and `normal` are refused; Normal is no key). `modes`
  is a plain object with `nightmare`, `hell` or both, each a whole number from 1
  to 100,000 and nothing else (`__proto__`, an empty object, a fraction, a
  negative, an extra key all refuse the save). The unlocks are stored nowhere:
  Nightmare progress needs Normal's horde past 50, Hell's needs Nightmare's, and
  the mode in play must be open, else the save is refused. A first clear on a
  mode has gun uid `n<k>` (Nightmare) or `x<k>` (Hell), `k` a horde of that mode
  already beaten. A gun's level is held to the highest horde beaten on any mode,
  as its effective number. A v23 or older save has neither key (a key there is
  refused) and loads as Normal, with a mode open if it already holds Horde 50.
- **As built (ID-179): save version 23** may hold `slots`, the purchases made,
  written only once any is bought: exactly `squad` (0 to 2) and `stash` (0 to
  4), whole numbers, and nothing else. Anything else (text, a fraction, out
  of range, an extra or missing key, `__proto__`, an array, NaN) loads with no
  slots bought and copies nothing, so the save still loads; the Scrap balance
  is the stock's `scrap`, read as before. The squad is then cut to the loaded
  cap (the rest to the bench); a stash past its cap (an older save's) is kept
  as it is and never grows, and `MAX_OWNED` counts the stash at its most (80). A v22 or older
  save has none, and a `slots` key there is refused.
- **As built (ID-209): blueprints** are in the same save version 23: see Gear (Blueprints and
  the Craft tab) for the `craft` key's rules.
- **As built (ID-154): save version 21** may hold `autoSquad`, written only
  while "Auto" best squad is ticked. Exactly `true` turns it on; any other
  value loads with it off (nothing else depends on it, so the save still
  loads). A v20 or older save has it off, and an `autoSquad` key there is
  refused.

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
  green, flesh red). *(ID-144: the kinds are now people who turned, each
  keeping its clothes' colour; the flesh-red Horror stays the most saturated.)*
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
- **As built (ID-143): the ammo bar.** A thin amber bar (2 px at zoom 1, at
  least 2 px, dark edge) sits right under each defender's HP bar and is just
  as wide, showing whenever the HP bar does: its fill is the rounds left in
  the **primary** over today's magazine (Extended Mags included); a Gunner's
  sidearm doesn't move it, and a primary that is no gun shows none. A gun
  loaded shell by shell (the Pump Shotgun, ID-135) splits it into a slot a
  shell, 1 px apart, lit from the left, so each shell going in shows (the
  slots fall back to a plain bar only below 1 px each). A magazine gun's
  bar drains shot by shot and stays empty while its reload pie (ID-078)
  fills. The HP bar, name tag, reload pie and bubble boxes sit the bar's
  height higher, gun or not, so every plate keeps its gap at any zoom. In a
  fight both bars draw after every reload pie (just before the names): on a
  phone a survivor's pie sits right under the bars of the one above, and
  never covers them.
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
  them; the win has its own lines). A wave counts as cleared once the field is
  empty and the waves cleared (`wavesCleared`) went up (ID-128). Before, it
  needed nothing left to spawn, but the next wave is set going in the same
  step the field empties, so the line never played between waves, in the full
  game either. Each event has 4–5 fixed lines; the same
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
  carries the eye over the small gap. At 5× (ID-145) it is counted as 3×
  (pistol 12 + 90 px): a bullet jumps 150 px a frame there, and a 2× tail
  left gaps as long as itself, which read as flicker; the 3× tail keeps
  the gaps short while bullets stay separate, not a beam. The fight moves
  bullets in whole 1/30 s steps, so the head is drawn carried on by the
  time since the last step (never past the spot it was aimed at before it gets there, nor past
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
  **Patch Up** (when picked) and **Field Repairs** (when used, ID-231) glow each segment they actually heal
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
  to it joins up where both are whole. A row at half its full durability or
  less shows worn (ID-115): cut partway, sagging, its pickets leaning; the
  share is of the row's own full, as this wave and level set it (ID-123),
  so a rebuilt row looks whole again, and a wave break keeps the look
  (ID-133). It's drawn in code (no art file),
  whole and torn each painted once into its own canvas
  (`src/ui/ground.ts`), and each run of rows alike is drawn in one go;
  where the browser can't paint them, a steel line down each coil of the
  working rows shows where the slow applies. (The barbed wire trap keeps
  its ID-043 sprite for now.)
  **Frag Grenades** (ID-077): the grenade
  is an olive-drab ball 13 units across with a near-black edge and a pale
  rim on its upper left, so it reads on the dark, mossy ground. It
  flies from the thrower's hand (ID-119, §15) to where it lands on a low arc
  (40 units high at the middle) with a shadow under it on the ground, then bursts in the
  shared explosion over its 70-unit reach (ID-107, below). **Concussion Rounds** (was Stopping Power) needs nothing of its own: the hit enemy visibly
  jolts back. **Shock Rounds** (ID-097): a paralysed enemy twitches side to
  side (1.5 units and 0.05 rad, flipping every 0.06 s) while electricity
  crackles over its body (generated art, ID-120, below): two crackles of forked
  bolts over a cool blue glow, each about half its height, jumping
  to new spots on its torso each flicker. No arcs between enemies. With Reduce
  motion it holds still. **The gate** is now a sliding gate: one closed panel on a
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
  killing blow and die where they fell in one of several ways (ID-110,
  `src/ui/death.ts`), fading over their last 0.35 s, each 1 s at most: tip
  over backward or pitch forward onto their front (0.7 s); lose an arm or leg,
  which arcs out from that side and lands beside them while they stagger and
  fall forward (0.9 s); or have their head burst in a spray of blood, standing
  a moment before dropping back (0.85 s). The lost piece is cut from the
  enemy's own sprite, a generated stump covers the wound and the spray is
  generated art. The boss (the Horror) instead sinks to its knees, buckling
  forward, and slams down on its front, raising dust where it lands (1 s);
  elites die at their size, and a burning body keeps burning. Each kill's
  death is picked from the fight's seed and the enemy, apart from the fight's
  own random stream, so a replay shows the same deaths. With Reduce motion
  every death is the plain one, faded in place (no limbs, spray or dust). The
  fight's last kill ends it mid-death: a win's result waits until the last
  body has died (at most 1 s, played on real time). Defenders breathe at their
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
  stay drawn effects (the spit got generated art in ID-118). The Mutated
  Horror got its art in ID-041.
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
  over 0.4 s. *(ID-107 replaced all three with live effects, and dropped
  the airstrike and flashbang art: see below.)* The skills use the `object` style (or their prompt
  as sent) rather than the angled sprite style, since they lie on the
  ground; the flashbang's soft glow kept pink from the magenta it was keyed
  out of, so the build drains all its colour (manifest `white`). The four
  horde cash shop items and three skills each show an icon (an adrenaline
  syringe, a lightning-bolt bullet, a hammer over a plank, crossed wrenches
  on a gear, a stun grenade, a burning bottle, a falling bomb) 20 px beside
  their button's label; the icon has empty alt text, so a screen reader
  reads only the label. The armed airstrike's aim shows every bomb's ring
  along the row. No drawn placeholder remains.
- **As built (ID-107): thrown skills, molotov fire and stun stars.**
  *Since ID-139 an armed Airstrike shows its area this way, fire orange, and
  survivors throw Flashbangs and Molotovs on the Frag Grenade's arc (the same
  canister and bottle art, 26 units across, smaller in the hand at the
  wind-up); fires, pops and stars are as below. Before ID-139:*
  - An armed Flashbang or Molotov shows its area at the pointer as a pale
    yellow dashed ring with a faint fill, and one burst's reach inside it
    (on touch, where nothing hovers, the tap throws it at once).
  - Each burst drops from the sky over its 0.5 s fall, speeding up and
    spinning, while its shadow grows on the ground under it: a Molotov
    bottle is its button icon's art, a Flashbang a small grey canister.
    An **Airstrike bomb** is the Heavy Rounds shell without its starburst
    (manifest `airstrike-bomb`, a Klein 4B edit of the card icon, seed 7203),
    50 units long. It keeps the plane's forward speed: it arcs in from 280
    units to the left of its spot (the plane flies left to right), nose along
    its path (near level when dropped, steep when it lands), its shadow
    sliding under it (`fallAt`).
  - A **molotov fire** is now a scorch on the ground plus live flames. The
    scorch (Klein 4B seed 7101, picked from three, colour
    drained by the build's `white` so the magenta key leaves no pink edge;
    manifest `scorch`, shared with the explosions below)
    lies flat under every sprite across 1.15 × the fire's radius at 80%,
    darkening in over 0.15 s and fading over the last 0.5 s. Over it, 13
    upright flames drawn like a burning enemy's (ID-089: red edge, orange,
    pale centre, added light) spread over the fire's circle, each shooting
    up to about 0.95 × the radius and dying away on its own cycle, moving
    to a new spot each time, with a ground glow, rising embers and three
    smoke puffs; the fire flares as it catches and shrinks as it dies. Its
    flames sort with the sprites by the fire's row. With Reduce motion they
    hold still.
  - **Explosions** (added mid-ticket by the PM). A Frag Grenade's blast and
    each Airstrike bomb's share one generated explosion, played as a flip-book
    over 1.2 s (`SKILL_FLASH`, `CARD.frag.flash`: how long a blast stays on
    screen; damage still lands at once, `FIREBALL` in `src/ui/explosion.ts`):
    a white-hot pop for the first 5%, cross-fading into the fireball by 12%
    (a dome of yellow-orange lumps outlined in dark red, red flame spikes
    behind, grey smoke), held to 40% while it grows 8%, cross-fading into
    charcoal smoke with embers (drawn as wide as the fireball) by 65%, which
    rises and fades out by the end.
    The frames stand upright on the blast's spot over every sprite, the
    Airstrike's 150 units wide and the Frag's the same blast at 95
    (`FIREBALL_WIDTH`, PM: Frag reuses it, smaller); the scorch art lies
    under it at 85%, fading over the last 45%. With Reduce motion it holds
    the fireball and only fades. The art: the PM's reference was a cartoon
    ground burst (dome, spikes, smoke behind), used only as a guide in the
    prompt. Rounds in FLUX.2 Klein 4B and Z-Image Turbo were set aside; the
    PM picked FLUX.2 [dev] (community-hosted, see the art credits) seed 7511,
    and the pop (7601) and smoke (7621) are edits of it (manifest group
    `explosion`, `ref` `explosion`). A cooling frame came out with a purple
    fringe from the magenta key and the model was unreachable to remake it,
    so the PM dropped it. A Flashbang's pop is drawn live: a soft white
    flash at 60% (dimmed by the PM) reaching at most 0.95 × its stun reach,
    a soft pale ring along the ground and thin pale smoke, with no scorch;
    its sizes never drop under 1.5 px. An earlier explosion drawn entirely
    in code (banded puffs, sparks, debris) was rejected by the PM.
  - **A Spewer's spit** (ID-118, `SPIT` in `src/ui/spit.ts`) is generated art
    in place of the drawn dots, on the same arc and timings (0.3 s in all,
    `SPEWER.splash`): an acid glob (a glossy green blob with a dripping tail,
    16 units long) flies the first half, pointing along its path with its drips
    hanging down; then a splash (a green splat with eight streaks, 28 units
    across) bursts on the spot it hit from 60% to full size within a quarter
    of the splash, cross-fades into a settling stain (the same splat, its glow
    gone, shorter streaks, short drips) and fades out. With Reduce motion the
    splash holds full size and only fades. FLUX.2 [dev] (community-hosted, as
    for the explosions) seeds 11801 (glob) and 11812 (splash); the stain
    (11824) is an edit of the splash (manifest group `acid-splash`). A first
    stain edit that turned olive with long drips was set aside.
  - **A paralysed enemy's shock** (ID-120, `SHOCK` in `src/ui/render.ts`) is
    generated art in place of the drawn zigzag, for exactly as long as the
    paralysis (`shockUntil`); paralysis time, immunity and the twitch are
    unchanged. Each 0.06 s flicker draws two crackles (one on a body under
    24 px tall on screen, so a small or far-off enemy isn't buried; forked white-and-cyan
    bolts of uneven lengths with a dark navy outline and a star spark at the
    tip of the longest) at seeded spots on the torso, each turned and mirrored
    at random and picked from three frames (all at one scale), over a soft
    blue glow (radius 55% of the body's height, 40% strong, flickering by up
    to 30%). A crackle is half the body's height (a low Crawler counts as
    three quarters of its width tall, as for fire), so it fits every kind and
    grows on the heavy ones, and the smallest frame is never under 12 px (16
    px on a burning body, so the flames don't swamp it), so it reads at 0.5×
    zoom. In a bench A/B (60 enemies all shocked at once, 300 drawn frames)
    0, 1 or 2 crackles and the glow on or off all drew in the same time
    (25.6–26.0 ms a frame in a hidden browser); the unchanged twitch is what
    a shocked crowd adds (about 2.5 ms). The crackles keep their
    outline (drawn normally, not as added light), so they read on pale bodies
    and over a burning enemy's flames, which they are drawn over. With Reduce
    motion the spots, frames and glow hold still. FLUX.2 [dev]
    (community-hosted, as for the spit) seeds 12031–12033 from one prompt
    (manifest group `shock`). Earlier probes were set aside: a round starburst
    (read as a hit flash and hid the body), long single bolts (ran off the
    frame and read as slashes) and a web of arcs (read as a net or shield).
  - A **dazed** enemy (stunned by a Flashbang, `dazedUntil`) shows 4 pale
    yellow stars with a dark edge circling its head under its HP bar, the
    near ones bigger and brighter, until the stun ends; sizes scale with
    zoom but never under 10 px across the ring and 3.5 px a star, so they
    read zoomed out and in a crowd. Shock Rounds' paralysis keeps its own
    spark, not stars.
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
  follows shots, so both keep pace at every speed and hold still while
  paused. With Reduce motion on, enemies stand on their passing frame, but
  the attack and aim poses still show, since they say what a sprite is doing.
  Rippers and Engineers in the full game keep their ID-049 stills. Each pick
  passed the art reviewer (the PM delegated the choice to it, passing a pose
  that is about 80% right).
- **As built (ID-144): every kind is a person who turned.** New walk and
  attack frames, made the same way (puppets in each kind's clothes, one seed
  and prompt per kind), dress each kind in what hints at what it does: the
  Shambler an office worker (white shirt, red tie, slacks); the Runner a lean
  jogger (orange running vest, black shorts, white shoes); the Crawler a road
  worker in a hi-vis vest, legs mostly gone, hauling itself on its arms (its
  attack a clawed swipe from the ground); the Spewer a hunched hospital
  patient in a pale blue gown, drooling green (its attack a gush of bile); the
  Swollen an obese man in a maroon shirt split over his gut (a belly slam);
  the Brute a riot officer in a helmet with a cracked visor, body armour and a
  dark uniform; the Screamer a concert-goer in a plain teal T-shirt, jaw
  stretched open (its attack a forward-leaning scream); the Horror keeps its
  mutant body, in shreds of camouflage trousers. No brands, logos or
  insignia. Each kind's clothes keep their colour (manifest `mutant` on every
  kind but the Runner, whose vest stays muted); the flesh-red Horror is the
  most saturated. The death cuts (head and limb) are redrawn on the new
  corpse frames; hit size, stats and timing are unchanged. Each draw passed a
  senior game designer review (the PM delegated approval to it); the built
  roster then passed the art reviewer and the designer's review in the fight
  view, at 0.5×, 1× and 2× zoom, with effects and deaths.
- **As built (ID-119): a survivor throws their Frag Grenade.** The survivor
  who throws (§8) plays a 0.4 s overhand throw instead of their idle or aim
  pose: the **wind-up** (the grenade drawn back over the shoulder, the other
  hand pointing at the target) for 0.15 s, then the **release** (the arm
  swung through, the hand open). Their newest grenade sets it, so a fresh
  throw starts again from the wind-up, and nobody else on the line moves.
  There is one throw per survivor look, the same for every gun, and no gun
  shows in the throwing hands, so that survivor's muzzle flash is hidden
  for those 0.4 s (they keep firing as before). The frames are painted over
  two soldier puppets (`soldier-twind`, `soldier-trel`) in the soldier's
  look, and each other look is a repaint of them, as their guns are (manifest
  `gunner-throw-*`). Through the wind-up the grenade is drawn in the
  drawn-back hand as the same olive ball it flies as, at about half its size
  (3.5 units round against 6.5; the painted one is too
  small to read at fight zoom; art review), placed from the wind-up sprite. At
  the release it leaves the open hand (measured on the release sprite, as a
  barrel tip is) from the post's height, and it still lands when the sim
  says. Only the drawing changes: the grenade records its thrower (`by`),
  and the timing and damage stay as they were. Out of a fight nobody poses.

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
  `npm run balance` (Node 22.6 or later) prints the full table for tuning;
  `npm run tune:pacing` searches the wave pacing table (§9, ID-172).
  Scrap and slots (ID-179, `data.ts`): `SQUAD_SCRAP` { base 10, perHorde 5 },
  `SQUAD_SLOT_COSTS` [500, 1,200], `STASH_SLOT` { add 10, costs [150, 250, 400,
  600] }, `SQUAD_LINE_WIDE` (the 7 and 8 fill orders); `SQUAD_CAP` (6) and
  `STASH_CAP` (40) are the base caps. A bigger squad's late Normal (ID-224):
  `SQUAD_BIG_HP` { from 30, to 50, growth 1.0725 }, with `MODES.nightmare.hpScale`
  1.16 (1.12 before) to keep Nightmare 1 in its band for the squad of 8 the mode
  tests field.
  The balance tests run apart from the unit tests (`npm run test:balance`)
  and keep their fights' results in `.cache/balance/`, keyed by the
  simulation's code, Node's version and the test file (ID-142), so they
  replay only when one of those changes.
- **Debug mode** *(as built, ID-197)*: `?debug=1` (exactly one `debug`
  parameter, exactly `1`; anything else is off) shows a red DEBUG badge that
  stays on screen and opens a Debug panel (`src/ui/debug.ts`). The camp lives
  in its own save slot (`idle-defender.debug.save`, `src/storage/debug.ts`):
  the player's save is never read or written, and "Reset debug save" starts a
  new debug camp. Between hordes it starts any horde 1–999 (from a typed
  uint32 seed, or a random one; the fight's seed is shown), and sets the camp
  level, Scrap, squad size (setting the bought squad slots to what it needs,
  so a smaller size drops them, and adding recruits),
  survivor levels, the skill pick, a gun at any rarity it can drop at, and
  fills the stash to N. In a fight it offers or grants any card the fight's
  pool still holds, runs at ×2/×5/×10 or pauses, downs a survivor, and wins or
  loses now. Every move is one the game could make (`src/core/debug.ts`): a
  gun takes a beaten horde's drop uid, a win comes from the fight's own rule
  with the field cleared (no kill XP or cash), and each camp edit must pass
  the save's own validation or is refused. Typed values are digits only, in
  range, refused (never clamped) otherwise. No simulation number changes.
