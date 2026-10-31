# Idle Defender

[![CI](https://github.com/danhquach/idle-defender/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/danhquach/idle-defender/actions/workflows/ci.yml)
[![GitHub Pages](https://github.com/danhquach/idle-defender/actions/workflows/pages.yml/badge.svg)](https://github.com/danhquach/idle-defender/actions/workflows/pages.yml)

**Play the test build:** <https://danhquach.github.io/idle-defender/>

A zombie-survival base-defence game for the browser. Years after doomsday,
you command a fortified base: build barrier layers, power turrets and hold the
line when a horde of zombies and mutated monsters comes. Each horde is a
hands-on roguelite fight; between hordes, patrols cross the world map to loot
the ruins while you're away.

## Status

The game is playable in the browser: build on the base between hordes
(walls in four tiers, tower, wall-walk and ground posts, upgrades and
repairs paid in materials), pick the start defender and post, then fight a
horde with waves, level-up cards and a win/lose result. In a fight, click a
defender and then a post to walk it there; a defender on a wall that breaks
drops to a ground post behind it. Damage carries over
to the next build, and the game saves in the browser. The design is
[`docs/design.md`](docs/design.md); its build order (§14) becomes GitHub
issues.

## Develop

Needs Node 20.19+ or 22.12+.

```sh
npm ci             # install (also points git at the pre-push hook)
npm run dev        # local dev server
npm run lint       # type-check, ESLint, Prettier
npm test           # unit tests (Vitest)
npm run build      # production build in dist/
```

Every PR to `main` raises the version in `package.json`; CI and the pre-push
hook check it.

## License

[MIT](LICENSE)
