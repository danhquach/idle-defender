# Research Center (horde-only build)

Date: 2026-11-26. Status: design draft; PM accepted the recommendations; game-design review APPROVED. The numbers here are
starting points; the final ones go into `docs/design.md` before build.

Marked **(PM)** = decided by the product owner. **(designer's call)** = a
default proposed in the brainstorm that the PM did not object to; change
freely if the balance pass says so.

## 1. Why

- Scrap piles up with nowhere to go. Every sink except the patrol reroll is
  capped: squad slots (500 + 1,200), stash slots (150 + 250 + 400 + 600),
  gun upgrades (+5 max per gun), and crafting is gated by blueprints. A
  first clear of Normal pays ~6,900 Scrap (10 + 5 × horde), Nightmare ×1.5
  (~10,300), Hell ×2 (~13,800), plus salvage. **(PM: the problem)**
- The squad is already strong enough; the PM does not want a new squad stat.
  **(PM)**

**Goal:** a Research Center where Scrap buys permanent upgrades to the
wall, barbed wire, ammo and mortars, new wall weapons through combination
tech, and cosmetics. Then hordes get harder, so research is something a
player invests in, not something they can ignore. **(PM)**

## 2. Goals, non-goals, anti-goals

**Goals**
- A tech tree drawn as a chart: each node needs the one before it; top-tier
  nodes need nodes from two branches. **(PM)**
- Upgrades make fights easier; a later difficulty retune balances that out.
  **(PM)**
- A Cosmetics tab in the same window, paid in Scrap, no effect on fights.
  First gun finishes and wall looks; squad outfits later. **(PM)**
- Scrap stays useful much longer: the tree runs into Hell; cosmetics (a
  finite list, grown over time) absorb what comes after. **(designer's call)**

**Non-goals**
- Squad stats, survivor levels or gun stats (the squad is strong enough).
- Timed research, queues, Mutated Genes or Lab levels (the full game's Lab).
- Squad outfits in this pass.

**Anti-goals** (failure even if it works)
- A player who researches about as much as expected gets stuck: repeated
  losses at much higher power. Crushing a horde is fine; being stuck is not.
  **(PM, standing rule)**
- Research ignored with no cost: after the retune, skipping research must
  be noticeably harder. **(PM)**
- Cosmetics that change a fight in any way.

## 3. Approaches

| | Approach | Trade-off |
|---|---|---|
| **A (picked)** | New horde-only module, shipped as phased tickets | More tickets; small PRs, and balance moves one step at a time (the balance tests tip over easily) |
| B | Extend the full game's `src/core/research.ts` | Less new code, but drags in real-time queue, Genes and Lab levels; risks the full game |
| C | One big ticket | One balance pass, but a huge PR and a failing balance run is hard to trace |

**Picked: A (PM).** Reason: the full game's research model does not fit an
instant Scrap sink, and the balance tests need changes one at a time.

## 4. Phases (one GitHub ticket each, in order)

1. **ID-263 (#537) Research Center + Tier 1–3 upgrades** for existing cards (Wall, Barbed
   Wire, Ammo, Mortars). Window, chart, save, buying, effects.
2. **ID-264 (#538) Tier 4 combination tech**: new cards (e.g. Wall Machine Gun). Each new
   card gets its own balance probe.
3. **ID-265 (#539) Difficulty retune** to a partly researched player (§7). Moved ahead of
   cosmetics so the window where researchers crush hordes stays short.
   **(game-design review)**
4. **ID-266 (#540) Cosmetics tab**: gun finishes and wall looks.
5. **Squad outfits** (later; not planned here).

## 5. The window (PM picked layout A from mock-ups)

- **Two tabs:** "Upgrades · 9/14" and "Cosmetics · 3/18" (counts = done /
  total). The Scrap balance shows in the header. **(PM)**
- **Upgrades tab: chart tree + detail panel.** Branches are rows, tiers run
  left to right, connector lines join a node to what it unlocks. A combo
  node draws a line from each parent (two branches) and has a distinct
  (purple) edge. Clicking a node fills the detail panel: name, effect,
  needs (✓/○ each), unlocks, and the Research button with its price. **(PM)**
- **Node states:** researched (green, ✓), can research (amber, price shown),
  locked (grey dashed, "needs X + Y"). Greyed-and-dashed when short of
  Scrap, with progress ("1,200/1,800 Scrap"), as the slot buttons do.
  **(designer's call: match the slot buttons)**
- **Cosmetics tab:** cards grouped by kind (Gun finishes, Wall look), each
  with a preview, and "price" / "Owned · Equip" / "✓ Equipped". One finish
  and one wall look equipped at a time; the default look is always owned.
  **(designer's call)**
- **Counts** show what exists: 11 nodes in phase 1, 14 once Tier 4 lands.
- **Where it opens:** a "Research" button in the top bar with Roster and
  Inventory. Browsing works any time; buying and equipping only between
  hordes, reusing the slot purchases' between-hordes rule (a "Research between hordes" message in a fight). **(designer's
  call)**
- **Devices:** desktop and iPad first; on a phone the chart scrolls
  sideways and the detail panel moves under it. Compact, content-sized
  panels (standing UI rules). **(designer's call)**
- **Badge:** the top-bar Research button shows a small dot when a node is
  affordable between hordes, so players find the feature. **(game-design
  review)**
- Buying asks first with the game's confirm panel (Tier 3 and 4 confirms
  repeat the effect text) and reports on the status
  line ("Researched Steel Plating · 600 Scrap spent, 1,740 left."), as slot
  purchases do. **(designer's call)**

## 6. The tree (starting points)

Research is instant and permanent. **(designer's call)** Upgrades change
cards the player already picks in a fight: researched Barbed Wire is
stronger when picked; a wall upgrade applies every fight (the wall is
always there). Tier 4 adds new cards to the pool. **(designer's call)**

- **Ammo is card-based, not a squad stat:** the Ammo branch makes ammo cards
  stronger, so the "no squad stats" non-goal holds. **(PM approved the
  recommendation)**
- **Offer weight (PM approved the recommendation):** each researched node in
  a card's branch raises that card's offer weight a little (starting point:
  +15% per node, so a fully researched 3-node branch is ×1.45), with the
  total added weight across all cards capped at +25% of the whole pool.
  Before phase 1 merges, probe Horde 4 and Horde 9 (the known knife-edges)
  with a fully researched tree, and again in phase 2 for each Tier 4 card. **(game-design review)** The wall
  branch needs none (the wall is always there). Watch card-pool dilution
  (other cards offered less) in the balance pass.
- **Existing mechanics:** Spiked Wall reuses Crawler climbing (`CRAWLER`);
  Electric Wire and Shock Net reuse the Flashbang stun and its immunity
  window. No new status types.

| Branch | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| Wall | Reinforced Wall: wall HP +15% (200) | Steel Plating: +30% (600) | Spiked Wall: climbers take damage (1,500) |
| Barbed Wire | Razor Wire: bleed +25% (200) | Thick Coils: wire HP +50% (600) | Electric Wire: brief stun (1,500) |
| Ammo | Hand-loads: ammo cards (Heavy Rounds, Incendiary, Scavenged Ammo…) +10% (400) | Armour-piercing: ammo cards also ignore 20% armour (1,200) | (none) |
| Mortars | Quick Mortars: Oil Bomb every 16 s instead of 20 (300) | Wide Slick: slick radius +25% (800) | Napalm Mortar: slicks start lit (2,000) |

Tier 4 (combination, phase 2), each joining two branches:

| Node | Needs | Effect | Cost |
|---|---|---|---|
| Wall Machine Gun | Spiked Wall + Armour-piercing | New card: wall-mounted machine gun (like the Oil Bomb mortars, not fired by a survivor) | 6,000 |
| Shock Net | Electric Wire + Steel Plating | New card: a stun field in the wire band | 5,500 |
| Tar Moat | Napalm Mortar + Spiked Wall | New card: a tar strip along the wall's front | 5,000 |

Totals: Tiers 1–3 ≈ 9,300, Tier 4 ≈ 16,500, so ≈ 25,800. A player affords
Tiers 1–3 around the end of Normal, and the tree runs on into Hell instead
of ending in Nightmare. Replay income (`FARM`) must be counted when the
balance pass sets the real numbers. **(game-design review; designer's call
on names and numbers)**

Hand-loads merges the earlier +5% and +10% ammo nodes so Tier 1 Ammo has an
effect you can actually notice. Mortars gets a real Tier 3 (Napalm Mortar),
and each combo crosses two branches. **(game-design review)**

## 7. Difficulty retune (phase 3)

- Hordes are retuned so a player who has researched **60–70%** of the tree
  they could afford by that horde sits where today's unresearched player
  does. A player who skips research finds it noticeably harder; one who
  researches roughly as expected is never stuck. **(PM: 60–70%)**
- **Reference player:** at each horde, the scripted player owns the cheapest
  nodes it could have bought with 65% of the Scrap earned so far (wins plus
  salvage, at the worst luck), capped at the tree. **(designer's call)**
- **Phases 1–2:** the balance tests keep the unresearched scripted player
  (pinned numbers don't move). Each effect gets unit tests, plus one
  full-tree balance smoke check that nothing turns a win into a loss. **(PM
  approved the recommendation)**
- **Income counted:** wins and salvage at the worst luck, with each mode's
  Scrap multiplier; slot purchases are deducted first. **(PM approved)**
- The balance tests gain this reference research per horde; tests that
  pin today's numbers move to it. The scripted player still never buys
  slots. **(designer's call)**
- **Stuck guard:** a test that a 40% researcher at Recommended Power keeps a
  win-rate floor over the usual ~20 seeds: it may lose some fights but is
  never stuck over repeated attempts (a 0% researcher is free to lose); hordes are never tuned past the 65% reference player.
  **(game-design review)**
- Until phase 3 lands the game is a little easier for researchers. That's
  acceptable (OP is fine, stuck is not). **(PM: retune after release)**

## 8. Cosmetics (phase 4)

- **Gun finishes:** one finish applies to every gun the squad holds
  (e.g. Olive drab default, Rust red, Glow sights, Gold trim). Made as
  recoloured sprites at build time, not tinted per frame at runtime (runtime
  canvas sources draw slowly in the fight scene). **(designer's call)**
- **Wall looks:** alternate wall art sets (e.g. Scrap plates default,
  Painted stripes, Sandbag rim, Spray tags). **(designer's call)**
- **Starting count:** 3 paid finishes + 3 paid wall looks; prices 300–2,500,
  plus one prestige item of each kind at 10,000+ Scrap.
- **Bounded, honestly:** the cosmetics list is a finite sink (~30,000 with
  the prestige items). Keeping Scrap useful long-term means adding a few
  looks over time (data only). **(game-design review)**
  More can be added later without code changes beyond data. Phase 4 ships
  with whatever has passed the art gate, at least 1 finish and 1 wall look,
  rather than waiting for all six. **(PM approved the recommendation)**
- Art follows the existing workflow: each seed shown to the PM before more
  draws; art reviewer gate before use.

## 9. Save and data

- New save field for researched nodes and owned/equipped cosmetics; a save
  without it means nothing researched and the default looks. **(designer's
  call)**
- Read back through an allow-list of known ids (unknown ids dropped,
  duplicates removed, size capped); a node whose prerequisites are missing
  is dropped. This touches save parsing, so it gets the security-devops
  audit and hostile-payload tests. **(project rule)**
- Tree, costs and effects live in data (`src/core/data.ts`); logic in a new
  pure module (e.g. `src/core/techtree.ts`), no DOM. **(designer's call)**
- Scrap refunds: none; research and cosmetics are permanent. **(designer's
  call)**

## 10. Left to the builder

- Exact effect hooks into each card's code and the Tier 4 cards' full rules
  (each Tier 4 card's ticket specifies them in `docs/design.md`).
- Chart drawing (DOM + SVG lines vs canvas), within the no-HTML-sinks rule.
- Save version number and migration details.
- Final names, icons and copy (UX copy pass).
