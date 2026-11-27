# Code map

Where things live and how they connect. Mechanics and numbers are in `docs/design.md`;
this page only says which file to open. Keep it at module level: update it when a module
is added, removed or changes job, not for every new function.

## Layers

```
src/main.ts ─► src/ui/app.ts ─► src/core/**     (pure simulation)
                     │
                     └────────► src/storage/**  (localStorage, backup code, settings)
```

- `src/core/**`: the simulation. No DOM, no storage, no UI imports (ESLint
  `no-restricted-imports` in `eslint.config.js`). Actions return new state (a few internal
  helpers mutate a clone and say "Mutates"); time comes in as `now` or `dt`, never from a
  clock. Randomness only through `core/rng.ts`.
- `src/storage/**`: reads and writes the browser. Imports core; never the UI.
- `src/ui/**`: the page. Imports core and storage. Text reaches the page only via
  `textContent` / DOM nodes (`innerHTML` is banned by ESLint).

## The build that ships: horde-only

`HORDE_ONLY = true` in `core/data.ts`. The game runs one loop: squad screen → fight a
horde → result → next horde (`core/hordeonly.ts`). The full game's systems (build the
base, camp levels, patrols, power, research: `core/patrol.ts`, `power.ts`, `research.ts`,
most of `camp.ts`; `ui/build.ts`, `worldmap.ts`, `roster.ts`, `perks.ts`) still compile
and their state rides along in the save. `app.ts` (and `hud.ts`, `menu.ts`, `save.ts`)
branch on `HORDE_ONLY`. `app.ts`'s idle frame keeps a full-game branch, taken only when
there is a build panel, that runs the between-horde chain (`recover` → research →
generator → batteries → patrols → recruits); the shipping build has no panel and skips it.
Some modules are shared: `core/base.ts` is the wall the fight runs on, `core/perks.ts`
gives `levelScale`, `camp.ts` gives `recruit`.

## Runtime flow

1. `main.ts` loads the art (`ui/sprites.ts` `loadArt`), then calls `ui/app.ts` `start`.
2. `start` loads the save (`storage/save.ts` `loadSave`) or makes `newGame`, builds the
   DOM (HUD, menu, roster, inventory, intro) and starts the `requestAnimationFrame` loop.
3. Between hordes, every player action is a core function on `GameState`, passed to
   `commit(next)` in `app.ts`, which writes the save at once (`writeSave`).
4. A fight starts with `startSquadHorde` (`core/hordeonly.ts`), giving a `HordeState`.
5. Each frame: `tick(horde, dt)` (`core/horde.ts`) → `cuesBetween` (`ui/sound.ts`) for
   sounds → `drawScene` (`ui/render.ts`) for the canvas → `hud.update` (`ui/hud.ts`).
6. The fight ends → `finishSquadHorde` folds XP, drops, injuries and joins back into
   `GameState` → `commit`. A fight in progress is never saved; only `GameState` is.

## core/ — simulation

