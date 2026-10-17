// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The recommended maximum flight level (REC MAX) of the FMS, shown on the MCDU PROG page and published for the flyPad
 * Performance > Buffet page.
 *
 * REC MAX is the lowest of: the level with a 0.3 g buffet margin, the level for level flight at MAX CRZ thrust, the
 * level with 300 ft/min at MAX CLB thrust, the level with a speed between Green Dot and VMO/MMO, and the certified
 * level. The PROG page limits it to FL398. With one engine out it shows the engine-out REC MAX, computed at the long
 * range cruise speed with anti-ice off.
 */

import { MAXIMUM_CERTIFIED_FLIGHT_LEVEL } from '@shared/A32NXPerformanceConstants';

/** The LVar of the REC MAX flight level; 0 while the FMS has no gross weight to compute it */
export const REC_MAX_FL_LVAR = 'L:A32NX_FM_REC_MAX_FL';

/** The certified maximum, the PROG page limit */
export const REC_MAX_LIMIT_FL = MAXIMUM_CERTIFIED_FLIGHT_LEVEL;

/**
 * The maximum cruise flight level for an ISA deviation and a gross weight, the FBW fit of the REC MAX
 * @param isaDeviation the ISA deviation, °C
 * @param grossWeight the gross weight, tonnes, or null when unknown
 * @returns the flight level, or null without a gross weight
 */
export function maxFlightLevel(isaDeviation: number, grossWeight: number | null): number | null {
  return grossWeight !== null
    ? Math.round(
        isaDeviation <= 10
          ? -2.778 * grossWeight + 578.667
          : (isaDeviation * -0.039 - 2.389) * grossWeight + isaDeviation * -0.667 + 585.334,
      )
    : null;
}

/** The REC MAX flight level: the maximum cruise flight level limited to FL398; null without a gross weight */
export function recMaxFlightLevel(isaDeviation: number, grossWeight: number | null): number | null {
  const maxFl = maxFlightLevel(isaDeviation, grossWeight);
  return maxFl !== null ? Math.min(maxFl, REC_MAX_LIMIT_FL) : null;
}

/**
 * The engine-out REC MAX: the one engine inoperative long-range cruise (LRC) ceiling. The ceiling table is not
 * available as data, so the FMS uses a straight line through two published one engine out LRC ceilings (ISA, gross
 * weight at the engine failure): 70 000 kg FL 182 and 62 000 kg FL 203.
 * Design choice: no ISA deviation and no anti-ice effect (only ISA values are published, and the PROG value assumes
 * anti-ice off); the line is not extrapolated beyond the weights the FMS sees, which stay within 40-80 t.
 */
const ENGINE_OUT_REC_MAX_FL_PER_TONNE = (203 - 182) / (62 - 70);
const ENGINE_OUT_REC_MAX_FL_AT_70_TONNES = 182;

/**
 * The engine-out REC MAX flight level for a gross weight
 * @param grossWeight the gross weight, tonnes, or null when unknown
 * @returns the flight level, or null without a gross weight
 */
export function engineOutRecMaxFlightLevel(grossWeight: number | null): number | null {
  return grossWeight !== null
    ? Math.min(
        Math.round(ENGINE_OUT_REC_MAX_FL_AT_70_TONNES + ENGINE_OUT_REC_MAX_FL_PER_TONNE * (grossWeight - 70)),
        REC_MAX_LIMIT_FL,
      )
    : null;
}

/**
 * The REC MAX of the PROG page: the engine-out REC MAX when one engine is out, the all-engines REC MAX otherwise
 * @param isaDeviation the ISA deviation, °C
 * @param grossWeight the gross weight, tonnes, or null when unknown
 * @param engineOut the FMS is in its engine-out condition
 * @returns the flight level, or null without a gross weight
 */
export function progRecMaxFlightLevel(
  isaDeviation: number,
  grossWeight: number | null,
  engineOut: boolean,
): number | null {
  return engineOut ? engineOutRecMaxFlightLevel(grossWeight) : recMaxFlightLevel(isaDeviation, grossWeight);
}

/** The value written to the REC MAX LVar: the flight level, or 0 when not available */
export function recMaxFlightLevelLVarValue(recMaxFl: number | null): number {
  return recMaxFl !== null && Number.isFinite(recMaxFl) ? recMaxFl : 0;
}
