// Every refusal code pinned to the sentence the player read before the text left core
// (ID-269): the table is typed by code, so a new code without a pin fails tsc.
import { describe, expect, it } from 'vitest';
import type { RefusalCode, RefusalWhy } from '../../core/refusal.ts';
import { lockText, refusalText } from './refusals.ts';

type Pins = { readonly [C in RefusalCode]: readonly [Extract<RefusalWhy, { code: C }>, string][] };

const PINS: Pins = {
  'fight-over': [[{ code: 'fight-over' }, 'The fight is over']],
  'horde-over': [[{ code: 'horde-over' }, 'The horde is over']],
  'pick-card': [[{ code: 'pick-card' }, 'Pick a card first']],
  'pick-replacement': [[{ code: 'pick-replacement' }, 'Pick a replacement first']],
  'pick-first': [[{ code: 'pick-first' }, 'Pick first']],
  'hold-slots': [[{ code: 'hold-slots' }, 'Survivors hold their slots']],
  'on-the-way': [[{ code: 'on-the-way' }, 'Already on the way']],
  'already-there': [[{ code: 'already-there' }, 'Already there']],
  'post-reserved': [[{ code: 'post-reserved' }, 'Post reserved']],
  'post-taken': [[{ code: 'post-taken' }, 'Post taken']],
  'no-wall': [[{ code: 'no-wall' }, 'No wall to stand on']],
  'research-skill': [[{ code: 'research-skill', skill: 'airstrike' }, 'Research Airstrike first']],
  'not-ready': [[{ code: 'not-ready' }, 'Not ready yet']],
  'no-cash': [[{ code: 'no-cash' }, 'Not enough cash']],
  'aim-field': [[{ code: 'aim-field' }, 'Aim at the field']],
  'buff-active': [[{ code: 'buff-active' }, 'Already active']],
  'no-patch': [[{ code: 'no-patch' }, 'No wall to patch']],
  'no-fix': [[{ code: 'no-fix' }, 'No turret to fix']],
  'pick-repairs': [[{ code: 'pick-repairs' }, 'Pick Field Repairs first']],
  'repairs-used': [[{ code: 'repairs-used' }, 'Already used']],
  'wall-full': [[{ code: 'wall-full' }, 'The wall is full']],
  'no-offer-reroll': [[{ code: 'no-offer-reroll' }, 'No offer to reroll']],
  'no-rerolls': [[{ code: 'no-rerolls' }, 'No rerolls left']],
  'no-offer-ban': [[{ code: 'no-offer-ban' }, 'No offer to ban from']],
  'no-bans': [[{ code: 'no-bans' }, 'No bans left']],
  'no-card': [[{ code: 'no-card' }, 'No such card']],
  'ban-survivor': [[{ code: 'ban-survivor' }, 'A survivor can’t be banned']],
  scrap: [
    [{ code: 'scrap', need: 0 }, 'Needs 0 Scrap'],
    [{ code: 'scrap', need: 1 }, 'Needs 1 Scrap'],
    [{ code: 'scrap', need: 1200 }, 'Needs 1200 Scrap'],
  ],
  'scrap-more': [[{ code: 'scrap-more', need: 70 }, 'Needs 70 more Scrap']],
  'skill-pick-max': [[{ code: 'skill-pick-max', max: 2 }, 'Pick up to 2: drop one first']],
  'slots-bought': [
    [{ code: 'slots-bought', kind: 'squad' }, 'Every squad slot is bought'],
    [{ code: 'slots-bought', kind: 'stash' }, 'Every stash slot is bought'],
  ],
  'no-gun': [[{ code: 'no-gun' }, 'No such gun']],
  'upgrade-gun-only': [[{ code: 'upgrade-gun-only' }, 'Only guns can be upgraded']],
  'top-step': [[{ code: 'top-step', max: 5 }, 'Already at +5']],
  'no-blueprint': [[{ code: 'no-blueprint' }, 'No blueprint for that gun']],
  'craft-amount': [[{ code: 'craft-amount', min: 20, max: 220 }, 'Put in 20 to 220 Scrap']],
  'craft-max': [[{ code: 'craft-max' }, 'No more guns can be crafted']],
  'craft-stash-full': [[{ code: 'craft-stash-full' }, 'Stash full']],
  'no-survivor': [[{ code: 'no-survivor' }, 'No such survivor']],
  'on-patrol': [[{ code: 'on-patrol', who: 'Jade' }, 'Jade is on patrol']],
  'squad-last': [[{ code: 'squad-last' }, 'The squad needs someone to fight']],
  'resting-for': [
    [{ code: 'resting-for', rest: 1 }, 'Resting: 1 horde'],
    [{ code: 'resting-for', rest: 2 }, 'Resting: 2 hordes'],
  ],
  'squad-full': [[{ code: 'squad-full', cap: 6 }, 'The squad is full (6/6): unmark one first']],
  'not-resting': [[{ code: 'not-resting', who: 'Jade' }, 'Jade is not resting']],
  'no-medicine': [[{ code: 'no-medicine' }, 'No Medicine']],
  'no-joiner': [[{ code: 'no-joiner' }, 'Nobody by that name is asking to join']],
  'camp-small': [
    [
      { code: 'camp-small', need: 7, have: 3, act: 'let-go' },
      'Needs 7+ survivors to let one go (camp 3)',
    ],
    [
      { code: 'camp-small', need: 7, have: 6, act: 'combine' },
      'Needs 7+ survivors to combine (camp 6)',
    ],
    [
      { code: 'camp-small', need: 9, have: 8, act: 'combine-or-let-go' },
      'Needs 9+ survivors to combine or let one go (camp 8)',
    ],
  ],
  'combine-self': [[{ code: 'combine-self' }, 'A survivor cannot combine with themselves']],
  'combine-job': [[{ code: 'combine-job' }, 'Only survivors of the same profession combine']],
  'stash-full': [[{ code: 'stash-full', cap: 40 }, 'The stash is full (40/40)']],
  'not-in-stash': [[{ code: 'not-in-stash' }, 'That gun is not in the stash']],
  'holds-gun': [
    [{ code: 'holds-gun', who: 'Ivan' }, 'Ivan holds that gun: put it back in the stash first'],
  ],
  'pistol-combine': [[{ code: 'pistol-combine' }, 'The free pistol can’t be combined']],
  'combine-count': [[{ code: 'combine-count', count: 3 }, 'Combining takes 3 different guns']],
  'combine-gun-only': [[{ code: 'combine-gun-only' }, 'Only guns can be combined']],
  'combine-kind': [[{ code: 'combine-kind' }, 'Combining takes guns of one kind']],
  'combine-rarity': [[{ code: 'combine-rarity' }, 'Combining takes guns of one rarity']],
  'combine-relic': [
    [{ code: 'combine-relic' }, 'A Relic gun is the best there is: it can’t be combined'],
  ],
  'pistol-salvage': [[{ code: 'pistol-salvage' }, 'The free pistol can’t be salvaged']],
  'salvage-gun-only': [[{ code: 'salvage-gun-only' }, 'Only guns can be salvaged']],
  'area-missing': [[{ code: 'area-missing' }, 'That area is not on the map']],
  'area-busy': [
    [{ code: 'area-busy', area: 'police' }, 'A patrol is already out at Police station'],
    [{ code: 'area-busy', area: 'pharmacy' }, 'A patrol is already out at Pharmacy'],
  ],
  'pick-someone': [[{ code: 'pick-someone' }, 'Pick someone to send']],
  'team-max': [[{ code: 'team-max', max: 4 }, 'At most 4 can go']],
  'picked-twice': [[{ code: 'picked-twice' }, 'Someone is picked twice']],
  'squad-stays': [[{ code: 'squad-stays' }, 'Squad survivors stay to defend']],
  'pick-camp': [[{ code: 'pick-camp' }, 'Pick survivors from the camp']],
  resting: [[{ code: 'resting', who: 'Jade' }, 'Jade is resting']],
  'no-patrol-out': [[{ code: 'no-patrol-out' }, 'No patrol is out there']],
  'patrol-not-back': [[{ code: 'patrol-not-back' }, 'The patrol is not back yet']],
  'no-areas': [[{ code: 'no-areas' }, 'No areas yet']],
  'areas-busy': [[{ code: 'areas-busy' }, 'Every area has a patrol out']],
  'primary-gun': [[{ code: 'primary-gun' }, 'The primary must be a gun']],
  'secondary-sidearm': [
    [{ code: 'secondary-sidearm' }, 'Only a sidearm goes in the secondary slot'],
  ],
  'shield-blade': [[{ code: 'shield-blade' }, 'A shield needs a blade']],
  carries: [
    [{ code: 'carries', who: 'Jack', held: 'pistol' }, 'Jack carries the Pistol'],
    [
      {
        code: 'carries',
        who: 'Jack',
        held: { uid: 'w', base: 'sniper', rarity: 'prototype', level: 4, step: 3, affixes: [] },
      },
      'Jack carries the Prototype Sniper rifle +3',
    ],
  ],
  'one-weapon-two-slots': [[{ code: 'one-weapon-two-slots' }, "One weapon can't fill two slots"]],
  short: [
    [{ code: 'short', material: 'scrap' }, 'Not enough scrap'],
    [{ code: 'short', material: 'genes' }, 'Not enough genes'],
  ],
  'slot-taken': [[{ code: 'slot-taken' }, 'Slot taken']],
  'tier-locked': [
    [{ code: 'tier-locked', tier: 'metal' }, 'Metal is locked'],
    [{ code: 'tier-locked', tier: 'reinforced' }, 'Reinforced is locked'],
  ],
  'one-gate': [[{ code: 'one-gate' }, 'This layer already has a gate']],
  'nothing-built': [[{ code: 'nothing-built' }, 'Nothing built here']],
  'top-tier': [[{ code: 'top-tier' }, 'Already at the top tier']],
  'nothing-to-repair': [[{ code: 'nothing-to-repair' }, 'Nothing to repair']],
  'walk-needs-wall': [[{ code: 'walk-needs-wall' }, 'A wall-walk post needs a wall']],
  'post-needs-front': [
    [{ code: 'post-needs-front', post: 'tower' }, 'A tower needs a wall in front'],
    [{ code: 'post-needs-front', post: 'ground' }, 'A ground post needs a wall in front'],
  ],
  'no-free-spot': [[{ code: 'no-free-spot' }, 'No free spot on this wall']],
  'mount-walk-wall': [[{ code: 'mount-walk-wall' }, 'A wall mount needs a wall']],
  'mount-tower-front': [[{ code: 'mount-tower-front' }, 'A tower mount needs a wall in front']],
  'research-turret': [[{ code: 'research-turret' }, 'Research the Auto-turret first']],
  'camp-max': [[{ code: 'camp-max' }, 'The camp is as big as it gets']],
  'short-materials': [[{ code: 'short-materials' }, 'Not enough materials']],
  'cars-max': [[{ code: 'cars-max' }, 'The camp has all its cars']],
  'cars-research': [[{ code: 'cars-research' }, 'More cars come with research']],
  'dismiss-floor': [[{ code: 'dismiss-floor', floor: 3 }, 'Not while 3 or fewer are alive']],
  'no-camp-pick': [[{ code: 'no-camp-pick' }, 'No camp pick waiting']],
  'not-on-offer': [
    [{ code: 'not-on-offer', choice: 'medic' }, "medic isn't on offer"],
    [{ code: 'not-on-offer', choice: 'join' }, "join isn't on offer"],
  ],
  'camp-full': [[{ code: 'camp-full' }, 'The camp is full']],
  'armoury-full': [[{ code: 'armoury-full' }, 'The armoury is full']],
  'not-injured': [[{ code: 'not-injured', who: 'Bob' }, "Bob isn't injured"]],
  'no-item': [
    [{ code: 'no-item', item: 'food' }, 'No food left'],
    [{ code: 'no-item', item: 'medicine' }, 'No medicine left'],
  ],
  'patrols-locked': [[{ code: 'patrols-locked' }, 'Patrols open after Horde 2']],
  'patrols-max': [[{ code: 'patrols-max' }, 'No more patrols can be sent']],
  'place-hidden': [
    [{ code: 'place-hidden', place: 'crater' }, "The crater isn't on the map yet"],
    [{ code: 'place-hidden', place: 'riverside' }, "Riverside Plaza isn't on the map yet"],
  ],
  'building-outside': [
    [
      { code: 'building-outside', place: 'gas-station' },
      'Not every building is part of Gas station',
    ],
  ],
  'tick-building': [[{ code: 'tick-building' }, 'Tick a building to search']],
  'focus-none': [
    [{ code: 'focus-none', focus: 'wood' }, "Nothing to favour: wood can't be found there"],
  ],
  'need-gate': [[{ code: 'need-gate' }, 'Patrols leave by a gate: build or repair one']],
  injured: [[{ code: 'injured', who: 'Bob' }, 'Bob is injured']],
  'keep-one': [[{ code: 'keep-one' }, 'Keep one defender at the camp']],
  'build-car': [[{ code: 'build-car' }, 'Build a car first']],
  'car-out': [[{ code: 'car-out' }, 'The car is out on patrol']],
  gas: [[{ code: 'gas', need: 13, have: 0 }, 'Not enough Gas: the car needs 13, the camp has 0']],
  'lab-top': [[{ code: 'lab-top' }, 'The Lab is at the top level']],
  'queue-full': [[{ code: 'queue-full' }, 'The research queue is full']],
  researched: [[{ code: 'researched' }, 'Already researched']],
  owned: [[{ code: 'owned' }, 'Already owned']],
  queued: [[{ code: 'queued' }, 'Already queued']],
  'needs-lab': [[{ code: 'needs-lab' }, 'Needs a Research Lab']],
  'needs-lab-level': [[{ code: 'needs-lab-level', level: 2 }, 'Needs Lab level 2']],
  'needs-research': [[{ code: 'needs-research', node: 'perk-slot-2' }, 'Needs Perk slot 2']],
  'needs-perk': [[{ code: 'needs-perk', perk: 'fortify' }, 'Needs Fortify']],
  'perk-top': [[{ code: 'perk-top', perk: 'fortify' }, 'Fortify is at the top level']],
  'not-queued': [[{ code: 'not-queued' }, 'Not in the queue']],
  'needed-by': [
    [{ code: 'needed-by', entry: 'auto-turret', level: null }, 'Auto-turret needs it'],
    [{ code: 'needed-by', entry: 'level-fortify', level: 2 }, 'Fortify level 2 needs it'],
  ],
  'perk-equipped': [[{ code: 'perk-equipped' }, 'Already equipped']],
  'perk-unresearched': [[{ code: 'perk-unresearched' }, 'Not researched']],
  'perk-slots-full': [[{ code: 'perk-slots-full' }, 'All perk slots are full']],
  'perk-not-equipped': [[{ code: 'perk-not-equipped' }, 'Not equipped']],
  'generator-built': [[{ code: 'generator-built' }, 'The generator is already built']],
  'unknown-tech': [[{ code: 'unknown-tech' }, 'Unknown upgrade']],
  'needs-tech': [
    [{ code: 'needs-tech', node: 'razor-wire' }, 'Needs Razor Wire'],
    [{ code: 'needs-tech', node: 'steel-plating' }, 'Needs Steel Plating'],
  ],
  'kit-locked': [[{ code: 'kit-locked' }, 'Research it first']],
  'kit-slot': [[{ code: 'kit-slot' }, 'Not a card for that slot']],
  'tech-scrap': [
    [{ code: 'tech-scrap', need: 200 }, 'Needs 200 Scrap'],
    [{ code: 'tech-scrap', need: 1200 }, 'Needs 1,200 Scrap'],
  ],
};

describe('refusalText (ID-269)', () => {
  it.each(Object.values(PINS).flat())('words %o as %j', (r, text) => {
    expect(refusalText(r)).toBe(text);
  });

  it('lockText: null when nothing is in the way', () => {
    expect(lockText(null)).toBeNull();
    expect(lockText({ code: 'no-cash' })).toBe('Not enough cash');
  });
});
