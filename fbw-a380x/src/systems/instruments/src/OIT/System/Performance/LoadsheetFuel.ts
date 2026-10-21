// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { KG_PER_LB, formatWholeWeight } from './PerformanceEntries';
import { LOADSHEET_FUEL_TANKS, TRIM_TANK_INDEX, armToPercentMac, percentMacToArm } from './Loadsheet';

/*
 * LOADSHEET fuel: the predicted fuel distribution after a refuel with the FQMS CG targeting (FUEL DISTR in CG TARGETING
 * mode), the ZFW/ZFCG it is computed with (REFUEL ZF DATA panel), and the automatic ground transfer that brings the
 * TOCG back within its limits or onto the refuel target (MORE panel). Weights in kg, CGs in % MAC.
 */

/** The ZFW and ZFCG the FQMS distributes the refuel with */
export interface RefuelZfData {
  /** kg */
  readonly zfw: number;
  /** % MAC */
  readonly zfcg: number;
}

/** The buttons of the REFUEL ZF DATA panel: which ZFW/ZFCG the predicted fuel distribution uses */
export type RefuelZfSource = 'fqmsDefault' | 'newSet' | 'loadsheet';

/** The ZFW/ZFCG the FQMS refuels with when nobody entered any (FQMS DEFAULT) */
export const FQMS_DEFAULT_REFUEL_ZF: RefuelZfData = { zfw: 621_704 * KG_PER_LB, zfcg: 36.5 };

/** The NEW SET OF DATA entries of the REFUEL ZF DATA panel; null for an empty field */
export interface RefuelZfEntries {
  readonly zfw: number | null;
  readonly zfcg: number | null;
}

/**
 * The ZFW and ZFCG the REFUEL ZF DATA panel shows: the entries one by one in NEW SET OF DATA, else the values of the
 * button.
 * @param source the button selected
 * @param newSet the NEW SET OF DATA entries
 * @param loading the ZFW/ZFCG of the loading entries, null while they are incomplete
 * @returns the values of the two fields
 */
export function refuelZfFields(
  source: RefuelZfSource,
  newSet: RefuelZfEntries,
  loading: RefuelZfData | null,
): RefuelZfEntries {
  if (source === 'newSet') {
    return newSet;
  }
  const data = source === 'fqmsDefault' ? FQMS_DEFAULT_REFUEL_ZF : loading;
  return { zfw: data?.zfw ?? null, zfcg: data?.zfcg ?? null };
}

/**
 * @param source the button selected
 * @param newSet the NEW SET OF DATA entries
 * @param loading the ZFW/ZFCG of the loading entries, null while they are incomplete
 * @returns the ZFW/ZFCG of the predicted fuel distribution, null while one of them is missing
 */
export function refuelZfData(
  source: RefuelZfSource,
  newSet: RefuelZfEntries,
  loading: RefuelZfData | null,
): RefuelZfData | null {
  const { zfw, zfcg } = refuelZfFields(source, newSet, loading);
  return zfw !== null && zfcg !== null ? { zfw, zfcg } : null;
}

/** The ground CG target of the refuel and of the automatic ground transfer, % MAC */
export const GROUND_CG_TARGET = 39.5;

/** Below this preselected fuel the FQMS does not target the CG: the trim tank stays empty, kg */
const CG_TARGETING_MINIMUM_FUEL = 103_617 * KG_PER_LB;

const LITRES_PER_US_GALLON = 3.785411784;

/**
 * The wing refuel distribution of the FQMS: the fuel of each wing tank (lb) for a total wing quantity (lb), in rows of
 * total, feed tanks 1 and 4, feed tanks 2 and 3, outer tanks, mid tanks, inner tanks.
 */
const WING_REFUEL_DISTRIBUTION_LB: readonly (readonly [number, number, number, number, number, number])[] = [
  [0, 0, 0, 0, 0, 0],
  [39_700, 9_900, 9_900, 0, 0, 0],
  [57_300, 9_900, 9_900, 8_800, 0, 0],
  [79_350, 15_450, 15_450, 8_800, 0, 0],
  [103_600, 15_450, 15_450, 8_800, 0, 12_150],
  [228_813, 45_323, 48_140, 8_800, 0, 12_150],
  [348_423, 45_323, 48_140, 8_800, 59_805, 12_150],
  [475_541, 45_323, 48_140, 8_800, 59_805, 75_685],
  [491_824, 45_323, 48_140, 16_960, 59_805, 75_685],
  [590_318, 54_399, 57_780, 20_355, 71_782, 90_841],
];

