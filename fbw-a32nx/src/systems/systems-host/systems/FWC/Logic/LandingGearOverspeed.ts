// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The landing gear position the FWC gets from the two LGCIUs, for OVER SPEED VLE */
export interface VleGearPositionInputs {
  /** The three gears are locked up, from the valid LGCIU uplock words (discrete word 3) */
  readonly gearLockedUp: boolean;
  /** At least one LGCIU sends a valid uplock word (discrete word 3): the FWC knows the uplock position */
  readonly uplockPositionAvailable: boolean;
  /** A valid LGCIU reports a gear door not closed (discrete word 1) */
  readonly gearDoorNotClosed: boolean;
}

/**
 * "L/G not uplocked or L/G doors not closed", the gear condition of OVER SPEED VLE: the alert triggers above VLE + 4 kt
 * with this condition. The uplock position comes from the LGCIU proximity detector outputs, one valid output is
 * enough. With no valid LGCIU output (both LGCIUs unpowered, e.g. ELEC DC EMER CONFIG: LGCIU 1 on DC ESS, LGCIU 2 on
 * DC 2; or L/G LGCIU 1+2 FAULT, which loses the normal landing gear control and position indications) the FWC has no
 * gear position, so it cannot see the gear not uplocked: a lost uplock word must not read as "not uplocked".
 * @param inputs the gear position from the LGCIUs
 * @returns true when the gear is known not uplocked, or a gear door is known not closed
 */
export function isGearNotUplockedForVle(inputs: VleGearPositionInputs): boolean {
  const gearKnownNotUplocked = inputs.uplockPositionAvailable && !inputs.gearLockedUp;
  return gearKnownNotUplocked || inputs.gearDoorNotClosed;
}
