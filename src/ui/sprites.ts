// The game's art (design §15, ID-043): sprites and textures generated at development
// time (prompts and seeds in art-src/manifest.json), cleaned by tools/art/build.py
// and bundled with the build. The page never fetches art from anywhere else.
import type {
  EnemyKind,
  LocationId,
  PlaceId,
  Profession,
  ShopItem,
  SkillId,
  Tier,
  TrapKind,
  WeaponId,
  WEAPONS,
} from '../core/data.ts';
import { buildingsOf } from '../core/data.ts';
import type { TurretState } from '../core/horde.ts';

export const ART_IDS = [
  'shambler',
  'runner',
  'crawler',
  'swollen',
  'spewer',
  'brute',
  'screamer',
  'horror',
  'airstrike',
  'molotov',
  'flashbang',
  'icon-adrenaline',
  'icon-overdrive',
  'icon-patch',
  'icon-fix',
  'icon-flashbang',
  'icon-molotov',
  'icon-airstrike',
  'gunner',
  'gunner-pistol',
  'gunner-smg',
  'gunner-shotgun',
  'gunner-lmg',
  'gunner-sniper',
  'ripper',
  'engineer',
  'shield',
  'turret-lit',
  'turret-dark',
  'turret-jammed',
  'tower',
  'ground-post',
  'spikes',
  'wire',
  'spikes-broken',
  'wire-broken',
  'wood-top',
  'wood-front',
  'metal-top',
  'metal-front',
  'concrete-top',
  'concrete-front',
  'reinforced-top',
  'reinforced-front',
  'wood-rubble',
  'metal-rubble',
  'concrete-rubble',
  'reinforced-rubble',
  'cracks',
  'wood-gate',
  'metal-gate',
  'reinforced-gate',
  'concrete-gate',
  'ground',
  'ground-b',
  'ground-c',
  'camp-ground',
  'ground-crack',
  'debris',
  'dry-grass',
  'shack',
  'tent',
  'world-map',
  'map-gas-station',
  'map-supermarket',
  'map-electronics',
  'map-hardware',
  'map-pharmacy',
  'map-construction',
  'map-police',
  'map-hospital',
  'map-military',
  'map-crater',
] as const;
export type ArtId = (typeof ART_IDS)[number];

/**
 * Art the game doesn't wait for: the world map's region (ID-028) is the biggest file and
 * only shows behind a button after Horde 2, so it loads in the background.
 */
export const LAZY_ART: readonly ArtId[] = ['world-map'];
const PRELOAD = ART_IDS.filter((id) => !LAZY_ART.includes(id));

/**
 * A sprite's longer side in px, or its group's (tools/art/build.py `SPRITE_PX`): a
 * sprite's own height over this is how much of its drawn height it fills.
 */
export const ART_PX = 192;
/** How long a sprite may take to load before the game gives up on it. */
export const LOAD_TIMEOUT_MS = 20_000;

/** Every bundled art file's URL, by file name without `.png`. */
export const ART_URLS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('../assets/art/*.png', {
      eager: true,
      query: '?url',
      import: 'default',
    }),
  ).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -'.png'.length), url]),
);

/** Every enemy kind's generated art (design §15, ID-043, ID-051, ID-041). */
export const ENEMY_ART: Readonly<Record<EnemyKind, ArtId>> = {
  shambler: 'shambler',
  runner: 'runner',
  crawler: 'crawler',
  swollen: 'swollen',
  spewer: 'spewer',
  brute: 'brute',
  screamer: 'screamer',
  horror: 'horror',
};

/**
 * Each skill's art, lying on the ground across its reach (design §15, ID-041): a bomb's
 * or a flashbang's flash where it goes off, a molotov's fire for as long as it burns.
 */
export const SKILL_ART: Readonly<Record<SkillId, ArtId>> = {
  airstrike: 'airstrike',
  flashbang: 'flashbang',
  molotov: 'molotov',
};

/** The world map's region (ID-028), drawn under the routes and places. */
export const MAP_PICTURE: ArtId = 'world-map';

/** Each location's icon on the world map (ID-028), inside its risk ring. */
export const MAP_ART: Readonly<Record<LocationId, ArtId>> = {
  'gas-station': 'map-gas-station',
  supermarket: 'map-supermarket',
  electronics: 'map-electronics',
  hardware: 'map-hardware',
  pharmacy: 'map-pharmacy',
  construction: 'map-construction',
  police: 'map-police',
  hospital: 'map-hospital',
  military: 'map-military',
  crater: 'map-crater',
};

/** A place's icons on the map (ID-029): a location's own, or a plaza's buildings' as a small cluster. */
export const placeArt = (place: PlaceId): ArtId[] => buildingsOf(place).map((b) => MAP_ART[b]);

/** Each horde cash shop item's icon on its button (design §15, ID-041). */
export const SHOP_ICON: Readonly<Record<ShopItem, ArtId>> = {
  adrenaline: 'icon-adrenaline',
  overdrive: 'icon-overdrive',
  patch: 'icon-patch',
  fix: 'icon-fix',
};
/** Each skill's icon on its button (design §15, ID-041). */
export const SKILL_ICON: Readonly<Record<SkillId, ArtId>> = {
  flashbang: 'icon-flashbang',
  molotov: 'icon-molotov',
  airstrike: 'icon-airstrike',
};