| File | Owns |
| --- | --- |
| `data.ts` | Every tuning number and content table: `WEAPONS`, `ENEMIES`, `BOSSES`, `SKILLS`, `PERKS`, `JOBS`, squad/stash caps, drop and craft rates. Start here for any number. Ids and numbers only: the tables' names, texts and tips are in `ui/text/` (ID-269); `RECRUIT_NAMES` (survivor names, RNG-picked and saved) stays here. |
| `horde.ts` | The fight: `HordeState`, `tick`, enemies, defenders, wall, shots, damage, boss and horror behaviour. The biggest core file. |
| `hordeonly.ts` | The shipping loop: squad pick, `startSquadHorde` / `finishSquadHorde`, guns in the stash (equip, upgrade, combine, salvage, craft), survivors joining, combine, rest, Medicine treats a rest (`treatSurvivor`, ID-220). Also `hordeKindHp` (a horde's HP by kind) and `fitFor` (the fit context), and `bestSquad` / `bestGuns`, which in a higher mode maximise effective power (ID-237); `handWorth` is the one score Best gun and the gun picker share (a gun's Power in a survivor's hands; in a higher mode, for a squad survivor, what it adds to the squad's effective power). `startSquadHorde` stands the squad on the firing line by gun reach, shortest in the middle (`slotsByReach`, ID-248). |
| `game.ts` | `GameState`, `newGame`, the full game's between-horde loop (`startHorde`, `finishHorde`, `recover`). |
| `waves.ts` | Wave count and size, enemy HP growth, wave mix, horror abilities. Themed hordes (ID-238): `isThemed`, `themeMix`, `themeKind`, `themeScale` (a themed wave's count, HP and XP factors at the plain horde's totals). |
| `themes.ts` | Themed hordes (ID-238): `themeAt` / `themeSequence` / `themeOf` (a pure pick from the save's theme seed, per mode), `themeCleared`, `withCleared`, `themedSlotsBeaten` (the most themes a save's `cleared` may list), and the two RNG streams. The tables are `THEMES` / `THEME` in `data.ts`; the first-clear gun is `themeReward` / `winStash` in `hordeonly.ts`. |
| `techtree.ts` | Research Center rules (ID-263): `techState` / `techRefusal` (a refusal code) / `researchTech` (a pure purchase: Scrap off, `tech` kept in table order, no refund), `techReady` (the top bar's dot), `unlocksOf`, `cleanTech` (the allow-list the save reader uses). `needs` is a list (ID-264: a Tier 4 combo needs two parents; every parent counts, a refusal names the first missing one, `cleanTech` drops a combo when either goes). The nodes, costs and effect numbers are `TECH` / `TECH_FX` in `data.ts` (names, effect words and branch names: `TECH_NAME` / `TECH_EFFECT` / `TECH_BRANCH_NAME` in `ui/text/names.ts`, ID-269); fight hooks (`hasTech`) in `horde.ts`; offer weight (`offerWeights`, which skips Tier 4) and card texts in `cards.ts`. The three Tier 4 cards (ID-264: Wall Machine Gun, Shock Net, Tar Moat) join a fight's pool through `techCards` in `hordeonly.ts` (`TECH_CARD` in `data.ts`; `isTechCard` keeps them out of `SQUAD_CARDS` and the full game); their fight code is `fireWallGun`, `shockNet`, `moatTick` in `horde.ts` (state: `gunDps` set in `startSquadHorde`, `nextGunAt`, `nextNetAt`, `moat`, an enemy's `nettedUntil`; all absent unless researched or picked). |
| `pacing.ts` | How fast a horde's enemies arrive, and `hordeSeconds` (how long its waves take to spawn; moved here from `squadpower.ts` in ID-264 so `hordeonly.ts` can read it, `squadpower.ts` re-exports it). |
| `cards.ts` | The 1-of-3 upgrade cards in a fight (`UPGRADES`: category, rarity, levels), who can take one (`eligible`), offer, reroll, ban, stat/repair effects (`applyUpgrade`) and which synergy a pick turns on (`synergyOf`, an id). Card names, texts and the offer's words are in `ui/text/cards.ts`. |
| `skills.ts` / `shop.ts` / `replace.ts` | Active skills (and Field Repairs' once-per-pick use, `repairsState` / `useRepairs`, ID-231), the mid-fight cash shop, swapping a survivor in between waves. |
| `armoury.ts` / `loadout.ts` / `craft.ts` | Owned guns with rarity and affixes; what a defender carries; blueprints. |
| `stats.ts` / `jobs.ts` | Survivor levels, XP curve, professions and their bonuses; `survivorDps` (paper dmg/s, every DPS label), `ratedDps` (× `POWER.gun`, what Squad Power and the squad tools count, ID-247) and `gunWorth` (a gun alone, level 1 and no profession: drop and stash scoring, ID-248). |
| `camp.ts` | Recruits (shared); camp level, capacity and upgrade offers (full game). |
| `squadpower.ts` | Squad Power vs Recommended Power shown before a fight; `squadFit`, the Fit pill's value, band and classes to add (ID-237). |
| `traits.ts` | Gun classes against enemy traits (ID-237): `classOf`, `classFactor` (the fight's damage factor), `fitContext` / `effectivePower` / `worstCover` / `fitOfSquad` (what the squad tools and the Fit pill measure). Imports `data`, `modes` and `armoury` only; the tables are `GUN_CLASS` and `ENEMY_TRAITS` in `data.ts`. |
| `modes.ts` | Difficulty modes (Normal / Nightmare / Hell): unlocks, each mode's local horde, effective horde, boss skills (Hell's new one each), Scrap and rarity boosts. A horde's screen name ("Nightmare 30", ID-267) is `hordeName` in `ui/text/names.ts`. |
| `refusal.ts` | Every refusal as a code and its facts (`Refusal`, `RefusalWhy`, ID-269): what an action or a lock returns instead of a sentence. `ui/text/refusals.ts` words each code. |
| `base.ts` | The base's wall, posts, turrets and traps; the fight runs on it (`squadBase` for the squad build). |
| `perks.ts` | Commander perks; `levelScale` is used by the fight. |
| `scout.ts` | The horde-only World map (ID-219): its areas, sending a patrol team from the bench, team power and risk, real-time trips, the report rolled from the patrol's seed and taking it, and the Reroll (ID-252: `rerollCost`, `rerollRefusal`, `rerollMap`). |
| `research.ts` / `power.ts` / `patrol.ts` | Full-game systems (see above). |
| `sim.ts` | Headless scripted player for balance tests; its `balanceReport` is dev text and stays in core. |
| `debug.ts` | Debug-mode edits (jump to a horde, set scrap or squad size); its refusals are dev text (`reason` strings) and stay in core. |
| `rng.ts` | The seeded RNG. |
| `testing.ts` | Test fixtures only; never imported by game code. |
| `text-guard.test.ts` | Fails on player-facing text in core (ID-269): a sentence or a string under a text key (`name`, `text`, `tip`, `reason`, …) in any non-test core file but `sim.ts`, `debug.ts`, `testing.ts`, `balance/` and the survivor-name lists. Throw messages pass. |
| `balance/` | Balance tests (`npm run test:balance`), cached by a hash of `src/core` in `.cache/balance/`. |
| `balance/refplayer.ts` | The reference player (ID-265; a test fixture, never shipping code): `refEarned(mode, n)` (the start stock plus the first clears' Scrap at every horde before `n`, times `REF_EARNED_FACTOR`) and `refTech(mode, n, share = 0.65)` (all slot purchases come off first, then `share` of the rest buys the cheapest open node, ties in `TECH_IDS` order). Deterministic, no RNG; `withRef` in `balance/shared.ts` puts its nodes on a game. Pinned by `refplayer.test.ts`. |

## storage/ — the browser

| File | Owns |
| --- | --- |
| `save.ts` | Versioned JSON save (`SAVE_VERSION`), `encodeSave` / `decodeSave`, one `read*` allow-list reader per part of `GameState` (`readThemes`, v26: seed, cleared themes, and the `t<k>` theme-gun checks; `readTech`, v27: the Research Center nodes, tolerant, never refuses the save), upgrades from older versions. |
| `validate.ts` | Small allow-list readers (`num`, `int`, `oneOf`, …) used by every `save.ts` reader. |
| `code.ts` | The backup code: export and import the save as one line of text. |
| `settings.ts` | Settings outside the save: mute, volumes, speed, reduced motion, auto-strike, chatter (`ChatterLevel`, `CHATTER_LEVELS`), how-to seen, Airstrike hint seen, Roster folds (ID-256: Bench and Details shut or open; only "1" is shut). |
| `debug.ts` | The debug URL flag and its separate save slot. |
| `testing.ts` | Old-save fixtures for migration tests. |

## ui/ — the page

| Area | Files |
| --- | --- |
| Wiring and frame loop | `app.ts` (all callbacks from panels into core, `commit`, the frame loop) |
| Canvas | `render.ts` (draws a fight and the camp), `projection.ts` (camera, angled view), `ground.ts` (tiles), `buildscene.ts` (camp scene) |
| Sprites and effects | `sprites.ts` (art ids, URLs, loading), `anim.ts` (frames, gait), `death.ts`, `explosion.ts`, `spit.ts` |
| In-fight HUD | `hud.ts` (status bar, card pick, skills, shop, result and squad screens, scrap chip, the World map globe button), `chatter.ts` (speech bubbles and their lines, own seeded source; moved from core, ID-269) |
| The game's words (ID-269) | `text/`: `refusals.ts` (`refusalText`: every refusal code as its sentence; `Refused` / `refusedText` for a panel that also gets UI wait notes; `lockText`), `names.ts` (id-keyed name tables: areas, dangers, modes, perks, research, themes and tips, jobs, …; `hordeName`, `unlockHint`, `restLabel`, `placeName`, `entryName`, `traitName`), `guns.ts` (`heldName`, `levelName`, `heldLabel`, affix lines, `roleOf` / `roleLine`, `WEAPON_NAME`, `RARITY_NAME`, `GUN_ROLE`, `GUN_CLASS_NAME`), `cards.ts` (`CARD_NAME`, `CARD_TEXT`, `effectAt`, `cardPitch`, `synergyText`), `index.ts` (re-exports). Pure: no DOM. Each table is typed by its core table, so a new id without words fails tsc; `*.test.ts` there pin the sentences |
| Camp window | `campwindow.ts` (tabs) → `squadroster.ts` (Roster), `inventory.ts` (Weapons; ID-242: Stash / Bench tabs, the bench's gun picker over `gunpick.ts`; ID-253: `slotFace` is the one builder of a gun slot's four corners, the ready mark (`readyMark`, ID-261: three chevrons) sits on the cell and the slot gets `data-ready` for its green ring, the ⓘ icon key is `ICON_KEY`), `craft.ts` (Craft), `mapview.ts` (World map, ID-219; its words in `maptext.ts`, which also names the Roster's patrol blocks, ID-234); helpers `gunpick.ts`, `jobtext.ts`, `statlines.ts` (class lines, Help trait table, Fit words; ID-237), `classicon.ts` (gun class icon, badge and chip; ID-237, ID-254), `joining.ts` |
| Research Center | `researchcenter.ts` (ID-263): `createResearchCenter` (its own camp window with one tab, "Upgrades · n/14"; the chart with a fourth tier column for the Tier 4 combos (purple `data-combo` edge; `connectors(doc, have, active)` draws each combo's two lines at right angles through the gutters, faint until the node or a parent is active, set by `mark` on select, hover and focus; locked faces use `TECH_SHORT`), connector lines, detail panel, the top-bar button and its dot), the texts `researchQuestion` / `researchText` / `nodeFace` / `researchOffer`. Buying is `researchNode` in `app.ts` (asks, checks between hordes, commits). Top-bar room: `--research-w` in `page.css`. |
| Dialogs and screens | `menu.ts` (settings, save, help), `confirm.ts`, `intro.ts` + `introTitle.ts`, `landscape.ts` (phone turn prompt), `debug.ts` (debug panel) |
| Audio | `audio.ts` (Web Audio engine), `sound.ts` (cues from state changes) |
| Shared bits | `kit.ts` (button variants), `fastforward.ts` (fight speed), `hold.ts` (press-and-hold: the Airstrike's button and Q turn Auto on or off, ID-232) |
| Full game only | `build.ts` (build panel; `app.ts`/`menu.ts` still import a few notes from it), `worldmap.ts`, `roster.ts` (old roster panel; only `recruitNotice` is shared), `perks.ts` (perk loadout panel) |
| Styles | `src/page.css` (all page CSS) |
| Tests | `testing.ts` (UI test helpers) |

## Outside src/

- `src/assets/art/` — game sprites (PNG), loaded by `ui/sprites.ts`. `art-src/` —
  `manifest.json` (prompt, model, seed per asset), generations and poses; `tools/art/`
  builds the sprites from them. `art-concepts/` — concept art, not shipped.
- `src/assets/sounds/`, `src/assets/fonts/` — audio and fonts; `tools/audio/` prepares the
  audio.
- `tools/` — `balance.mjs`, `tune-pacing.mjs`, version check and the pre-push hook.
- `public/` — icons, web manifest, share image. `index.html` — the page shell.
- `.github/workflows/` — `ci.yml` (QA on PRs), `pages.yml` (deploy).
- `docs/art-credits.md`, `docs/audio-credits.md` — credits for third-party assets.

## To change X, open Y

| Change | Where |
| --- | --- |
| A number (damage, HP, cost, rate) | `core/data.ts` |
| A word the player reads: a refusal, a name, a card text, a tip | `ui/text/` (`refusals.ts`, `names.ts`, `guns.ts`, `cards.ts`); not a simulation change, no balance replay (ID-269). Text that stays in core, where an edit still replays balance: `balanceReport` (`core/sim.ts`), `core/debug.ts`'s refusals, `core/testing.ts`, `RECRUIT_NAMES` (`core/data.ts`) and the start squad's names (`core/game.ts`) |
| A new refusal | a member of `RefusalWhy` in `core/refusal.ts` (a code and its facts, no words), returned by the core action or lock; its sentence in `TEXT` (`ui/text/refusals.ts`, tsc fails without one) and a pin in `ui/text/refusals.test.ts` |
| What a Weapons slot shows in its corners, the ready mark, or the icon key | `slotFace`, `slot` and `ICON_KEY` in `ui/inventory.ts`; positions, the gun band, the ready ring and chevrons in the `.inv-slot-*`, `.inv-slot .gun-icon`, `.inv-slot[data-ready='true']` and `.inv-ready*` rules in `page.css` (pinned in `page-css.test.ts`) |
| A new gun | `WEAPONS` in `core/data.ts` (its name in `WEAPON_NAME`, role in `GUN_ROLE`, `ui/text/guns.ts`); drop rules in `core/armoury.ts`; art ids in `ui/sprites.ts` (an icon plus held and aim sprites per look), PNGs in `src/assets/art/` built via `art-src/manifest.json` + `tools/art/` |
| A new enemy or boss | `ENEMIES` / `BOSSES` in `core/data.ts`; behaviour in `core/horde.ts`; mix in `core/waves.ts`; art in `ui/sprites.ts` + `ui/render.ts` |
| A new in-fight card | id in the `UpgradeId` type (`core/horde.ts`); entry and category in `UPGRADES` (`core/cards.ts`), its name and text in `CARD_NAME` / `CARD_TEXT` and any number in its words in `effectAt` (`ui/text/cards.ts`); stat/repair effect in `applyUpgrade` (`core/cards.ts`), behaviour effect where `core/horde.ts` checks the card. The squad pool (`SQUAD_CARDS`) picks it up by category. A mode reward card instead: id in `ModeCard` and `MODE_UNLOCKS` (`core/data.ts`), its fight-relevance gate in `modeCardRelevant` (`core/cards.ts`); it joins the pool only through `modeCards` (`core/hordeonly.ts`). |
| A new skill | `SKILLS` and `SkillId` in `core/data.ts` (its name in `ACTIVE_SKILL_NAME`, `ui/text/names.ts`); launch in `core/skills.ts`; landing in `core/horde.ts`; button in `ui/hud.ts`; art in `ui/sprites.ts` + `ui/render.ts`. Field Repairs is no `SkillId`: `repairsButton` in `ui/hud.ts`, key F in `ui/app.ts`. The Airstrike's Auto is a pill on its button (`.hud-strike` wrapper in `ui/hud.ts`); a hold on the button (`hud.ts`) or Q (`app.ts`) toggles it through `ui/hold.ts` |
| Fight rules | `core/horde.ts` |
| Who stands where on the firing line | `slotsByReach` and `squadLine` in `core/hordeonly.ts` (shortest-reach gun takes the middle; the orders are `SQUAD_LINE` / `SQUAD_LINE_WIDE` in `core/data.ts`); a swap-in takes the slot of the one pulled back (`swapOut`, `core/horde.ts`) |
| A gun's class, an enemy's trait, or the trait numbers (Nightmare and Hell) | `GUN_CLASS`, `ENEMY_TRAITS`, `FIT` in `core/data.ts`; `resist` / `weak` per mode in `MODES` (`core/modes.ts`); the factor in `core/traits.ts` (applied in `fly`, `core/horde.ts`); the class line and Help table in `ui/statlines.ts`, badge in `ui/classicon.ts` (`classBadge`; colours in the `--class-*` tokens and the `.class-badge` rules in `page.css`, the Roster card's corner in `.rv-tab-gun .class-badge`), picker chips and Fit pill in `ui/hud.ts`, damage-number look in `ui/render.ts` |
| A damage number's colour, or when a crit shows orange | colours `COLOR.pop*` and the pick in `popLook` (`ui/render.ts`); the near-ceiling crit line `TOP_CRIT` (`core/data.ts`), marked at the shot (`top` on `Bullet` and `Pop`, `core/horde.ts`); the Help tab's key `DAMAGE_NUMBERS` (`ui/menu.ts`) with its `--color-pop-*` tokens and `.menu-pop` rules in `page.css` (kept equal to `COLOR` by `page-css.test.ts`) |
| Squad Power, or a gun's worth in it | per-gun factor `POWER.gun` in `core/data.ts` (every gun needs one; `core/gunfactor.test.ts` checks); `ratedDps` in `core/stats.ts` (`survivorDps` stays paper dmg/s for every DPS label); `powerOf` (exported) in `core/hordeonly.ts` feeds `survivorPower` (Squad Power, HUD, map, scout, Best squad), Best gun's `plainMove` / `fitMove` and the gun picker's ranking and ▲/▼ (`ui/gunpick.ts`, through `handWorth`, which matches `fitMove` in a higher mode); drop and stash scoring (`squadGain`, `weakestHeld`, `stashWith`) use `ratedDps` / `gunWorth` (ID-248); shown vs Recommended in `core/squadpower.ts`; parity pinned by `core/balance/gun-parity.test.ts` |
| A horde theme (name, kind, share, tip, answering guns) or the theme numbers | `THEMES`, `THEME`, `THEME_IDS` in `core/data.ts` (name and tip in `THEME_NAME` / `THEME_TIP`, `ui/text/names.ts`) (`THEME_IDS` order is save format: append only); selection in `core/themes.ts`; count / HP / XP factors in `themeScale` (`core/waves.ts`), used by `spawn`, `waveEnemies`, `killXp` (`core/horde.ts`) and `hordeKindHp` (`core/hordeonly.ts`); reward in `themeReward` / `winStash` (`core/hordeonly.ts`); picker option, banner and warning in `ui/hud.ts` |
| Difficulty mode numbers or unlocks | `MODES` in `core/modes.ts`; mode cards in `MODE_UNLOCKS` (`core/data.ts`) and `modeCards` (`core/hordeonly.ts`); start-screen switch in `ui/hud.ts` |
| A boss skill (Hell's included) | `BossSkill` and `BOSS_SKILL` (`core/data.ts`); clocks and effects in `mutate` and its helpers (`core/horde.ts`); name and cue in `ui/hud.ts`, glow and marks in `ui/render.ts`, sounds in `ui/audio.ts` and `ui/sound.ts` |
| What happens after a fight | `finishSquadHorde` in `core/hordeonly.ts` |
| A new field on `GameState` | `core/game.ts`; then a `read*` in `storage/save.ts` with a default for older saves, bump `SAVE_VERSION` (note it in its comment, add the old number to `readSave`'s list), add an old-save fixture in `storage/testing.ts` |
| HUD text or buttons in a fight | `ui/hud.ts` |
| Roster / Weapons / Craft / World map tabs | `ui/squadroster.ts` / `ui/inventory.ts` / `ui/craft.ts` / `ui/mapview.ts` |
| How hard fights get for a researched player (the research HP ramp, or the reference player's schedule) | `SQUAD_RESEARCH_HP` in `core/data.ts` and `researchHp` in `core/hordeonly.ts` (the fight's `hpScale` and the Wall Machine Gun's demand carry it; `squadHpScale`, `hordeHp` and so Recommended Power do not); the reference player's Scrap and nodes: `REF_EARNED_FACTOR`, `REF_SHARE`, `refTech` in `core/balance/refplayer.ts`; the balance tests play it through `withRef` (`core/balance/shared.ts`); pinned by `core/research-hp.test.ts` and `core/refplayer.test.ts`, guarded by `core/balance/research.test.ts` |
| A research node (cost, effect, prerequisite) | `TECH` / `TECH_FX` in `core/data.ts` (`TECH_IDS` order is save format: append only), its name and effect words in `TECH_NAME` / `TECH_EFFECT` (`ui/text/names.ts`); buying in `core/techtree.ts`; fight hooks in `core/horde.ts` (`hasTech(s, id)`) and `core/cards.ts` (offer weight `offerWeights`); a Tier 4 node's card: `TECH_CARD` / `CARD.wallGun` / `CARD.net` / `CARD.moat` in `core/data.ts`, `UPGRADES` and `isTechCard` in `core/cards.ts`, `techCards` in `core/hordeonly.ts`, drawing in `ui/render.ts` (`wallGunAt`; the gun's aim, tip and tracer colour, ID-271: `wallGunAim` eases the barrel to its newest round's line within `WALL_GUN_AIM`, `wallGunTip` / `WALL_GUN_ART_CUT` give the barrel end and the art's two source rows, `drawWallGun` draws the still pedestal and the turning gun, `tracerColour` gives its rounds `COLOR.wallGunTracer`, and `bulletShape` starts them at the tip; `drawMoat`, `drawNetPulse`; their art keys `WALL_GUN_ART`, `MOAT_ART` and `NET_ART`, and the three card icons in `CARD_ICON`, are in `ui/sprites.ts`), card text `effectAt` / `cardPitch` in `ui/text/cards.ts`; window in `ui/researchcenter.ts`; save in `readTech` (`storage/save.ts`) |
| Top-bar button positions (Research, World map, Scrap chip, speeds) | `page.css` (three layouts: desktop and iPad, phone portrait, phone landscape) and the pins in `ui/page-css.test.ts`; change both together |
| World map Reroll price, draw cap | `MAP_REROLL`, `MAP_DRAWS_MAX` in `core/data.ts`; `rerollCost` / `rerollMap` in `core/scout.ts`; the button in `ui/mapview.ts` |
| World map areas, danger, patrol rules | `AREAS`, `DANGERS`, `MAP_PATROL` in `core/data.ts`; rules in `core/scout.ts`; save in `readMap` (`storage/save.ts`) |
| A player setting | `storage/settings.ts`; control in `ui/menu.ts` |
| Roster card's DPS figure (short form on the card, full in its label; ID-259) | `ui/squadroster.ts` (`cardDps`) |
| Roster boxes, folds (Bench, patrol, Details) | `ui/squadroster.ts` (`foldButton`, `box`, `detailsOpen`); kept folds in `storage/settings.ts` (`readRosterFolds`); styles `.rv-box` / `.rv-fold` in `src/page.css` |
| Patrol report's fixed size (team list, finds box; ID-260) | `ui/mapview.ts` (`reportView`), styles `.map-report-team` / `.map-found-box` in `src/page.css` |
| A sound | file in `src/assets/sounds/` (credit in `docs/audio-credits.md`); `ui/audio.ts` (samples), `ui/sound.ts` (when it plays) |
| Page styles or layout | `src/page.css`; the DOM is built in the `ui/` file that owns the panel |
| Any PR | raise `version` in `package.json` (+ `package-lock.json`) over main's; the pre-push hook checks it |
| Balance checks | `core/balance/*.test.ts`, shared setup in `core/balance/shared.ts`; a file that runs for more than a few minutes uncached gets its own job in `.github/workflows/ci.yml` (and an `--exclude` in the last job). The `changes` job there skips the balance jobs on a pull request that touches no simulation file (ID-268) |