/** The tanks of each column of WING_REFUEL_DISTRIBUTION_LB, as indices of LOADSHEET_FUEL_TANKS */
const WING_COLUMN_TANKS: readonly (readonly number[])[] = [
  [1, 8],
  [4, 5],
  [0, 9],
  [2, 7],
  [3, 6],
];

/** The wing tank of the automatic ground transfer: the FQMS moves the fuel between the trim tank and the inner tanks */
const GROUND_TRANSFER_WING_TANK = 3;

/**
 * @param density the fuel density, kg/l
 * @returns the capacity of each tank, kg
 */
export function tankCapacities(density: number): number[] {
  return LOADSHEET_FUEL_TANKS.map((tank) => tank.gallons * LITRES_PER_US_GALLON * density);
}

/**
 * The wing refuel distribution of a wing fuel quantity: the FQMS table interpolated between its rows, then scaled to
 * the quantity (the table totals are rounded) and kept within the tank capacities.
 * @param wingFuel the fuel for the wing tanks, kg
 * @param capacities the tank capacities, kg
 * @returns the fuel of each tank, kg, the trim tank empty
 */
export function wingRefuelDistribution(wingFuel: number, capacities: readonly number[]): number[] {
  const lb = Math.max(0, wingFuel) / KG_PER_LB;
  const rows = WING_REFUEL_DISTRIBUTION_LB;
  let upper = 1;
  while (upper < rows.length - 1 && rows[upper][0] < lb) {
    upper++;
  }
  const low = rows[upper - 1];
  const high = rows[upper];
  const ratio = Math.min(1, (lb - low[0]) / (high[0] - low[0]));
  const distribution = LOADSHEET_FUEL_TANKS.map(() => 0);
  WING_COLUMN_TANKS.forEach((tanks, column) => {
    const tankLb = low[column + 1] + ratio * (high[column + 1] - low[column + 1]);
    for (const tank of tanks) {
      distribution[tank] = tankLb * KG_PER_LB;
    }
  });
  const total = distribution.reduce((sum, kg) => sum + kg, 0);
  const scale = total > 0 ? Math.max(0, wingFuel) / total : 0;
  return distribution.map((kg, tank) => Math.min(kg * scale, capacities[tank]));
}

/**
 * @param zeroFuel the ZFW and ZFCG
 * @param distribution the fuel of each tank, kg
 * @returns the gross weight CG, % MAC
 */
export function grossWeightCg(zeroFuel: RefuelZfData, distribution: readonly number[]): number {
  let weight = zeroFuel.zfw;
  let moment = zeroFuel.zfw * percentMacToArm(zeroFuel.zfcg);
  distribution.forEach((kg, tank) => {
    weight += kg;
    moment += kg * LOADSHEET_FUEL_TANKS[tank].arm;
  });
  return armToPercentMac(moment / weight);
}

/**
 * The predicted fuel distribution after a refuel to the FOB with the FQMS CG targeting: the trim tank takes the fuel
 * that puts the gross weight CG on the ground CG target, within its capacity, the wing tanks the rest. Below the CG
 * targeting minimum fuel the trim tank stays empty.
 * Design choice: the trim tank quantity is solved for the target directly, the principle of the FQMS logic.
 * @param fob the fuel on board, kg
 * @param zeroFuel the ZFW/ZFCG of the refuel (REFUEL ZF DATA)
 * @param density the fuel density, kg/l
 * @returns the fuel of each tank, kg
 */
