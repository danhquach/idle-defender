// The game's art (design §15, ID-043): sprites and textures generated at development
// time (prompts and seeds in art-src/manifest.json), cleaned by tools/art/build.py
// and bundled with the build. The page never fetches art from anywhere else.
import type { EnemyKind, Profession, Tier, TrapKind } from '../core/data.ts';
import type { TurretState } from '../core/horde.ts';

export const ART_IDS = [
  'shambler',
  'gunner',
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
  'gate',
  'ground',
  'camp-ground',
  'shack',
  'tent',
] as const;
export type ArtId = (typeof ART_IDS)[number];

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

export const ENEMY_ART: Readonly<Record<EnemyKind, ArtId>> = { shambler: 'shambler' };

/** The weapon in the sprite's hands tells the profession (design §15). */
export const DEFENDER_ART: Readonly<Record<Profession, ArtId>> = {
  gunner: 'gunner',
  ripper: 'ripper',
  engineer: 'engineer',
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

/** A wall tier's faces (tiling textures) and the rubble a broken segment leaves. */
export const TIER_ART: Readonly<Record<Tier, { top: ArtId; front: ArtId; rubble: ArtId }>> = {
  wood: { top: 'wood-top', front: 'wood-front', rubble: 'wood-rubble' },
  metal: { top: 'metal-top', front: 'metal-front', rubble: 'metal-rubble' },
  concrete: { top: 'concrete-top', front: 'concrete-front', rubble: 'concrete-rubble' },
  reinforced: { top: 'reinforced-top', front: 'reinforced-front', rubble: 'reinforced-rubble' },
};

/** Everything else the horde view draws. */
export const BASE_ART = {
  ground: 'ground',
  camp: 'camp-ground',
  campProps: ['shack', 'tent'],
  tower: 'tower',
  groundPost: 'ground-post',
  walk: { top: 'wood-top', front: 'wood-front' },
  gate: 'gate',
  cracks: 'cracks',
  shield: 'shield',
} as const satisfies Record<string, ArtId | readonly ArtId[] | Record<string, ArtId>>;

export type Art = Readonly<Record<ArtId, HTMLImageElement>>;

/**
 * Loads every sprite; rejects naming the ones that failed or took longer than
 * `LOAD_TIMEOUT_MS`. Waits on the load event, not `decode()`, which some browsers
 * leave pending for a page loaded in the background.
 */
export async function loadArt(): Promise<Art> {
  const loaded = await Promise.allSettled(
    ART_IDS.map(
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
  const failed = ART_IDS.filter((_, i) => loaded[i]!.status === 'rejected');
  if (failed.length) throw new Error(`art failed to load: ${failed.join(', ')}`);
  return Object.fromEntries(
    loaded.map((r) => (r as PromiseFulfilledResult<readonly [ArtId, HTMLImageElement]>).value),
  ) as Art;
}
