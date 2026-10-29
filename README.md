# Idle Defender

A zombie-survival base-defence game for the browser. Years after doomsday,
you command a fortified base: build barrier layers, power turrets and hold the
line when a horde of zombies and mutated monsters comes. Each horde is a
hands-on roguelite fight; between hordes, patrols cross the world map to loot
the ruins while you're away.

## Status

Design approved, nothing playable yet. The design is
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