/** The weapon in the sprite's hands tells the profession (design §15). */
export const DEFENDER_ART: Readonly<Record<Profession, ArtId>> = {
  gunner: 'gunner',
  ripper: 'ripper',
  engineer: 'engineer',
};

/** Every gun: a sidearm or a specialised gun. */
export type GunId = {
  [K in WeaponId]: (typeof WEAPONS)[K]['kind'] extends 'sidearm' | 'gun' ? K : never;
}[WeaponId];
/** A Gunner's sprite holds their primary, so the gun reads at a glance (design §15, ID-046). */
export const GUNNER_ART: Readonly<Record<GunId, ArtId>> = {
  pistol: 'gunner-pistol',
  smg: 'gunner-smg',
  rifle: 'gunner',
  shotgun: 'gunner-shotgun',
  lmg: 'gunner-lmg',
  sniper: 'gunner-sniper',
};

/** A turret with its wall broken (offline) shows dark, like one with no charge. */
export const TURRET_ART: Readonly<Record<TurretState, ArtId>> = {
  lit: 'turret-lit',
  dark: 'turret-dark',
  offline: 'turret-dark',
  jammed: 'turret-jammed',
};

export const TRAP_ART: Readonly<Record<TrapKind, { built: ArtId; broken: ArtId }>> = {
  spikes: { built: 'spikes', broken: 'spikes-broken' },
  wire: { built: 'wire', broken: 'wire-broken' },
};

/**
 * A wall tier's faces (tiling textures), the gate seen from above in its place on a
 * gate segment, and the rubble a broken segment leaves.
 */
export const TIER_ART: Readonly<
  Record<Tier, { top: ArtId; front: ArtId; gate: ArtId; rubble: ArtId }>
> = {
  wood: { top: 'wood-top', front: 'wood-front', gate: 'wood-gate', rubble: 'wood-rubble' },
  metal: { top: 'metal-top', front: 'metal-front', gate: 'metal-gate', rubble: 'metal-rubble' },
  concrete: {
    top: 'concrete-top',
    front: 'concrete-front',
    gate: 'concrete-gate',
    rubble: 'concrete-rubble',
  },
  reinforced: {
    top: 'reinforced-top',
    front: 'reinforced-front',
    gate: 'reinforced-gate',
    rubble: 'reinforced-rubble',
  },
};
/**
 * The share of a gate's art width its posts fill: the wall's depth. The leaves swung
 * open stick out past it, over the field. tools/art/build.py pads every gate to its
 * own `GATE_POSTS`, which must be the same number.
 */
export const GATE_POSTS = 0.6;

/** Everything else the horde view draws. */
export const BASE_ART = {
  /** Ground tile variants sharing one seam border (ID-050); the first sets the tile size. */
  groundTiles: ['ground', 'ground-b', 'ground-c'],
  camp: 'camp-ground',
  /** Scattered over the field and the yard. */
  decals: ['ground-crack', 'debris', 'dry-grass'],
  campProps: ['shack', 'tent'],
  tower: 'tower',
  groundPost: 'ground-post',
  walk: { top: 'wood-top', front: 'wood-front' },
  cracks: 'cracks',
  shield: 'shield',
} as const satisfies Record<string, ArtId | readonly ArtId[] | Record<string, ArtId>>;

export type Art = Readonly<Record<ArtId, HTMLImageElement>>;

/**
 * Loads every sprite; rejects naming the ones that failed or took longer than
 * `LOAD_TIMEOUT_MS`. Waits on the load event, not `decode()`, which some browsers
 * leave pending for a page loaded in the background. `LAZY_ART` starts loading but is
 * never waited for, so it can neither hold up nor fail the start.
 */
export async function loadArt(): Promise<Art> {
  const loaded = await Promise.allSettled(
    PRELOAD.map(
      (id) =>
        new Promise<readonly [ArtId, HTMLImageElement]>((resolve, reject) => {
          const url = ART_URLS[id];
          if (!url) return reject(new Error(id));
          const img = new Image();
          const timer = setTimeout(() => reject(new Error(id)), LOAD_TIMEOUT_MS);
          img.onload = () => {
            clearTimeout(timer);
            resolve([id, img]);
          };
          img.onerror = () => {
            clearTimeout(timer);
            reject(new Error(id));
          };
          img.src = url;
        }),
    ),
  );
  const failed = PRELOAD.filter((_, i) => loaded[i]!.status === 'rejected');
  if (failed.length) throw new Error(`art failed to load: ${failed.join(', ')}`);
  const lazy = LAZY_ART.map((id) => {
    const img = new Image();
    img.src = ART_URLS[id] ?? '';
    return [id, img] as const;
  });
  return Object.fromEntries([
    ...loaded.map((r) => (r as PromiseFulfilledResult<readonly [ArtId, HTMLImageElement]>).value),
    ...lazy,
  ]) as Art;
}
