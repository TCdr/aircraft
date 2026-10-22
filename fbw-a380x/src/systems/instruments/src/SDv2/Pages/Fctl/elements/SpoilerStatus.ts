// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

export const SPOILER_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export type SpoilerNumber = (typeof SPOILER_NUMBERS)[number];

type SpoilerWing = 'left' | 'right';

export type FctlSpoilerFailedTopic = `${SpoilerWing}Spoiler${SpoilerNumber}Failed`;

/**
 * @param wing the wing of the spoiler
 * @param spoiler spoiler 1 (inboard) to 8 (outboard)
 * @returns the event of the spoiler reported failed by its flight control computer
 */
export function spoilerFailedTopic(wing: SpoilerWing, spoiler: SpoilerNumber): FctlSpoilerFailedTopic {
  return `${wing}Spoiler${spoiler}Failed`;
}

/**
 * Spoilers 1, 3, 5 and 7 have a yellow actuator, spoilers 2, 4, 6 and 8 a green one.
 * @param spoiler spoiler 1 to 8
 * @returns the hydraulic system of the spoiler actuator
 */
export function spoilerHydraulicSystem(spoiler: SpoilerNumber): 'green' | 'yellow' {
  return spoiler % 2 === 0 ? 'green' : 'yellow';
}

/**
 * The actuator of spoiler 6 is an EBHA: without green hydraulic pressure it works as an EHA on the AC ESS busbar, in
 * flight only.
 * Design choice: spoiler 5 is shown on its yellow actuator only. Its EBHA electrical backup (AC 3 busbar) is not
 * simulated, so the spoiler does not move without yellow hydraulic pressure.
 * @param spoiler spoiler 1 to 8
 * @param hydPowerAvailable the hydraulic system of the spoiler actuator is pressurised
 * @param acEssPowered the AC ESS busbar is powered
 * @param onGround the aircraft is on the ground
 * @returns whether the spoiler actuator has a power supply
 */
export function isSpoilerPowered(
  spoiler: SpoilerNumber,
  hydPowerAvailable: boolean,
  acEssPowered: boolean,
  onGround: boolean,
): boolean {
  if (hydPowerAvailable) {
    return true;
  }
  return spoiler === 6 && !onGround && !!acEssPowered;
}
