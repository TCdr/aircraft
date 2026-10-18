// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The optimum flight level (OPT FL) of the MCDU PROG page.
 *
 * The OPT FL is the most economic level for the cost index, weight and weather: the level with the best specific range
 * (most distance per kg of fuel), which depends on the weight and the ISA deviation. The PROG page shows dashes with an
 * engine out.
 *
 * The optimum altitude chart is not available as data, so the optimum is taken where the specific range (SR) of the
 * long range cruise table is the best (ISA, A320neo up to 79 t, SR in NM/1000 kg from FL290 to FL390). For each weight,
 * the optimum is the top of the parabola through the best SR and its two neighbours:
 *   62 t: 214.9 222.0 229.3 237.2 244.7 248.7 -> FL403    70 t: 200.1 206.3 213.4 219.7 222.6 220.0 -> FL371
 *   64 t: 211.0 217.9 224.9 232.8 239.4 241.9 -> FL392    74 t: 193.5 199.7 206.1 210.4 210.3       -> FL360
 *   66 t: 207.2 214.0 221.0 228.5 233.9 234.8 -> FL384    76 t: 190.2 196.5 202.4 205.7 203.4       -> FL352
 *   68 t: 203.6 210.1 217.1 224.2 228.2 226.8 -> FL375    78 t: 187.4 193.4 198.6 201.0 197.8       -> FL349
 * (72 t and 79 t end at the max cruise thrust limit before their best SR and are left out; below 62 t the best SR is
 * above FL390.)
 * Design choices, because the FMS computation is not published: the LRC (cost-index independent) table stands for the
 * economic speed (the published OPT FL ignores the cost index too, so it differs from the FMGS one), ISA (the ISA+20
 * table is cut by the max cruise thrust, which the REC MAX already limits), no wind; the OPT FL is never above the
 * REC MAX.
 */

/** [gross weight (t), optimum flight level] from the LRC specific range table (see above) */
const OPTIMUM_FLIGHT_LEVEL_TABLE: readonly (readonly [number, number])[] = [
  [62, 403],
  [64, 392],
  [66, 384],
  [68, 375],
  [70, 371],
  [74, 360],
  [76, 352],
  [78, 349],
];

/**
 * The optimum flight level for a gross weight: linear between the table weights, along the first or last segment of the
 * table beyond them
 * @param grossWeight the gross weight, tonnes
 */
export function optimumFlightLevelForWeight(grossWeight: number): number {
  const table = OPTIMUM_FLIGHT_LEVEL_TABLE;
  let i = 0;
  while (i < table.length - 2 && grossWeight > table[i + 1][0]) {
    i++;
  }
  const [w0, fl0] = table[i];
  const [w1, fl1] = table[i + 1];
  return fl0 + ((fl1 - fl0) * (grossWeight - w0)) / (w1 - w0);
}

/**
 * The OPT FL of the PROG page: the optimum flight level for the gross weight, not above the REC MAX, rounded down to a
 * multiple of 5 (Design choice: no display resolution is published); null (dashes) without a gross weight or REC MAX,
 * or with an engine out
 * @param grossWeight the gross weight, tonnes, or null when unknown
 * @param recMaxFlightLevel the REC MAX flight level, or null when unknown
 * @param engineOut the FMS engine-out condition
 */
export function progOptimumFlightLevel(
  grossWeight: number | null,
  recMaxFlightLevel: number | null,
  engineOut: boolean,
): number | null {
  if (grossWeight === null || recMaxFlightLevel === null || engineOut) {
    return null;
  }
  const optimum = Math.min(optimumFlightLevelForWeight(grossWeight), recMaxFlightLevel);
  return Math.floor(optimum / 5) * 5;
}
