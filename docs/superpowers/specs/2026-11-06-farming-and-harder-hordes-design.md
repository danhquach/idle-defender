# Farming and harder hordes (horde-only build)

Date: 2026-11-06. Status: design draft for review. Builds alongside ID-096
(#187, stat points) and ID-097 (#188, horde cards). The numbers here are
starting points; the final ones go into `docs/design.md` before build.

Marked **(PM)** = decided by the product owner. **(designer's call)** = a
default proposed in the brainstorm that the PM did not object to; change
freely if the balance pass says so.

## 1. Why

- Late hordes are trivial: enemy HP grows ×1.20 a horde up to Horde 6, then
  only ×1.03. At survivor level 12, enemies barely reach the barbed wire. The
  player clicks Start and waits for the win. **(PM)**
- When a player does lose a horde, nothing they can do makes the squad
  stronger: a loss pays nothing, and the only move is to retry the same
  horde. **(PM)**

**Goal:** hordes become real obstacles. When a player hits a wall, they can
farm earlier hordes for levels and better guns, see how far short they are,
and come back stronger. **(PM)**

**What a wall should feel like:** the squad gets swarmed, a crowd that
pushes through bullets, wire and obstacles, or a boss horde with two or more
bosses. The player thinks "I need to get stronger", never "that was unfair".
**(PM)**

## 2. Goals, non-goals, anti-goals

Goals:
- A player who loses can always make progress by farming, even with bad luck.
- Hordes past the early game ask for more power each time, so walls happen.
- The player can see their squad's strength against each horde's demand.
- The player has things to do and choose in a fight (skills) and before it
  (guns with roles, skill picks).

Non-goals:
- Bringing back the full game's cash, shop, research, turrets or building to
  the horde-only build.
- New enemy types beyond bosses and mini-bosses.
- A fixed number of replays per wall. It depends on luck, by design. **(PM)**

Anti-goals (failure even if it "works"):
- Drops so stingy that farming feels pointless. **(PM)**
- Drops so generous they feel like free stuff. **(PM)**
- A wall that feels unfair: a loss the player can't read or answer.
- Farming the easiest horde forever being the best strategy.

## 3. Part 1: Farming

### Replaying beaten hordes (PM)
- Between hordes, the start screen has a horde picker: the next new horde
  (default) or any horde already beaten.
- A replay is a normal horde: same waves, enemies and HP as that horde
  number.

### Rewards
- **First clear** of a horde gets the best drop that horde will ever give.
  **(PM)** The drop rolls its rarity band, then moves up one rarity (Rusty
  → Common, Common → Military, …, Prototype → Relic; Relic stays Relic).
  **(designer's call)**
- **Replays** drop one gun each win from that horde's band, with the top
  rarity's share halved and the difference moved to the rarity below it.
  **(designer's call)** So farming the highest beaten horde is the best
  use of time, and Horde 1 farming is pointless.
- **Bad-luck guarantee** (replays only) **(PM: "seems ok")**: a counter goes
  up by 1 on each replay win whose drop is not an upgrade for anyone. An
  upgrade means a higher dmg/s than the weakest gun a squad survivor holds.
  Each count moves 5 points of rarity weight up one band, a soft ramp. At 5
  in a row, the next drop is guaranteed to be an upgrade: a rarity at or
  above the weakest held gun's, rerolled until its dmg/s beats it. The
  counter resets on any upgrade. It's saved with the game.
  **(designer's call: the numbers)**
  - "Weakest gun held" is each squad survivor's one gun (horde-only
    survivors carry one), the free pistol included.
  - If no gun this horde can drop could beat the weakest held gun (its
    dmg/s is above the band's best possible roll), the counter doesn't
    count and there's no reroll loop. The result screen says "Farm a higher
    horde for upgrades".
  - First clears neither count toward nor reset the counter.
- **XP:** a replay pays that horde's survivor XP (today 10 + 5 per horde
  number, ×2 in horde-only, so higher hordes pay more). A replay more than 3
  hordes below the highest beaten pays half, so farming far-down hordes for
  XP doesn't beat farming near the wall. XP is the steady, guaranteed part
  of farming. **(designer's call)**
- **A loss pays a little:** 25% of a win's survivor XP × waves cleared ÷
  the horde's waves, linear, no minimum (0 waves → 0). Still no drop on a
  loss. **(designer's call)**
- **Beaten hordes in the save:** stored as the highest horde beaten; every
  horde up to it counts as beaten. Older saves get no first-clear drops for
  hordes already beaten. **(designer's call)**
- The result screen says which kind of drop it was: "First clear", "Replay",
  or "Guaranteed upgrade".

### Gun level (PM)
- Rarity bands stop at Horde 10, so without this, gear stops growing there.
  **Every dropped gun gets a gun level equal to the horde number it dropped
  from**, first clear or replay. **(PM)**
- Each level above 1 adds 5% to the gun's base damage, before rarity and
  affixes: a Horde 20 drop deals ×1.95 of a Horde 1 drop of the same gun and
  rarity. **(designer's call: the 5%)** So the deepest horde the player can
  win is always the best place to farm, and a high-level Common can beat a
  low-level Military.
- **Combine** still needs 3 of the same base gun and rarity, of any levels;
  the result takes the highest level of the three. **(designer's call)**
- The free pistol stays level 1. Guns in older saves become level 1.
  **(designer's call)**
- The gun's level shows wherever the gun does: "Lv 12 Military Rifle" in the
  details, gun picker and drop tile, and a small level badge on its Inventory
  slot (beside the dmg/s badge, or replacing it if both don't fit).
- dmg/s everywhere (sorting, upgrades, the bad-luck guarantee, Squad Power)
  includes the level.

### Squad Power and Recommended Power
- **Squad Power** (PM: it exists and shows on the start screen, in the
  Inventory and in the fight's top-left corner): one number for the squad's
  current strength. Built from each squad survivor's sustained gun dmg/s
  (with the gun's role trait, rarity, affixes, Sharp Mind's crit and spread,
  Agility's reload), times a toughness factor from Instinct, summed over the
  squad. Cards and skills don't count; they're chosen per horde.
  **(designer's call: the formula's shape; the builder fits the weights so
  the number tracks win rate in the balance tests)**
- **Recommended Power** per horde: from that horde's total enemy HP, its
  swarm waves and its bosses. Tuned so a squad at Recommended Power wins
  about half the time with no cards or skills, and most of the time with
  them. **(designer's call)**
- Colour bands: green at or above Recommended, amber within 15% below, red
  further below. The number is always shown too, so colour isn't the only
  cue. It advises; it never blocks a start. **(designer's call)**
- The horde picker shows Recommended Power and the colour for every horde
  in the list.

### The top-left corner (fight view), redesigned (PM: layout B)
- A square **horde badge** on the left: "HORDE" label over the big horde
  number (accent colour). A boss horde marks it.
- Beside it, one panel:
  - "Wave 4/10 · 37 left".
  - Fight level and XP: "Lv 5", "62/100", and the XP bar.
  - "Power 1,240 · rec 1,400", then a **power meter**: a bar filled to Squad
    Power in its colour band, with a tick at Recommended Power. The bar's
    end is 120% of Recommended, so a squad well above it fills the bar.
- Same panel glass, borders and text colours as the rest of the HUD. It
  must fit the 48 px top band rules and phone widths (ID-094's worst-case
  rule: judge it on phone, crowd and wide renders).
- Chosen from three mockups (one panel, badge with power meter, pill strip)
  as the badge with power meter. A senior game designer review approves the
  built version.

## 4. Part 2: Harder hordes

- **Enemy HP growth stays steep after Horde 6.** The ×1.03 late growth is
  replaced by a curve set in the balance pass, so each new horde asks for
  more Squad Power than the last. **(PM: hordes must be real obstacles;
  designer's call: the curve is a balance-pass output, not set here)**
- **Swarm waves** **(PM: being swarmed is the wall's feeling)**: some waves
  are surges, spawning about twice the enemies over the same time, with
  Runners at double their usual share. From Horde 5, one wave in four is a
  swarm wave; later hordes have more. The HUD says "Swarm!" as one starts.
  **(designer's call: the numbers)**
- **Bosses with real skills** **(PM)**. Today's Horror has one quiet ability
  (Broodmother, Rammer or Regenerator) and reads as a big Brute. Every boss
  gets skills the player sees and has to answer, each with a wind-up cue
  (a glow, a pose, a sound) so it's readable. Starting set
  **(designer's call)**:
  - **Roar:** enemies within 300 px move 40% faster for 4 s.
  - **Slab throw:** from range, breaks one barbed-wire row or deals heavy
    damage to one wall segment.
  - **Armour plates:** the first 25% of its HP is plated: bullets do half
    damage until the plates break (the Sniper rifle's armour-piercing
    ignores this).
  - **Brood:** today's Broodmother, growing with each brood.
  - Rammer and Regenerator stay as options.
- **More than one boss** **(PM: yes, not limited to 1)**: boss hordes stay
  every 10th horde. Horde 10 has 1 boss, Horde 20 has 2, Horde 30 has 3,
  each with different skills. **(designer's call: the count curve)**
- A horde's bosses and their skills are fixed by its horde number, not
  rolled per run, so a replay meets the same bosses and Recommended Power
  can count them. **(designer's call)**
- **Slab throw** in horde-only: aims at a working barbed-wire row if
  Barbed Wire was picked, otherwise at a segment of the wall (the one
  concrete layer every horde-only fight has). **(designer's call)**
- **Mini-bosses** **(designer's call)**: from Horde 5, non-boss hordes can
  bring one elite enemy (a bigger Brute or Swollen) with one boss skill, so
  the step up to boss hordes isn't the only spike.

## 5. Part 3: Active skills in the horde-only build (PM)

- The full game's three skills come in: **Flashbang** (stuns), **Molotov**
  (fire on the ground), **Airstrike** (bombs a row the player picks).
- Before every horde, the start screen lets the player pick **up to 2**.
  **(PM)** They can rechoose before every horde. **(PM)** The last pick is
  pre-selected. **(designer's call)**
- **Picking only 1 doubles its effect** **(PM)**, so one strong skill can
  beat two normal ones. ×2 means each use is twice as strong, with the same
  cooldown **(designer's call)**: Flashbang 8 bursts instead of 4; Molotov
  fires burn twice as hard; Airstrike bombs hit twice as hard.
- No cash in horde-only, so skills run on cooldown only. **(designer's
  call)**
- Skill buttons sit in the fight's bottom HUD with a keyboard shortcut
  each, showing their cooldown.

## 6. Part 4: Gun roles (PM: approved)

Each gun gets a **built-in trait**, so even a Rusty one has its role, plus
**role affixes** only it can roll. Today's general affixes stay. Starting
numbers are the designer's call.

| Gun | Role | Built-in trait | Role affixes |
|---|---|---|---|
| Pistol | Backup | Fastest reload | +crit chance |
| SMG | Swarm shredder, close | +25% damage to enemies within 250 px of the wall | +close-range damage |
| Rifle | Marksman, all-rounder | +10% crit chance | +crit chance, +crit damage |
| Shotgun | Wall stopper | Pellets stagger the enemy hit (a short stop) | Wider cone, +pellets |
| LMG | Suppression | Hits slow the enemy 20% for 1 s, not stacking | +slow, +magazine |
| Sniper rifle | Boss and heavy killer | Ignores armour, pierces 1 | +damage vs bosses and heavies, +pierce |

- Swarm walls point to the SMG, LMG and Shotgun; boss and armour walls to
  the Sniper rifle and Rifle crits; the Rifle suits a mixed horde.
- The gun details (Inventory, drop tile, gun picker) name the role and
  trait, so a stuck player can farm for the right gun, not just a bigger one.
- Slow, stagger and Shock Rounds' paralysis stack but stay small, so no
  build can lock enemies in place.

## 7. Constraints

- `src/core/**` stays pure; RNG only through `src/core/rng.ts` (drops,
  bad-luck rerolls, swarm spawns and boss skills all seeded).
- Text reaches the page only through text nodes.
- Save changes (the horde picker's beaten hordes, the bad-luck counter, the
  skill pick) go through the save's allow-list and are validated on load.
- Everything here is tuned in one shared balance pass with ID-096 and
  ID-097, baselined against main (balance tests: campaign, horde-only,
  Horror), grid-tuned, with before and after numbers in `docs/design.md`.
- UI work gets the senior game designer review with in-game screenshots on
  desktop and phone. New art (boss skills, swarm cue, gun role icons) goes
  through the art reviewer gate.

## 8. Order and tickets

Each part is its own ticket. ID-096 and ID-097 land first, so Squad Power
is fitted once against the new stats and cards **(designer's call)**; the
four parts below can then be built in any order, and the balance pass comes
last.

1. **Farming** (ID-098, #189): replay picker, first-clear and replay drops,
   bad-luck guarantee, gun level, loss XP, Squad Power, Recommended Power,
   and the top-left redesign.
2. **Harder hordes** (ID-099, #190): late HP growth, swarm waves, boss
   skills, multiple bosses, mini-bosses.
3. **Skills in horde-only** (ID-100, #192): pick up to 2, ×2 for 1,
   cooldown only.
4. **Gun roles** (ID-101, #193): traits and role affixes.
5. **Balance pass** (ID-102, #194): all of the above plus ID-096 and
   ID-097, against the targets in section 1.

## 9. Left to the builder

- Squad Power's exact formula and weights, as long as it tracks win rate.
- The late HP growth curve, swarm frequency and boss count curve (balance
  pass).
- Boss skill numbers and their wind-up cues, within "readable and
  answerable".
- Role affix ranges.
