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
| `data.ts` | Every tuning number and content table: `WEAPONS`, `ENEMIES`, `BOSSES`, `SKILLS`, `PERKS`, `PROFESSIONS`, `JOBS`, squad/stash caps, drop and craft rates. Start here for any number. |
| `horde.ts` | The fight: `HordeState`, `tick`, enemies, defenders, wall, shots, damage, boss and horror behaviour. The biggest core file. |
| `hordeonly.ts` | The shipping loop: squad pick, `startSquadHorde` / `finishSquadHorde`, guns in the stash (equip, upgrade, combine, salvage, craft), survivors joining, combine, rest. |
| `game.ts` | `GameState`, `newGame`, the full game's between-horde loop (`startHorde`, `finishHorde`, `recover`). |
| `waves.ts` | Wave count and size, enemy HP growth, wave mix, horror abilities. |
| `pacing.ts` | How fast a horde's enemies arrive. |
| `cards.ts` | The 1-of-3 upgrade cards in a fight (`UPGRADES`), who can take one (`eligible`), offer, reroll, ban, and stat/repair effects (`applyUpgrade`). |
| `skills.ts` / `shop.ts` / `replace.ts` | Active skills, the mid-fight cash shop, swapping a survivor in between waves. |
| `armoury.ts` / `loadout.ts` / `craft.ts` | Owned guns with rarity and affixes; what a defender carries; blueprints. |
| `stats.ts` / `jobs.ts` | Survivor levels, XP curve, professions and their bonuses. |
| `camp.ts` | Recruits (shared); camp level, capacity and upgrade offers (full game). |
| `squadpower.ts` | Squad Power vs Recommended Power shown before a fight. |
| `modes.ts` | Difficulty modes (Normal / Nightmare / Hell): unlocks, each mode's local horde, effective horde, boss skills (Hell's new one each), Scrap and rarity boosts. |
| `chatter.ts` | Speech bubbles during a fight. |
| `base.ts` | The base's wall, posts, turrets and traps; the fight runs on it (`squadBase` for the squad build). |
| `perks.ts` | Commander perks; `levelScale` is used by the fight. |
| `scout.ts` | The horde-only World map (ID-219): its areas, sending a patrol team from the bench, team power and risk, real-time trips, the report rolled from the patrol's seed and taking it. |
| `research.ts` / `power.ts` / `patrol.ts` | Full-game systems (see above). |
| `sim.ts` | Headless scripted player for balance tests. |
| `debug.ts` | Debug-mode edits (jump to a horde, set scrap or squad size). |
| `rng.ts` | The seeded RNG. |
| `testing.ts` | Test fixtures only; never imported by game code. |
| `balance/` | Balance tests (`npm run test:balance`), cached by a hash of `src/core` in `.cache/balance/`. |

## storage/ — the browser

| File | Owns |
| --- | --- |
| `save.ts` | Versioned JSON save (`SAVE_VERSION`), `encodeSave` / `decodeSave`, one `read*` allow-list reader per part of `GameState`, upgrades from older versions. |
| `validate.ts` | Small allow-list readers (`num`, `int`, `oneOf`, …) used by every `save.ts` reader. |
| `code.ts` | The backup code: export and import the save as one line of text. |
| `settings.ts` | Settings outside the save: mute, volumes, speed, reduced motion, auto-strike, chatter, how-to seen. |
| `debug.ts` | The debug URL flag and its separate save slot. |
| `testing.ts` | Old-save fixtures for migration tests. |

## ui/ — the page

