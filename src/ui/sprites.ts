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
import { baseOf } from '../core/armoury.ts';
import { buildingsOf } from '../core/data.ts';
import type { DefenderSpec, TurretState, UpgradeId } from '../core/horde.ts';
import { isGun } from '../core/loadout.ts';

export const ART_IDS = [
  'shambler-walk-a',
  'shambler-walk-b',
  'shambler-walk-c',
  'shambler-attack',
  'runner-walk-a',
  'runner-walk-b',
  'runner-walk-c',
  'runner-attack',
  'crawler-walk-a',
  'crawler-walk-b',
  'crawler-walk-c',
  'crawler-attack',
  'swollen-walk-a',
  'swollen-walk-b',
  'swollen-walk-c',
  'swollen-attack',
  'spewer-walk-a',
  'spewer-walk-b',
  'spewer-walk-c',
  'spewer-attack',
  'brute-walk-a',
  'brute-walk-b',
  'brute-walk-c',
  'brute-attack',
  'screamer-walk-a',
  'screamer-walk-b',
  'screamer-walk-c',
  'screamer-attack',
  'horror-walk-a',
  'horror-walk-b',
  'horror-walk-c',
  'horror-attack',
  'scorch',
  'airstrike-bomb',
  'explosion',
  'explosion-pop',
  'explosion-smoke',
  'acid-glob',
  'acid-splash',
  'acid-stain',
  'shock-a',
  'shock-b',
  'shock-c',
  'gore-spray',
  'gore-spray-b',
  'gore-stump',
  'dust-puff',
  'icon-adrenaline',
  'icon-overdrive',
  'icon-patch',
  'icon-fix',
  'icon-flashbang',
  'icon-molotov',
  'icon-airstrike',
  'icon-scrap',
  'icon-wood',
  'icon-metal',
  'icon-concrete',
  'icon-food',
  'icon-gas',
  'icon-cash',
  'icon-bank',
  'icon-genes',
  // Upgrade card icons (ID-103).
  'card-incendiary-rounds',
  'card-sharpshooter',
  'card-reinforce',
  'card-shock-rounds',
  'card-piercing-rounds',
  'card-ricochet',
  'card-rapid-fire',
  'card-long-sight',
  'card-patch-up',
  'card-speed-loaders',
  'card-extended-mags',
  'card-concussion-rounds',
  'card-frag-grenades',
  'card-barbed-wire',
  'card-recharge',
  'card-power-surge',
  'card-hollow-points',
  'card-field-repairs',
  'weapon-pistol',
  'weapon-smg',
  'weapon-rifle',
  'weapon-shotgun',
  'weapon-lmg',
  'weapon-sniper',
  'gunner-pistol-idle',
  'gunner-pistol-aim',
  'gunner-smg-idle',
  'gunner-smg-aim',
  'gunner-rifle-idle',
  'gunner-rifle-aim',
  'gunner-shotgun-idle',
  'gunner-shotgun-aim',
  'gunner-lmg-idle',
  'gunner-lmg-aim',
  'gunner-sniper-idle',
  'gunner-sniper-aim',
  'gunner-pistol-idle-b',
  'gunner-pistol-aim-b',
  'gunner-smg-idle-b',
  'gunner-smg-aim-b',
  'gunner-rifle-idle-b',
  'gunner-rifle-aim-b',
  'gunner-shotgun-idle-b',
  'gunner-shotgun-aim-b',
  'gunner-lmg-idle-b',
  'gunner-lmg-aim-b',
  'gunner-sniper-idle-b',
  'gunner-sniper-aim-b',
  'gunner-pistol-idle-c',
  'gunner-pistol-aim-c',
  'gunner-smg-idle-c',
  'gunner-smg-aim-c',
  'gunner-rifle-idle-c',
  'gunner-rifle-aim-c',
  'gunner-shotgun-idle-c',
  'gunner-shotgun-aim-c',
  'gunner-lmg-idle-c',
  'gunner-lmg-aim-c',
  'gunner-sniper-idle-c',
  'gunner-sniper-aim-c',
  'gunner-pistol-idle-d',
  'gunner-pistol-aim-d',
  'gunner-smg-idle-d',
  'gunner-smg-aim-d',
  'gunner-rifle-idle-d',
  'gunner-rifle-aim-d',
  'gunner-shotgun-idle-d',
  'gunner-shotgun-aim-d',
  'gunner-lmg-idle-d',
  'gunner-lmg-aim-d',
  'gunner-sniper-idle-d',
  'gunner-sniper-aim-d',
  'gunner-throw-wind',
  'gunner-throw-release',
  'gunner-throw-wind-b',
  'gunner-throw-release-b',
  'gunner-throw-wind-c',
  'gunner-throw-release-c',
  'gunner-throw-wind-d',
  'gunner-throw-release-d',
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
  'wall-chips',
  'wall-breach',
  'wall-brace',
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
  'title-dusk',
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
 * Art the game doesn't wait for, loaded in the background: the world map's region (ID-028)
 * only shows behind a button after Horde 2; the title art (ID-106) fades in when it lands.
 */
export const LAZY_ART: readonly ArtId[] = ['world-map', 'title-dusk'];
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

/**
 * An enemy's animation frames (design §15, ID-069): three walk poses, played 1-2-3-2 as
 * it covers ground, and the pose it strikes in. Each is an edit of a coloured puppet
 * (art-src/poses), and a kind's frames share one box and scale, so they line up.
 */
export interface EnemyArt {
  walk: readonly [ArtId, ArtId, ArtId];
  attack: ArtId;
}
/** Every enemy kind's frames (design §15, ID-069). */
export const ENEMY_ART: Readonly<Record<EnemyKind, EnemyArt>> = {
  shambler: {
    walk: ['shambler-walk-a', 'shambler-walk-b', 'shambler-walk-c'],
    attack: 'shambler-attack',
  },
  runner: { walk: ['runner-walk-a', 'runner-walk-b', 'runner-walk-c'], attack: 'runner-attack' },
  crawler: {
    walk: ['crawler-walk-a', 'crawler-walk-b', 'crawler-walk-c'],
    attack: 'crawler-attack',
  },
  swollen: {
    walk: ['swollen-walk-a', 'swollen-walk-b', 'swollen-walk-c'],
    attack: 'swollen-attack',
  },
  spewer: { walk: ['spewer-walk-a', 'spewer-walk-b', 'spewer-walk-c'], attack: 'spewer-attack' },
  brute: { walk: ['brute-walk-a', 'brute-walk-b', 'brute-walk-c'], attack: 'brute-attack' },
  screamer: {
    walk: ['screamer-walk-a', 'screamer-walk-b', 'screamer-walk-c'],
    attack: 'screamer-attack',
  },
  horror: { walk: ['horror-walk-a', 'horror-walk-b', 'horror-walk-c'], attack: 'horror-attack' },
};

/**
 * The char a molotov fire or a fireball leaves on the ground (ID-107), lying flat across
 * its reach: under a molotov's flames, and fading after a Frag Grenade or Airstrike bomb.
 */
export const SCORCH_ART: ArtId = 'scorch';

/** An Airstrike's bomb as it falls (ID-107): the Heavy Rounds shell, larger, nose down. */
export const BOMB_ART: ArtId = 'airstrike-bomb';

/** The world map's region (ID-028), drawn under the routes and places. */
export const MAP_PICTURE: ArtId = 'world-map';

/** The intro's backdrop (ID-106): survivors on the wall at dusk, the horde coming. */
export const TITLE_PICTURE: ArtId = 'title-dusk';

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
/** Each upgrade card's icon on its offer card (ID-103): every card in the pool has one. */
export const CARD_ICON: Readonly<Record<UpgradeId, ArtId>> = {
  'incendiary-rounds': 'card-incendiary-rounds',
  sharpshooter: 'card-sharpshooter',
  reinforce: 'card-reinforce',
  'shock-rounds': 'card-shock-rounds',
  'piercing-rounds': 'card-piercing-rounds',
  ricochet: 'card-ricochet',
  'rapid-fire': 'card-rapid-fire',
  'long-sight': 'card-long-sight',
  'patch-up': 'card-patch-up',
  'speed-loaders': 'card-speed-loaders',
  'extended-mags': 'card-extended-mags',
  'concussion-rounds': 'card-concussion-rounds',
  'frag-grenades': 'card-frag-grenades',
  'barbed-wire': 'card-barbed-wire',
  recharge: 'card-recharge',
  'power-surge': 'card-power-surge',
  'hollow-points': 'card-hollow-points',
  'field-repairs': 'card-field-repairs',
};
/** Each skill's icon on its button (design §15, ID-041). */
export const SKILL_ICON: Readonly<Record<SkillId, ArtId>> = {
  flashbang: 'icon-flashbang',
  molotov: 'icon-molotov',
  airstrike: 'icon-airstrike',
};

/**
 * The resources the UI shows by icon (design §15, ID-056): the camp's building materials,
 * Food, Gas, horde cash, the battery bank and Mutated Genes.
 */
export const RESOURCE_IDS = [
  'scrap',
  'wood',
  'metal',
  'concrete',
  'food',
  'gas',
  'cash',
  'bank',
  'genes',
] as const;
export type ResourceId = (typeof RESOURCE_IDS)[number];
/** Each resource's icon (design §15, ID-056). */
export const RESOURCE_ICON: Readonly<Record<ResourceId, ArtId>> = {
  scrap: 'icon-scrap',
  wood: 'icon-wood',
  metal: 'icon-metal',
  concrete: 'icon-concrete',
  food: 'icon-food',
  gas: 'icon-gas',
  cash: 'icon-cash',
  bank: 'icon-bank',
  genes: 'icon-genes',
};

/** The weapon in the sprite's hands tells the profession (design §15). */
export const DEFENDER_ART: Readonly<Record<Profession, ArtId>> = {
  gunner: 'gunner-rifle-idle',
  ripper: 'ripper',
  engineer: 'engineer',
};

/** Every gun: a sidearm or a specialised gun. */
export type GunId = {
  [K in WeaponId]: (typeof WEAPONS)[K]['kind'] extends 'sidearm' | 'gun' ? K : never;
}[WeaponId];
/**
 * A Gunner's sprite holds their primary, so the gun reads at a glance (design §15, ID-046):
 * held low at rest, or raised and aimed while they fire (ID-069). Both poses of a gun
 * share one box and scale, so the swap keeps the feet and body still. `barrel` is where
 * the aimed gun's muzzle is, in the aim sprite's px: right of its middle, up from its feet.
 */
export interface GunnerArt {
  idle: ArtId;
  aim: ArtId;
  barrel: { readonly x: number; readonly y: number };
}
export const GUNNER_ART: Readonly<Record<GunId, GunnerArt>> = {
  pistol: {
    idle: 'gunner-pistol-idle',
    aim: 'gunner-pistol-aim',
    barrel: { x: 90, y: 136 },
  },
  smg: { idle: 'gunner-smg-idle', aim: 'gunner-smg-aim', barrel: { x: 100, y: 154 } },
  rifle: {
    idle: 'gunner-rifle-idle',
    aim: 'gunner-rifle-aim',
    barrel: { x: 94, y: 128 },
  },
  shotgun: {
    idle: 'gunner-shotgun-idle',
    aim: 'gunner-shotgun-aim',
    barrel: { x: 102, y: 151 },
  },
  lmg: { idle: 'gunner-lmg-idle', aim: 'gunner-lmg-aim', barrel: { x: 104, y: 151 } },
  sniper: {
    idle: 'gunner-sniper-idle',
    aim: 'gunner-sniper-aim',
    barrel: { x: 115, y: 141 },
  },
};

/**
 * Each gun's icon (ID-092): the gun model alone, side view, muzzle right; the same model
 * the survivors hold. The Inventory's slots and the debrief's drop tile show it.
 */
export const GUN_ICON: Readonly<Record<GunId, ArtId>> = {
  pistol: 'weapon-pistol',
  smg: 'weapon-smg',
  rifle: 'weapon-rifle',
  shotgun: 'weapon-shotgun',
  lmg: 'weapon-lmg',
  sniper: 'weapon-sniper',
};

/** The other survivor looks' letters (ID-074), after the soldier's `GUNNER_ART`. */
const LOOK_LETTERS = ['b', 'c', 'd'] as const;
/**
 * The other looks' barrel tip per gun, in their aim sprite's px (as `GunnerArt.barrel`):
 * each look repaints the soldier's frame, so all share it, but the repainted frames trim
 * narrower, so it sits left of the soldier's.
 */
const LOOK_BARREL: Readonly<Record<GunId, { readonly x: number; readonly y: number }>> = {
  pistol: { x: 78, y: 136 },
  smg: { x: 88, y: 153 },
  rifle: { x: 82, y: 128 },
  shotgun: { x: 90, y: 149 },
  lmg: { x: 92, y: 148 },
  sniper: { x: 102, y: 140 },
};
/**
 * A Gunner's art in each survivor look (ID-074): the soldier's `GUNNER_ART` first, then
 * each other look's idle and aim sprites, `gunner-<gun>-<pose>-<letter>`: the soldier's
 * frames repainted as someone else, same pose, grip and gun.
 */
export const GUNNER_LOOKS: readonly Readonly<Record<GunId, GunnerArt>>[] = [
  GUNNER_ART,
  ...LOOK_LETTERS.map(
    (letter) =>
      Object.fromEntries(
        (Object.keys(GUNNER_ART) as GunId[]).map((gun) => {
          const art: GunnerArt = {
            idle: `gunner-${gun}-idle-${letter}` as ArtId,
            aim: `gunner-${gun}-aim-${letter}` as ArtId,
            barrel: LOOK_BARREL[gun],
          };
          return [gun, art];
        }),
      ) as Record<GunId, GunnerArt>,
  ),
];
/** How many survivor looks there are (ID-074): the soldier, then the others. */
export const LOOKS = GUNNER_LOOKS.length;

/**
 * A survivor's Frag Grenade throw in each look (ID-119), in `GUNNER_LOOKS` order: the
 * wind-up (grenade drawn back over the shoulder) and the release (arm through, hand open),
 * no gun in hand. `held` is where the grenade is on the wind-up sprite and `hand` where the
 * open hand is on the release sprite, in their px like `GunnerArt.barrel`; the other looks'
 * frames trim narrower, as theirs do.
 */
export interface ThrowArt {
  wind: ArtId;
  release: ArtId;
  held: { readonly x: number; readonly y: number };
  hand: { readonly x: number; readonly y: number };
}
export const THROW_LOOKS: readonly Readonly<ThrowArt>[] = [
  {
    wind: 'gunner-throw-wind',
    release: 'gunner-throw-release',
    held: { x: -25, y: 160 },
    hand: { x: 81, y: 159 },
  },
  ...LOOK_LETTERS.map((letter): ThrowArt => ({
    wind: `gunner-throw-wind-${letter}`,
    release: `gunner-throw-release-${letter}`,
    held: { x: -37, y: 159 },
    hand: { x: 69, y: 158 },
  })),
];

/**
 * A survivor's look (ID-074), 0…LOOKS-1, kept for good since it comes from their id,
 * which never changes. A numbered id (`recruit-<n>`, `s<patrol>-<k>`, `c<level>`) counts
 * round the looks by its last number, so survivors who join one after another look
 * different and the first recruit keeps the soldier; any other id is hashed.
 */
export function lookOf(id: string): number {
  const digit = (i: number) => id.charCodeAt(i) >= 48 && id.charCodeAt(i) <= 57;
  let start = id.length;
  while (start > 0 && digit(start - 1)) start--;
  if (start < id.length) {
    // Only the number's value round the looks matters, so it never overflows.
    let n = 0;
    for (let i = start; i < id.length; i++) n = (n * 10 + id.charCodeAt(i) - 48) % LOOKS;
    return (n + LOOKS - 1) % LOOKS;
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  return (h >>> 0) % LOOKS;
}

/**
 * A survivor's avatar: their own look (ID-074) holding the gun they fight with (a primary
 * that is no gun fights as the pistol), as the fight draws them. The Roster (ID-086) and a
 * recruit's offer card (ID-103) show it.
 */
export function avatarOf(d: Pick<DefenderSpec, 'id' | 'loadout'>): ArtId {
  const look = GUNNER_LOOKS[lookOf(d.id)]!;
  const held = isGun(d.loadout.primary) ? d.loadout.primary : 'pistol';
  return (look[baseOf(held) as GunId] ?? look.rifle).idle;
}

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
/** Everything else the horde view draws. */
export const BASE_ART = {
  /** Ground tile variants sharing one seam border (ID-050); the first sets the tile size. */
  groundTiles: ['ground', 'ground-b', 'ground-c'],
  camp: 'camp-ground',
  /** Scattered over the field and the yard. */
  decals: ['ground-crack', 'debris', 'dry-grass'],
  /** Tinted green for the field's grass patches (ID-071). */
  grass: 'dry-grass',
  campProps: ['shack', 'tent'],
  tower: 'tower',
  groundPost: 'ground-post',
  walk: { top: 'wood-top', front: 'wood-front' },
  cracks: 'cracks',
  /** Wall damage stages over the cracks (ID-072): pieces chipped out, then a section broken through. */
  chips: 'wall-chips',
  breach: 'wall-breach',
  /** Barrier cards on the wall (ID-075): Reinforce's brace. */
  brace: 'wall-brace',
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