export function cgTargetingDistribution(fob: number, zeroFuel: RefuelZfData, density: number): number[] {
  const capacities = tankCapacities(density);
  const wingCapacity = capacities.reduce((sum, kg, tank) => (tank === TRIM_TANK_INDEX ? sum : sum + kg), 0);
  const withTrim = (trim: number) => {
    const distribution = wingRefuelDistribution(fob - trim, capacities);
    distribution[TRIM_TANK_INDEX] = trim;
    return distribution;
  };
  const minTrim = Math.min(Math.max(0, fob - wingCapacity), capacities[TRIM_TANK_INDEX]);
  if (fob < CG_TARGETING_MINIMUM_FUEL) {
    return withTrim(minTrim);
  }
  let low = minTrim;
  let high = Math.max(minTrim, Math.min(capacities[TRIM_TANK_INDEX], fob));
  if (grossWeightCg(zeroFuel, withTrim(low)) >= GROUND_CG_TARGET) {
    return withTrim(low);
  }
  if (grossWeightCg(zeroFuel, withTrim(high)) <= GROUND_CG_TARGET) {
    return withTrim(high);
  }
  for (let i = 0; i < 40; i++) {
    const middle = (low + high) / 2;
    if (grossWeightCg(zeroFuel, withTrim(middle)) < GROUND_CG_TARGET) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return withTrim((low + high) / 2);
}

/**
 * The takeoff CG limits at a weight, from the CG envelope check of the performance database.
 * @param weight the takeoff weight, kg
 * @param cgWithinLimits whether a CG is within the limits at a weight
 * @returns the forward and aft limits, % MAC, null when no CG is within the limits
 */
export function takeoffCgLimits(
  weight: number,
  cgWithinLimits: (cg: number, weight: number) => boolean,
): { readonly forward: number; readonly aft: number } | null {
  let inside: number | null = null;
  for (let cg = 20; cg <= 50; cg += 0.5) {
    if (cgWithinLimits(cg, weight)) {
      inside = cg;
      break;
    }
  }
  if (inside === null) {
    return null;
  }
  const edge = (outside: number) => {
    let a = inside!;
    let b = outside;
    for (let i = 0; i < 30; i++) {
      const middle = (a + b) / 2;
      if (cgWithinLimits(middle, weight)) {
        a = middle;
      } else {
        b = middle;
      }
    }
    return a;
  };
  return { forward: edge(10), aft: edge(60) };
}

/** A fuel transfer of the automatic ground transfer: positive from the wing tanks to the trim tank, kg */
export interface GroundTransfer {
  readonly transfer: number;
  /** The trim tank quantity after the transfer, kg */
  readonly trimTankQuantity: number;
  /** The fuel available in the tanks permits the transfer */
  readonly achievable: boolean;
}

/** The MORE panel: the TOCG against its limits and the automatic ground transfers */
export interface GroundTransferAdvice {
  /** The TOCG is forward or aft of the takeoff limits, null within them */
  readonly outOfLimits: 'FWD' | 'AFT' | null;
  /** The limit the TOCG is out of, % MAC, null within the limits */
  readonly limit: number | null;
  /** The transfer that brings the TOCG onto that limit, null within the limits */
  readonly toLimit: GroundTransfer | null;
  /** The transfer that brings the gross weight CG onto the ground CG target */
  readonly toTarget: GroundTransfer;
  /** The TOCG after the transfer to the target, % MAC */
  readonly optimizedTowCg: number;
}

/**
 * The automatic ground transfers of the MORE panel. The fuel moves between the trim tank and the inner tanks.
 * @param zeroFuel the ZFW/ZFCG of the loading
 * @param distribution the predicted fuel of each tank, kg
 * @param tow the takeoff weight, kg
 * @param towCg the TOCG, % MAC
 * @param limits the takeoff CG limits at the TOW, null when not known
 * @param density the fuel density, kg/l
 * @returns the advice
 */
export function groundTransferAdvice(
  zeroFuel: RefuelZfData,
  distribution: readonly number[],
  tow: number,
  towCg: number,
  limits: { readonly forward: number; readonly aft: number } | null,
  density: number,
): GroundTransferAdvice {
  const capacities = tankCapacities(density);
  const trimArm = LOADSHEET_FUEL_TANKS[TRIM_TANK_INDEX].arm;
  const wingArm = LOADSHEET_FUEL_TANKS[GROUND_TRANSFER_WING_TANK].arm;
  const trim = distribution[TRIM_TANK_INDEX];
  const innerTanks = WING_COLUMN_TANKS[4];
  const innerFuel = innerTanks.reduce((sum, tank) => sum + distribution[tank], 0);
  const innerRoom = innerTanks.reduce((sum, tank) => sum + capacities[tank] - distribution[tank], 0);
  // The fuel to move for a CG at a weight: each kg into the trim tank moves the moment by the arm difference
  const transferFor = (weight: number, cgNow: number, cgWanted: number): GroundTransfer => {
    const transfer = (weight * (percentMacToArm(cgWanted) - percentMacToArm(cgNow))) / (trimArm - wingArm);
    const achievable =
      transfer >= 0
        ? transfer <= capacities[TRIM_TANK_INDEX] - trim && transfer <= innerFuel
        : -transfer <= trim && -transfer <= innerRoom;
    return { transfer, trimTankQuantity: trim + transfer, achievable };
  };

  let outOfLimits: 'FWD' | 'AFT' | null = null;
  let limit: number | null = null;
  if (limits !== null && towCg < limits.forward) {
    outOfLimits = 'FWD';
    limit = limits.forward;
  } else if (limits !== null && towCg > limits.aft) {
    outOfLimits = 'AFT';
    limit = limits.aft;
  }

  const fuel = distribution.reduce((sum, kg) => sum + kg, 0);
  const toTarget = transferFor(zeroFuel.zfw + fuel, grossWeightCg(zeroFuel, distribution), GROUND_CG_TARGET);
  const optimizedTowCg = armToPercentMac(
    (tow * percentMacToArm(towCg) + toTarget.transfer * (trimArm - wingArm)) / tow,
  );
  return {
    outOfLimits,
    limit,
    toLimit: limit !== null ? transferFor(tow, towCg, limit) : null,
    toTarget,
    optimizedTowCg,
  };
}

/** A line of the AGT information of the MORE panel; the warning lines are red */
export interface GroundTransferLine {
  readonly text: string;
  readonly warning: boolean;
}

/**
 * The AGT information of the MORE panel: the TOCG warning and the transfer to the limit when it is out of its limits,
 * and the transfer to the refuel target.
 * @param advice the ground transfer advice
 * @param towCg the TOCG, % MAC
 * @param metric whether the weights are in kg (else lb)
 * @returns the lines
 */
export function groundTransferLines(
  advice: GroundTransferAdvice,
  towCg: number,
  metric: boolean,
): GroundTransferLine[] {
  const weight = (kg: number) => `${formatWholeWeight(kg, metric)} ${metric ? 'kg' : 'lbs'}`;
  const transferLine = (transfer: GroundTransfer) => {
    if (Math.round(Math.abs(transfer.transfer)) === 0) {
      return 'No transfer needed.';
    }
    return transfer.transfer > 0
      ? `Transfer ${weight(transfer.transfer)} from wings to TRIM TK.`
      : `Transfer ${weight(-transfer.transfer)} from TRIM TK to wings.`;
  };
  const lines: GroundTransferLine[] = [];
  if (advice.outOfLimits !== null && advice.limit !== null && advice.toLimit !== null) {
    const fwd = advice.outOfLimits === 'FWD';
    lines.push(
      { text: `WARNING: TOCG out of the operational limits (too ${advice.outOfLimits}).`, warning: true },
      {
        text: `TOCG = ${towCg.toFixed(1)}% LIM ${advice.outOfLimits} = ${advice.limit.toFixed(1)}%`,
        warning: true,
      },
      { text: '', warning: false },
      { text: 'Perform Auto ground Transfer.', warning: false },
      { text: '', warning: false },
      { text: '- For CG back to the operational limit.', warning: false },
    );
    if (advice.toLimit.achievable) {
      lines.push(
        { text: `${fwd ? 'MIN' : 'MAX'} TRIM TK QTY = ${weight(advice.toLimit.trimTankQuantity)}.`, warning: false },
        { text: transferLine(advice.toLimit), warning: false },
      );
    } else {
      lines.push({ text: 'Not possible with the fuel in the tanks.', warning: true });
    }
    lines.push({ text: '', warning: false });
  }
  lines.push({ text: `- For optimized TOCG (${advice.optimizedTowCg.toFixed(1)}%):`, warning: false });
  if (advice.toTarget.achievable) {
    lines.push(
      { text: `Final TRIM TK QTY = ${weight(advice.toTarget.trimTankQuantity)}.`, warning: false },
      { text: transferLine(advice.toTarget), warning: false },
    );
  } else {
    lines.push({ text: 'Not possible with the fuel in the tanks.', warning: true });
  }
  return lines;
}