| Area | Files |
| --- | --- |
| Wiring and frame loop | `app.ts` (all callbacks from panels into core, `commit`, the frame loop) |
| Canvas | `render.ts` (draws a fight and the camp), `projection.ts` (camera, angled view), `ground.ts` (tiles), `buildscene.ts` (camp scene) |
| Sprites and effects | `sprites.ts` (art ids, URLs, loading), `anim.ts` (frames, gait), `death.ts`, `explosion.ts`, `spit.ts` |
| In-fight HUD | `hud.ts` (status bar, card pick, skills, shop, result and squad screens, scrap chip) |
| Camp window | `campwindow.ts` (tabs) → `squadroster.ts` (Roster), `inventory.ts` (Weapons), `craft.ts` (Craft), `mapview.ts` (World map, ID-219; its words in `maptext.ts`); helpers `gunpick.ts`, `jobtext.ts`, `statlines.ts`, `joining.ts` |
| Dialogs and screens | `menu.ts` (settings, save, help), `confirm.ts`, `intro.ts` + `introTitle.ts`, `landscape.ts` (phone turn prompt), `debug.ts` (debug panel) |
| Audio | `audio.ts` (Web Audio engine), `sound.ts` (cues from state changes) |
| Shared bits | `kit.ts` (button variants), `fastforward.ts` (fight speed) |
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
| A new gun | `WEAPONS` in `core/data.ts`; drop rules in `core/armoury.ts`; art ids in `ui/sprites.ts` (an icon plus held and aim sprites per look), PNGs in `src/assets/art/` built via `art-src/manifest.json` + `tools/art/` |
| A new enemy or boss | `ENEMIES` / `BOSSES` in `core/data.ts`; behaviour in `core/horde.ts`; mix in `core/waves.ts`; art in `ui/sprites.ts` + `ui/render.ts` |
| A new in-fight card | id in the `UpgradeId` type (`core/horde.ts`); entry and category in `UPGRADES` (`core/cards.ts`); stat/repair effect in `applyUpgrade` (`core/cards.ts`), behaviour effect where `core/horde.ts` checks the card. The squad pool (`SQUAD_CARDS`) picks it up by category. A mode reward card instead: id in `ModeCard` and `MODE_UNLOCKS` (`core/data.ts`), its fight-relevance gate in `modeCardRelevant` (`core/cards.ts`); it joins the pool only through `modeCards` (`core/hordeonly.ts`). |
| A new skill | `SKILLS` and `SkillId` in `core/data.ts`; launch in `core/skills.ts`; landing in `core/horde.ts`; button in `ui/hud.ts`; art in `ui/sprites.ts` + `ui/render.ts` |
| Fight rules | `core/horde.ts` |
| Difficulty mode numbers or unlocks | `MODES` in `core/modes.ts`; mode cards in `MODE_UNLOCKS` (`core/data.ts`) and `modeCards` (`core/hordeonly.ts`); start-screen switch in `ui/hud.ts` |
| A boss skill (Hell's included) | `BossSkill` and `BOSS_SKILL` (`core/data.ts`); clocks and effects in `mutate` and its helpers (`core/horde.ts`); name and cue in `ui/hud.ts`, glow and marks in `ui/render.ts`, sounds in `ui/audio.ts` and `ui/sound.ts` |
| What happens after a fight | `finishSquadHorde` in `core/hordeonly.ts` |
| A new field on `GameState` | `core/game.ts`; then a `read*` in `storage/save.ts` with a default for older saves, bump `SAVE_VERSION` (note it in its comment, add the old number to `readSave`'s list), add an old-save fixture in `storage/testing.ts` |
| HUD text or buttons in a fight | `ui/hud.ts` |
| Roster / Weapons / Craft / World map tabs | `ui/squadroster.ts` / `ui/inventory.ts` / `ui/craft.ts` / `ui/mapview.ts` |
| World map areas, danger, patrol rules | `AREAS`, `DANGERS`, `MAP_PATROL` in `core/data.ts`; rules in `core/scout.ts`; save in `readMap` (`storage/save.ts`) |
| A player setting | `storage/settings.ts`; control in `ui/menu.ts` |
| A sound | file in `src/assets/sounds/` (credit in `docs/audio-credits.md`); `ui/audio.ts` (samples), `ui/sound.ts` (when it plays) |
| Page styles or layout | `src/page.css`; the DOM is built in the `ui/` file that owns the panel |
| Any PR | raise `version` in `package.json` (+ `package-lock.json`) over main's; the pre-push hook checks it |
| Balance checks | `core/balance/*.test.ts`, shared setup in `core/balance/shared.ts` |
