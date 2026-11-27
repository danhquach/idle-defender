# Research tier art: Wall and Barbed Wire show their research (ID-270)

Date: 2026-11-27 · Status: approved by PM

## Intent

Research Center (ID-263) changes Wall and Barbed Wire numbers, but nothing you can see. Each tier
is a significant upgrade, so a player should see on the field which tier each branch has reached.

## Goals

- Wall: each tier has its own visible art, and each tier builds on the one before it.
- Barbed Wire: each tier has its own look too (drawn in code, as the band is today).
- Readable in a fight at desktop, iPad and phone widths.

## Non-goals

- No art for Ammo or Mortars. Ammo has nothing on the field, and Wide Slick / Napalm Mortar already
  show (a bigger slick, a burning slick).
- No change to fights, numbers, the save or the Research Center window.
- Not wall looks (cosmetics): that is ID-266 (#540).

## Anti-goals (a failure even if it works)

- The Reinforce card's brace and the research art hide or blur into each other.
- A tier reads as a card the squad picked in this fight.
- A frame-rate drop in a fight (per-frame full-view textures, see the canvas perf notes).

## Approaches

1. **Add-on art laid over the current wall (picked by the PM).** Generated see-through overlays drawn
   on the wall's own textures. It works over any wall tier and any future wall look (ID-266), about
   4 to 6 images.
2. A whole new wall texture set per tier (12 images). The biggest change, but it multiplies against
   ID-266's wall looks (looks × tiers).
3. Drawn in code. Cheap, but flat; the PM prefers generated art for the wall.

## Design

### Wall (generated art)

| Highest wall node | Top of the segment (what the fight camera mostly sees) | Front face |
|---|---|---|
| none | today's wall | today's wall |
| Reinforced Wall (T1) | a light steel strip along the outer (enemy-side) edge | a steel angle along the foot |
| Steel Plating (T2) | a riveted steel frame round all four edges; the middle stays open concrete | riveted steel plates |
| Spiked Wall (T3) | T2 + a row of steel spikes jutting past the front edge toward the field | T2 + the spikes' bases |

- **Placement rule (no overlap with Reinforce):** research art lives on the edges, the frame and the
  spikes past the front. The middle of the top is left bare for the Reinforce brace X, whose feet
  only touch the frame's corners.
- **Colour:** research art is light galvanised steel with bright rivets; the brace stays dark iron.
- **Draw order:** wall texture → gate → research art → Reinforce brace → damage (cracks, chips,
  breach) → sandbags → spikes. Stage 4 (broken) shows only rubble, no research art.
- **Sandbags:** they stand only `WALL_CARD.sandbags.gap` (2) px in front of the wall and are 45% of its
  height. The spikes jut from high on the front, above the bags, and draw after the sandbags, so their
  tips lie over the bag tops and Spiked Wall stays readable with Sandbags (PM's pick).
- **Gates:** a gate segment gets the same frame and spikes. The gate's sliding panel stays
  visible inside the frame.
- **Every wall tier** (wood, metal, concrete) takes the same overlays.
- **Where it shows:** in fights and in the camp/build scene. A purchase on a result screen
  shows from the next horde, as its effect does.

### Barbed Wire (drawn in code in `ground.ts`)

| Highest wire node | Look |
|---|---|
| Razor Wire (T1) | bigger, brighter barbs, closer together |
| Thick Coils (T2) | T1 + a second, heavier coil wound beside each coil |
| Electric Wire (T3) | T2 + white-and-blue insulators on the posts and a faint blue glow along the wire |

- Static, painted once per look and tier, like today's whole/worn/torn canvases (no per-frame drawing).
- The worn and torn looks still apply on top of each tier.

## Constraints

- `src/core` stays untouched: the renderer reads the researched nodes from the state (the scene
  gets the highest wall tier and the highest wire tier).
- Art workflow: each seed is shown to the PM before more draws; the art-reviewer gate runs before use.
- Art credits / licence notes as for existing art.
- Canvas perf: overlays are data-URL images like the rest of the art, not runtime-cut canvases.

## Proof

- PM screenshots before any tests: each wall tier (0–3) × {no card, Reinforce, Sandbags} plus one
  damage stage, and each wire tier × {whole, worn}, at desktop, iPad and phone widths.
- Unit tests: tier picked from the researched set (highest counts, an unresearched game draws as
  today), draw order (research under brace, over texture), stage 4 shows no overlay.

## Left to the builder

- Exact pixel sizes, the overlay crop and how tiles repeat along a segment.
- Glow strength, barb size and coil spacing, within "readable at phone width".
