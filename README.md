# The Long Hold

[![CI](https://github.com/danhquach/idle-defender/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/danhquach/idle-defender/actions/workflows/ci.yml)
[![GitHub Pages](https://github.com/danhquach/idle-defender/actions/workflows/pages.yml/badge.svg)](https://github.com/danhquach/idle-defender/actions/workflows/pages.yml)

**Play the test build:** <https://danhquach.github.io/idle-defender/>

A zombie-survival base-defence game for the browser. Years after doomsday,
you command a fortified base: build barrier layers, power turrets and hold the
line when a horde of zombies and mutated monsters comes. Each horde is a
hands-on roguelite fight; between hordes, patrols cross the world map to loot
the ruins while you're away.

## Status

The test build is the horde-only build, playable in the browser:

- **Hold the wall.** A squad of up to 6 survivors shoots on its own; click an
  enemy to focus it. Hordes come in waves, with swarm waves, elites and a boss
  every 10th horde.
- **Level up in the fight.** Kills give fight XP; each level offers three
  cards (stats, behaviours, barriers). A throwable card (Frag Grenades,
  Flashbang or Molotov) gives each survivor 3 throws that come back over
  time. The Airstrike skill runs on cooldown.
- **Grow between hordes.** A win gives survivor XP and drops a gun into the
  stash. Pick each survivor's gun (every gun shows its DPS), combine guns to
  raise their rarity, and combine survivors of the same profession for XP.
  New survivors join up to a squad of 6.
- **Lose and retry.** A loss costs nothing: the same horde comes again.

The game saves in the browser. The full game (base building, patrols on the
world map) sits behind the same code. The design is
[`docs/design.md`](docs/design.md); work is tracked in GitHub issues.

## Develop

Needs Node 20.19+ or 22.12+.

```sh
npm ci             # install (also points git at the pre-push hook)
npm run dev        # local dev server
npm run lint       # type-check, ESLint, Prettier
npm test           # unit tests (Vitest), without the balance tests
npm run test:balance  # balance tests (src/core/balance/); one file: npx vitest run <file>
npm run build      # production build in dist/
```

The balance tests play many full fights. Their results are kept in
`.cache/balance/` (git-ignored) under a hash of the simulation code
(`src/core`), Node's version and the test file, so a run with neither
changed replays nothing and takes seconds. Only the current code's
results are kept, so switching to a branch with other `src/core` code
replays them. `BALANCE_CACHE=off` plays everything.

Every PR to `main` raises the version in `package.json`; CI and the pre-push
hook check it.

CI splits the unit tests across four jobs that run at once, because the
balance tests (`src/core/balance/`) play many full fights and take most of
the time. A new test file runs in the last job unless you add it to another
group in `.github/workflows/ci.yml`. Each job keeps its balance results in
the Actions cache, so a PR that leaves `src/core` alone replays no fights.

## License

[MIT](LICENSE)
