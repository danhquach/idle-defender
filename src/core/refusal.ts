// Why an action is refused (ID-269): a code and the facts it needs, never a sentence. The UI
// words each code (`refusalText`, ui/text/refusals.ts), so rewording one never touches the
// simulation or replays balance. `short` marks a refusal where only the cost stands in the way
// (the UI shows it unaffordable, ID-056); it is set only from a cost check.
import type { Held } from './armoury.ts';
import type {
  AreaId,
  CampPickId,
  Focus,
  Material,
  PerkId,
  PlaceId,
  ResearchId,
  SkillId,
  TechId,
  Tier,
} from './data.ts';
import type { QueueId } from './research.ts';

/** What a too-small camp blocks (`letGoLock`): the words are the UI's. */
export type CampAct = 'let-go' | 'combine' | 'combine-or-let-go';

export type RefusalWhy =
  // The fight: moving a defender, a replacement, skills, the shop and the card offer.
  | { code: 'fight-over' }
  | { code: 'horde-over' }
  | { code: 'pick-card' }
  | { code: 'pick-replacement' }
  | { code: 'pick-first' }
  | { code: 'hold-slots' }
  | { code: 'on-the-way' }
  | { code: 'already-there' }
  | { code: 'post-reserved' }
  | { code: 'post-taken' }
  | { code: 'no-wall' }
  | { code: 'research-skill'; skill: SkillId }
  | { code: 'not-ready' }
  | { code: 'no-cash' }
  | { code: 'aim-field' }
  | { code: 'buff-active' }
  | { code: 'no-patch' }
  | { code: 'no-fix' }
  | { code: 'pick-repairs' }
  | { code: 'repairs-used' }
  | { code: 'wall-full' }
  | { code: 'no-offer-reroll' }
  | { code: 'no-rerolls' }
  | { code: 'no-offer-ban' }
  | { code: 'no-bans' }
  | { code: 'no-card' }
  | { code: 'ban-survivor' }
  // Between hordes: the squad, the bench, guns in the stash, craft, the World map.
  | { code: 'scrap'; need: number }
  | { code: 'scrap-more'; need: number }
  | { code: 'skill-pick-max'; max: number }
  | { code: 'slots-bought'; kind: 'squad' | 'stash' }
  | { code: 'no-gun' }
  | { code: 'upgrade-gun-only' }
  | { code: 'top-step'; max: number }
  | { code: 'no-blueprint' }
  | { code: 'craft-amount'; min: number; max: number }
  | { code: 'craft-max' }
  | { code: 'craft-stash-full' }
  | { code: 'no-survivor' }
  | { code: 'on-patrol'; who: string }
  | { code: 'squad-last' }
  | { code: 'resting-for'; rest: number }
  | { code: 'squad-full'; cap: number }
  | { code: 'not-resting'; who: string }
  | { code: 'no-medicine' }
  | { code: 'no-joiner' }
  | { code: 'camp-small'; need: number; have: number; act: CampAct }
  | { code: 'combine-self' }
  | { code: 'combine-job' }
  | { code: 'stash-full'; cap: number }
  | { code: 'not-in-stash' }
  | { code: 'holds-gun'; who: string }
  | { code: 'pistol-combine' }
  | { code: 'combine-count'; count: number }
  | { code: 'combine-gun-only' }
  | { code: 'combine-kind' }
  | { code: 'combine-rarity' }
  | { code: 'combine-relic' }
  | { code: 'pistol-salvage' }
  | { code: 'salvage-gun-only' }
  | { code: 'area-missing' }
  | { code: 'area-busy'; area: AreaId }
  | { code: 'pick-someone' }
  | { code: 'team-max'; max: number }
  | { code: 'picked-twice' }
  | { code: 'squad-stays' }
  | { code: 'pick-camp' }
  | { code: 'resting'; who: string }
  | { code: 'no-patrol-out' }
  | { code: 'patrol-not-back' }
  | { code: 'no-areas' }
  | { code: 'areas-busy' }
  // A loadout (full game's equip; a save's loadouts are checked with it too).
  | { code: 'primary-gun' }
  | { code: 'secondary-sidearm' }
  | { code: 'shield-blade' }
  | { code: 'carries'; who: string; held: Held }
  | { code: 'one-weapon-two-slots' }
  // The full game: building the base, the camp, patrols, research, perks and power.
  | { code: 'short'; material: Material }
  | { code: 'slot-taken' }
  | { code: 'tier-locked'; tier: Tier }
  | { code: 'one-gate' }
  | { code: 'nothing-built' }
  | { code: 'top-tier' }
  | { code: 'nothing-to-repair' }
  | { code: 'walk-needs-wall' }
  | { code: 'post-needs-front'; post: 'tower' | 'ground' }
  | { code: 'no-free-spot' }
  | { code: 'mount-walk-wall' }
  | { code: 'mount-tower-front' }
  | { code: 'research-turret' }
  | { code: 'camp-max' }
  | { code: 'short-materials' }
  | { code: 'cars-max' }
  | { code: 'cars-research' }
  | { code: 'dismiss-floor'; floor: number }
  | { code: 'no-camp-pick' }
  | { code: 'not-on-offer'; choice: CampPickId | 'join' | 'away' }
  | { code: 'camp-full' }
  | { code: 'armoury-full' }
  | { code: 'not-injured'; who: string }
  | { code: 'no-item'; item: Material }
  | { code: 'patrols-locked' }
  | { code: 'patrols-max' }
  | { code: 'place-hidden'; place: PlaceId }
  | { code: 'building-outside'; place: PlaceId }
  | { code: 'tick-building' }
  | { code: 'focus-none'; focus: Focus }
  | { code: 'need-gate' }
  | { code: 'injured'; who: string }
  | { code: 'keep-one' }
  | { code: 'build-car' }
  | { code: 'car-out' }
  | { code: 'gas'; need: number; have: number }
  | { code: 'lab-top' }
  | { code: 'queue-full' }
  | { code: 'researched' }
  | { code: 'owned' }
  | { code: 'queued' }
  | { code: 'needs-lab' }
  | { code: 'needs-lab-level'; level: number }
  | { code: 'needs-research'; node: ResearchId }
  | { code: 'needs-perk'; perk: PerkId }
  | { code: 'perk-top'; perk: PerkId }
  | { code: 'not-queued' }
  /** `level`: the perk level a perk-level entry raises to (`entryLevel`); null for a node. */
  | { code: 'needed-by'; entry: QueueId; level: number | null }
  | { code: 'perk-equipped' }
  | { code: 'perk-unresearched' }
  | { code: 'perk-slots-full' }
  | { code: 'perk-not-equipped' }
  | { code: 'generator-built' }
  // The Research Center (ID-263, horde-only).
  | { code: 'unknown-tech' }
  | { code: 'needs-tech'; node: TechId }
  // The starting pick (ID-284).
  | { code: 'kit-locked' }
  | { code: 'kit-slot' }
  /** Worded with thousands separators ("Needs 1,200 Scrap"), as the Research Center shows costs. */
  | { code: 'tech-scrap'; need: number };

/** A refusal: `ok: false`, the code and its facts. */
export type Refusal = { ok: false; short?: true } & RefusalWhy;
export type RefusalCode = RefusalWhy['code'];
