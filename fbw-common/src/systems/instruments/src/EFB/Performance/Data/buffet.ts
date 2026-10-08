// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The buffet onset envelope ("coffin corner") of the flyPad Performance > Buffet page.
 *
 * Source: A320 FCOM LIM-13 P 3/10 "BUFFET ONSET" (30 MAY 12, applicable to all A318/A319/A320/A321), the chart of the
 * load factor at buffet onset against Mach, pressure altitude, CG and weight, digitised. Every altitude curve of the
 * chart is the same function of Mach scaled by the ISA static pressure ratio (fit residual 1.5 t or less over the
 * 18 curves): the chart is a lift-coefficient chart and reduces to one table G(M):
 *
 *   n_buffet = delta(pressure altitude) x G(M) x f(CG) / W [t]
 *
 * G(M)  = the load factor x weight (tonnes) at buffet onset, at sea-level pressure and CG 25 % MAC (the chart's REF line)
 * f(CG) = 1 + 0.00245 x (CG - 25), the chart's CG guide lines (all six give 0.00243 to 0.00246 per % MAC)
 *
 * Checked against the A320 QRH PER-M-2 M.78 n = 1.3 g / 1.4 g lines (CG 33 %): within about 1 % of n (the model is
 * slightly conservative). The A32NX is a neo: the neo keeps the wing of the chart's aircraft, no neo chart is
 * published in our documents ("Design choice": the family chart is used).
 *
 * The functions are pure; the flyPad page reads the live values and draws the result.
 */

/** The buffet data of an aircraft, with its speed and altitude limits */
export interface BuffetEnvelopeData {
  /** [Mach, G in tonnes], Mach ascending: the buffet onset n x W at sea-level pressure and the reference CG */
  liftTable: readonly (readonly [number, number])[];
  /** The CG of the table, % MAC */
  referenceCg: number;
  /** The change of G per % MAC of CG, as a fraction */
  cgFactorPerPercent: number;
  /** VMO in knots CAS */
  vmo: number;
  /** MMO */
  mmo: number;
  /** The maximum operating altitude, feet */
  maxOperatingAltitude: number;
}

/**
 * The A320 data.
 * - Lift table: FCOM LIM-13 BUFFET ONSET chart, M .50 to .82 (the chart's Mach axis ends at .82 = MMO).
 * - VMO/MMO: FCOM LIM-AG-SPD "VMO 350 kt", "MMO M 0.82".
 * - Maximum operating altitude: FCOM REC MAX "This field is limited to FL 398", history "EXTENSION TO 12100 M (39800 FT)".
 */
export const A320_BUFFET_ENVELOPE: BuffetEnvelopeData = {
  liftTable: [
    [0.5, 220.0],
    [0.51, 226.7],
    [0.52, 233.6],
    [0.53, 240.4],
    [0.54, 247.4],
    [0.55, 254.6],
    [0.56, 262.1],
    [0.57, 269.3],
    [0.58, 276.9],
    [0.59, 284.8],
    [0.6, 292.8],
    [0.61, 301.1],
    [0.62, 309.6],
    [0.63, 318.5],
    [0.64, 327.3],
    [0.65, 336.2],
    [0.66, 345.2],
    [0.67, 354.7],
    [0.68, 364.3],
    [0.69, 373.9],
    [0.7, 383.8],
    [0.71, 394.2],
    [0.72, 404.4],
    [0.73, 415.1],
    [0.74, 425.1],
    [0.75, 435.4],
    [0.76, 443.7],
    [0.77, 448.0],
    [0.78, 449.4],
    [0.79, 446.6],
    [0.8, 437.9],
    [0.81, 424.4],
    [0.82, 403.0],
  ],
  referenceCg: 25,
  cgFactorPerPercent: 0.00245,
  vmo: 350,
  mmo: 0.82,
  maxOperatingAltitude: 39_800,
};

/**
 * The buffet margins of the A320 FCOM and FCTM:
 * - FCOM DSC-22_20-40-30 REC MAX: "The aircraft can reach with a 0.3 g buffet margin"; "A maximum altitude using a
 *   0.2 g buffet margin is also computed ... the system uses it to limit CRZ ALT entry".
 * - FCTM: a CRZ FL above REC MAX "will be accepted only if it provides a buffet margin greater than 0.2g".
 */
export const BUFFET_CAUTION_MARGIN = 0.3;
export const BUFFET_WARNING_MARGIN = 0.2;

const FEET_TO_METRES = 0.3048;

/** The ISA static pressure ratio (p / p0) at a pressure altitude in feet */
export function isaPressureRatio(pressureAltitude: number): number {
  const h = pressureAltitude * FEET_TO_METRES;
  return h <= 11_000 ? Math.pow(1 - 2.25577e-5 * h, 5.25588) : 0.223361 * Math.exp(-(h - 11_000) / 6341.62);
}

/** The Mach range of the data: the chart has nothing outside it */
export function liftTableMachRange(data: BuffetEnvelopeData): [number, number] {
  return [data.liftTable[0][0], data.liftTable[data.liftTable.length - 1][0]];
}

/** G(M) in tonnes, by linear interpolation of the table ("Design choice"); null outside the chart's Mach range */
export function buffetLift(data: BuffetEnvelopeData, mach: number): number | null {
  const table = data.liftTable;
  const [low, high] = liftTableMachRange(data);
  if (!Number.isFinite(mach) || mach < low - 1e-9 || mach > high + 1e-9) {
    return null;
  }
  for (let i = 1; i < table.length; i++) {
    if (mach <= table[i][0] + 1e-9) {
      const [m0, g0] = table[i - 1];
      const [m1, g1] = table[i];
      return g0 + ((g1 - g0) * (mach - m0)) / (m1 - m0);
    }
  }
  return table[0][1];
}

/** The CG factor f(CG) of the chart */
export function buffetCgFactor(data: BuffetEnvelopeData, cg: number): number {
  return 1 + data.cgFactorPerPercent * (cg - data.referenceCg);
}

/**
 * The load factor at buffet onset (g) at a Mach, pressure altitude (ft), CG (% MAC) and weight (t); null outside the
 * chart's Mach range or without a weight
 */
export function buffetOnsetLoadFactor(
  data: BuffetEnvelopeData,
  mach: number,
  pressureAltitude: number,
  cg: number,
  weightTonnes: number,
): number | null {
  const lift = buffetLift(data, mach);
  if (lift === null || !(weightTonnes > 0)) {
    return null;
  }
  return (isaPressureRatio(pressureAltitude) * lift * buffetCgFactor(data, cg)) / weightTonnes;
}

/** The load factor of a level turn at a bank angle in degrees (n = 1 / cos bank) */
export function loadFactorForBank(bankDegrees: number): number {
  return 1 / Math.cos((Math.abs(bankDegrees) * Math.PI) / 180);
}

/** The largest bank angle (degrees) of a level turn before buffet onset; 0 when the level flight is already in buffet */
export function maxBankBeforeBuffet(buffetLoadFactor: number): number {
  return buffetLoadFactor > 1 ? (Math.acos(1 / buffetLoadFactor) * 180) / Math.PI : 0;
}

/** The Mach numbers where the load factor n is reached: low-speed and high-speed buffet */
export interface BuffetMachRange {
  /** null: n is reached below M .50, the start of the chart (no low-speed edge drawn there) */
  low: number | null;
  /** null: still clear of buffet at the end of the chart (M .82 = MMO, the speed limit comes first) */
  high: number | null;
}

/**
 * The low-speed and high-speed buffet Mach for a load factor n at a pressure altitude (ft), CG and weight (t).
 * null when n is out of reach at that altitude (above the coffin corner).
 */
export function buffetMachRange(
  data: BuffetEnvelopeData,
  loadFactor: number,
  pressureAltitude: number,
  cg: number,
  weightTonnes: number,
): BuffetMachRange | null {
  if (!(weightTonnes > 0)) {
    return null;
  }
  const needed = (loadFactor * weightTonnes) / (isaPressureRatio(pressureAltitude) * buffetCgFactor(data, cg));
  const table = data.liftTable;
  let peak = 0;
  for (let i = 1; i < table.length; i++) {
    if (table[i][1] > table[peak][1]) {
      peak = i;
    }
  }
  if (needed > table[peak][1]) {
    return null;
  }
  // The table is linear between its rows: solve each side on the row pair that crosses the needed value
  const crossing = (i: number) => {
    const [m0, g0] = table[i - 1];
    const [m1, g1] = table[i];
    return g1 === g0 ? m0 : m0 + ((needed - g0) * (m1 - m0)) / (g1 - g0);
  };
  let low: number | null = null;
  for (let i = 1; i <= peak && needed >= table[0][1]; i++) {
    if (table[i][1] >= needed) {
      low = crossing(i);
      break;
    }
  }
  let high: number | null = null;
  for (let i = peak + 1; i < table.length; i++) {
    if (table[i][1] < needed) {
      high = crossing(i);
      break;
    }
  }
  return { low, high };
}

/**
 * The pressure altitude (ft) where the load factor at buffet onset is n, at a Mach, CG and weight (t); null outside
 * the chart's Mach range
 */
export function buffetCeiling(
  data: BuffetEnvelopeData,
  loadFactor: number,
  mach: number,
  cg: number,
  weightTonnes: number,
): number | null {
  const lift = buffetLift(data, mach);
  if (lift === null || !(weightTonnes > 0)) {
    return null;
  }
  const ratio = (loadFactor * weightTonnes) / (lift * buffetCgFactor(data, cg));
  // isaPressureRatio falls with altitude: bisection between sea level and 60 000 ft
  let low = 0;
  let high = 60_000;
  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2;
    if (isaPressureRatio(mid) > ratio) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return low;
}

/** The Mach of a calibrated airspeed (kt) at a pressure altitude (ft), subsonic */
export function casToMach(cas: number, pressureAltitude: number): number {
  const seaLevelSpeedOfSound = 661.4786;
  const impactPressureRatio = Math.pow(1 + 0.2 * (cas / seaLevelSpeedOfSound) ** 2, 3.5) - 1;
  const ratio = impactPressureRatio / isaPressureRatio(pressureAltitude);
  return Math.sqrt(5 * (Math.pow(ratio + 1, 2 / 7) - 1));
}

/** The maximum operating Mach at a pressure altitude: VMO below the crossover, MMO above */
export function maxOperatingMach(data: BuffetEnvelopeData, pressureAltitude: number): number {
  return Math.min(data.mmo, casToMach(data.vmo, pressureAltitude));
}

/** none / caution (amber) / warning (red) */
export type BuffetAlert = 'none' | 'caution' | 'warning';

/**
 * The alert of the page:
 * - warning: the level margin under 0.2 g (the FMS limit of a CRZ FL), or the bank needs more than the buffet onset;
 * - caution: the level margin under 0.3 g (the REC MAX criterion).
 */
export function buffetAlert(levelMargin: number, turnMargin?: number): BuffetAlert {
  if (levelMargin < BUFFET_WARNING_MARGIN - 1e-9 || (turnMargin !== undefined && turnMargin < 0)) {
    return 'warning';
  }
  if (levelMargin < BUFFET_CAUTION_MARGIN - 1e-9) {
    return 'caution';
  }
  return 'none';
}

/** What the page shows for one set of inputs */
export interface BuffetInputs {
  weightTonnes: number;
  /** % MAC */
  cg: number;
  /** Pressure altitude, feet */
  pressureAltitude: number;
  mach: number;
  /** Degrees, either side */
  bank: number;
}

export interface BuffetResult {
  /** The load factor at buffet onset at the inputs */
  buffetLoadFactor: number;
  /** n_buffet - 1 */
  levelMargin: number;
  /** The load factor of the level turn at the bank */
  turnLoadFactor: number;
  /** n_buffet - n_turn */
  turnMargin: number;
  maxBank: number;
  /** The 1.3 g (0.3 g margin) ceiling at the Mach, feet */
  ceiling13: number | null;
  /** The 1.0 g (aerodynamic) ceiling at the Mach, feet */
  ceiling10: number | null;
  /** The Mach range with a 0.3 g margin at the altitude */
  range13: BuffetMachRange | null;
  maxOperatingMach: number;
  alert: BuffetAlert;
}

/** The results of the page; null outside the chart (Mach out of the table, no weight) */
export function evaluateBuffet(data: BuffetEnvelopeData, inputs: BuffetInputs): BuffetResult | null {
  const { weightTonnes, cg, pressureAltitude, mach, bank } = inputs;
  const buffetLoadFactor = buffetOnsetLoadFactor(data, mach, pressureAltitude, cg, weightTonnes);
  if (buffetLoadFactor === null) {
    return null;
  }
  const turnLoadFactor = loadFactorForBank(bank);
  const levelMargin = buffetLoadFactor - 1;
  const turnMargin = buffetLoadFactor - turnLoadFactor;
  return {
    buffetLoadFactor,
    levelMargin,
    turnLoadFactor,
    turnMargin,
    maxBank: maxBankBeforeBuffet(buffetLoadFactor),
    ceiling13: buffetCeiling(data, 1.3, mach, cg, weightTonnes),
    ceiling10: buffetCeiling(data, 1.0, mach, cg, weightTonnes),
    range13: buffetMachRange(data, 1.3, pressureAltitude, cg, weightTonnes),
    maxOperatingMach: maxOperatingMach(data, pressureAltitude),
    alert: buffetAlert(levelMargin, turnLoadFactor > 1 ? turnMargin : undefined),
  };
}

/** A buffet boundary of the chart: its low-speed and high-speed sides as [Mach, flight level] points */
export interface BuffetBoundary {
  lowSpeed: [number, number][];
  highSpeed: [number, number][];
}

/**
 * The buffet boundary for a load factor n from one flight level to another (step 1 FL), cut at the maximum operating
 * Mach (the high-speed side above MMO is not drawn: "Design choice", MMO comes first)
 */
export function buffetBoundary(
  data: BuffetEnvelopeData,
  loadFactor: number,
  cg: number,
  weightTonnes: number,
  fromFlightLevel: number,
  toFlightLevel: number,
): BuffetBoundary {
  const lowSpeed: [number, number][] = [];
  const highSpeed: [number, number][] = [];
  for (let fl = fromFlightLevel; fl <= toFlightLevel; fl++) {
    const range = buffetMachRange(data, loadFactor, fl * 100, cg, weightTonnes);
    if (range === null) {
      continue;
    }
    const limit = maxOperatingMach(data, fl * 100);
    if (range.low !== null && range.low <= limit) {
      lowSpeed.push([range.low, fl]);
    }
    if (range.high !== null && range.high <= limit) {
      highSpeed.push([range.high, fl]);
    }
  }
  return { lowSpeed, highSpeed };
}
