// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import PitchTrimUtils from '@shared/PitchTrimUtils';
import { AocPrintout } from '@shared/AocPrintout';
import { KG_PER_LB, missingParameterErrors } from './PerformanceEntries';

/*
 * LOADSHEET in REDUCED mode: the ZFW/CG (computed by the ground) and the fuel give the TOW/CG and the LW/CG, the
 * underload, the T.O THS and the loadsheet report (LTS EDITION). The weights are in kg, the CGs in % MAC.
 */

/** The aircraft data of the loadsheet: the FBW A380X airframe (the weight and balance of its systems) */
export const LOADSHEET_AIRCRAFT = {
  /** Dry operating weight, kg */
  dow: 300_007,
  /** Arm of the dry operating weight, feet forward of the reference datum */
  dowArm: 6.47,
  /** Leading edge of the mean aerodynamic chord, feet forward of the reference datum */
  leadingEdgeMac: 21.09,
  /** Length of the mean aerodynamic chord, feet */
  macLength: 40.35,
  /** Maximum structural zero fuel weight, kg */
  mzfw: 373_000,
  /** Standard fuel density, kg/l */
  standardDensity: 0.785,
} as const;

/** The fuel tanks of the A380: arm (feet forward of the reference datum) and capacity (US gallons), tank 1 to 11 */
export const LOADSHEET_FUEL_TANKS: readonly {
  readonly name: string;
  readonly arm: number;
  readonly gallons: number;
}[] = [
  { name: 'LEFT OUTER', arm: -25, gallons: 2731.5 },
  { name: 'FEED 1', arm: -7.45, gallons: 7299.6 },
  { name: 'LEFT MID', arm: 7.1, gallons: 9632 },
  { name: 'LEFT INNER', arm: 16.5, gallons: 12189.4 },
  { name: 'FEED 2', arm: 27.3, gallons: 7753.2 },
  { name: 'FEED 3', arm: 27.3, gallons: 7753.2 },
  { name: 'RIGHT INNER', arm: 16.5, gallons: 12189.4 },
  { name: 'RIGHT MID', arm: 7.1, gallons: 9632 },
  { name: 'FEED 4', arm: -7.45, gallons: 7299.6 },
  { name: 'RIGHT OUTER', arm: -25, gallons: 2731.5 },
  { name: 'TRIM', arm: -87.14, gallons: 6260.3 },
];

/** The index of the trim tank in LOADSHEET_FUEL_TANKS */
export const TRIM_TANK_INDEX = 10;

/**
 * @param arm an arm in feet forward of the reference datum
 * @returns the position in % of the mean aerodynamic chord
 */
export function armToPercentMac(arm: number): number {
  return (-100 * (arm - LOADSHEET_AIRCRAFT.leadingEdgeMac)) / LOADSHEET_AIRCRAFT.macLength;
}

/**
 * @param percentMac a position in % MAC
 * @returns the arm in feet forward of the reference datum
 */
export function percentMacToArm(percentMac: number): number {
  return LOADSHEET_AIRCRAFT.leadingEdgeMac - (percentMac * LOADSHEET_AIRCRAFT.macLength) / 100;
}

/** DOCG of the default DOW, % MAC */
export const LOADSHEET_DOCG = armToPercentMac(LOADSHEET_AIRCRAFT.dowArm);

/**
 * The predicted fuel distribution after refuelling (FUEL DISTR panel).
 *
 * Design choice: the FQMS CG targeting logic is not modelled; the predicted distribution keeps the proportions of the
 * fuel now in the tanks (the distribution of the last refuelling), or the proportions of the tank capacities when the
 * tanks are empty.
 * @param fob the fuel on board of the loadsheet, kg
 * @param tankFuel the fuel in each tank now, kg, in the order of LOADSHEET_FUEL_TANKS
 * @returns the predicted fuel in each tank, kg
 */
export function predictedFuelDistribution(fob: number, tankFuel: readonly number[]): number[] {
  const total = tankFuel.reduce((sum, kg) => sum + Math.max(0, kg), 0);
  const weights = total > 0 ? tankFuel.map((kg) => Math.max(0, kg)) : LOADSHEET_FUEL_TANKS.map((tank) => tank.gallons);
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  return weights.map((w) => (fob * w) / weightSum);
}

/**
 * @param distribution the fuel in each tank, kg
 * @returns the arm of the fuel, feet forward of the reference datum
 */
export function fuelArm(distribution: readonly number[]): number {
  const total = distribution.reduce((sum, kg) => sum + kg, 0);
  if (total <= 0) {
    return 0;
  }
  return distribution.reduce((sum, kg, i) => sum + kg * LOADSHEET_FUEL_TANKS[i].arm, 0) / total;
}

/** The CONFIGURATION panel: the weight limits of the flight */
export interface LoadsheetConfiguration {
  /** kg */
  readonly mtow: number;
  /** The MTOW is the MTOW(perf) of T.O PERF (yellow) */
  readonly mtowFromTakeoffPerf: boolean;
  /** kg */
  readonly mlw: number;
  /** The MLW is the MLW(perf) of LDG PERF (yellow) */
  readonly mlwFromLandingPerf: boolean;
}

/** The LOADING panel and the LMC; null for an empty field */
export interface LoadsheetLoading {
  /** kg */
  readonly zfw: number | null;
  /** % MAC */
  readonly zfcg: number | null;
  /** Fuel on board, kg */
  readonly fob: number | null;
  /** kg */
  readonly tripFuel: number | null;
  /** kg */
  readonly taxiFuel: number;
  /** Last minute changes as a total: passengers (may be negative) and cargo weight in kg */
  readonly lmcPax: number;
  readonly lmcCargo: number;
}

export type LoadsheetLimitedBy = 'ZFW' | 'TOW' | 'LW';

/** The RESULTS panel */
export interface LoadsheetResults {
  readonly dow: number;
  readonly docg: number;
  readonly payload: number;
  readonly zfw: number;
  readonly zfcg: number;
  readonly takeoffFuel: number;
  readonly tow: number;
  readonly towCg: number;
  readonly tripFuel: number;
  readonly lw: number;
  readonly lwCg: number;
  /** The weight of the LMC, kg */
  readonly lmcWeight: number;
  /** T.O THS FOR the TOW CG, degrees, positive nose up */
  readonly takeoffThs: number;
  /** Underload (negative: overload), kg, and the weight that limits it */
  readonly underload: number;
  readonly limitedBy: LoadsheetLimitedBy;
  /** The weights and CGs out of their limits (red); LTS EDITION is then blocked */
  readonly zfwOutOfLimits: boolean;
  readonly towOutOfLimits: boolean;
  readonly lwOutOfLimits: boolean;
}

export interface LoadsheetComputation {
  readonly results: LoadsheetResults | null;
  readonly errors: string[];
}

/**
 * @param loading the LOADING panel
 * @returns the names of the missing parameters of the ERROR list
 */
export function missingLoadsheetParameters(loading: LoadsheetLoading): string[] {
  const missing: string[] = [];
  if (loading.zfw === null) {
    missing.push('ZFW');
  }
  if (loading.zfcg === null) {
    missing.push('ZFCG');
  }
  if (loading.fob === null) {
    missing.push('FOB');
  }
  if (loading.tripFuel === null) {
    missing.push('TRIP FUEL');
  }
  return missing;
}

/**
 * Computes the loadsheet.
 *
 * Design choice: the trip fuel is burnt at the arm of the takeoff fuel (the in-flight fuel transfers are not
 * modelled), so the LW CG is an estimate.
 * @param configuration the CONFIGURATION panel
 * @param loading the LOADING panel and the LMC
 * @param fuelDistribution the predicted fuel distribution of the FOB, kg per tank
 * @param perPaxWeight the passenger weight of the LMC, kg
 * @param cgWithinLimits the CG envelope: whether a CG is within the limits at a weight
 * @returns the results, or the errors of the ERROR list
 */
export function computeLoadsheet(
  configuration: LoadsheetConfiguration,
  loading: LoadsheetLoading,
  fuelDistribution: readonly number[],
  perPaxWeight: number,
  cgWithinLimits: (cg: number, weight: number) => boolean,
): LoadsheetComputation {
  const missing = missingLoadsheetParameters(loading);
  if (missing.length > 0) {
    return { results: null, errors: missingParameterErrors(missing) };
  }
  const fob = loading.fob!;
  const tripFuel = loading.tripFuel!;
  const errors: string[] = [];
  if (loading.taxiFuel > fob) {
    errors.push('TAXI FUEL above FOB');
  }
  if (tripFuel > fob - loading.taxiFuel) {
    errors.push('TRIP FUEL above T.O FUEL');
  }
  // A total LMC changes the weights only, not the CGs
  const lmcWeight = loading.lmcPax * perPaxWeight + loading.lmcCargo;
  const zfw = loading.zfw! + lmcWeight;
  if (zfw < LOADSHEET_AIRCRAFT.dow) {
    errors.push('ZFW below DOW');
  }
  if (errors.length > 0) {
    return { results: null, errors };
  }

  const zfcg = loading.zfcg!;
  const zfwMoment = zfw * percentMacToArm(zfcg);
  const arm = fuelArm(fuelDistribution);
  const takeoffFuel = fob - loading.taxiFuel;
  const tow = zfw + takeoffFuel;
  const towCg = armToPercentMac((zfwMoment + takeoffFuel * arm) / tow);
  const landingFuel = takeoffFuel - tripFuel;
  const lw = zfw + landingFuel;
  const lwCg = armToPercentMac((zfwMoment + landingFuel * arm) / lw);

  const margins: [LoadsheetLimitedBy, number][] = [
    ['ZFW', LOADSHEET_AIRCRAFT.mzfw - zfw],
    ['TOW', configuration.mtow - tow],
    ['LW', configuration.mlw - lw],
  ];
  const limiting = margins.reduce((min, m) => (m[1] < min[1] ? m : min));

  return {
    results: {
      dow: LOADSHEET_AIRCRAFT.dow,
      docg: LOADSHEET_DOCG,
      payload: zfw - LOADSHEET_AIRCRAFT.dow,
      zfw,
      zfcg,
      takeoffFuel,
      tow,
      towCg,
      tripFuel,
      lw,
      lwCg,
      lmcWeight,
      takeoffThs: PitchTrimUtils.cgToPitchTrim(towCg),
      underload: limiting[1],
      limitedBy: limiting[0],
      zfwOutOfLimits: zfw > LOADSHEET_AIRCRAFT.mzfw || !cgWithinLimits(zfcg, zfw),
      towOutOfLimits: tow > configuration.mtow || !cgWithinLimits(towCg, tow),
      lwOutOfLimits: lw > configuration.mlw || !cgWithinLimits(lwCg, lw),
    },
    errors: [],
  };
}

/**
 * @param results the loadsheet results
 * @returns whether LTS EDITION can be opened: every weight and CG within its limits
 */
export function ltsEditionAllowed(results: LoadsheetResults | null): boolean {
  return results !== null && !results.zfwOutOfLimits && !results.towOutOfLimits && !results.lwOutOfLimits;
}

/**
 * @param results the loadsheet results
 * @returns the T.O THS line of the RESULTS panel, e.g. T.O THS FOR 39.5% (1.8 UP)
 */
export function takeoffThsText(results: LoadsheetResults): string {
  const ths = Math.round(results.takeoffThs * 10) / 10;
  return `T.O THS FOR ${results.towCg.toFixed(1)}% (${Math.abs(ths).toFixed(1)} ${ths >= 0 ? 'UP' : 'DN'})`;
}

/** LTS EDITION: the additional entries of the report */
export interface LtsEdition {
  readonly checkedBy: string;
  readonly approvedBy: string;
  /** Up to 5 lines */
  readonly captInfoNotes: readonly string[];
  readonly crew: string;
  readonly paxPerType: string;
  readonly paxPerClass: string;
  /** The cargo weight to show on the report, kg, or null */
  readonly cargo: number | null;
  readonly status: 'PRELIM' | 'FINAL';
}

/** The flight of the report, from FLT OPS STS */
export interface LtsFlight {
  readonly flightNumber: string;
  readonly registration: string;
  readonly from: string;
  readonly to: string;
}

/** The CAPT INFO NOTES have up to 5 lines */
export const LTS_CAPT_INFO_NOTES_LINES = 5;

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * @param text a report line
 * @returns the line without its trailing spaces (String.prototype.trimEnd is missing in the sim browser)
 */
function withoutTrailingSpaces(text: string): string {
  return text.replace(/\s+$/, '');
}

/**
 * The reduced loadsheet (ACARS loadsheet layout): the weights of the results, the actual and maximum weights, the
 * CGs, the LMC and the notes of the captain.
 * @param edition the LTS EDITION entries
 * @param flight the flight of FLT OPS STS
 * @param configuration the CONFIGURATION panel
 * @param results the loadsheet results
 * @param date the date of the report (UTC)
 * @param metric whether the weights are in kg (else lb)
 * @returns the report lines
 */
export function loadsheetReportLines(
  edition: LtsEdition,
  flight: LtsFlight,
  configuration: LoadsheetConfiguration,
  results: LoadsheetResults,
  date: Date,
  metric: boolean,
): string[] {
  const weight = (kg: number) => Math.round(metric ? kg : kg / KG_PER_LB).toFixed(0);
  const column = (label: string, value: string) => `${label.padEnd(24)}${value.padStart(7)}`;
  const limit = (by: LoadsheetLimitedBy) => (results.limitedBy === by ? ' L' : '');
  const day = date.getUTCDate().toString().padStart(2, '0');
  const dateText = `${day}${MONTHS[date.getUTCMonth()]}${(date.getUTCFullYear() % 100).toString().padStart(2, '0')}`;
  const time = `${date.getUTCHours().toString().padStart(2, '0')}${date.getUTCMinutes().toString().padStart(2, '0')}`;

  const lines = [
    `LOADSHEET ${edition.status}`,
    `ALL WEIGHTS IN ${metric ? 'KILOGRAMS' : 'POUNDS'}`,
    withoutTrailingSpaces(`CHECKED ${edition.checkedBy}`),
    withoutTrailingSpaces(`APPROVED ${edition.approvedBy}`),
    '',
    'FROM/TO   FLIGHT   A/C REG  CREW   DATE     TIME',
    `${flight.from.padEnd(4)} ${flight.to.padEnd(4)} ${flight.flightNumber.padEnd(8)} ${flight.registration.padEnd(8)} ${edition.crew.padEnd(6)} ${dateText}  ${time}`,
    '',
  ];
  if (edition.cargo !== null) {
    lines.push(column('LOAD IN COMPARTMENTS', weight(edition.cargo)));
  }
  if (edition.paxPerType !== '' || edition.paxPerClass !== '') {
    lines.push(withoutTrailingSpaces(`PASSENGER ${edition.paxPerType} ${edition.paxPerClass}`));
  }
  lines.push(
    '*'.repeat(48),
    column('TOTAL TRAFFIC LOAD', weight(results.payload)),
    column('DRY OPERATING WEIGHT', weight(results.dow)),
    `${column('ZERO FUEL WEIGHT ACTUAL', weight(results.zfw))} MAX ${weight(LOADSHEET_AIRCRAFT.mzfw)}${limit('ZFW')}`,
    column('TAKE OFF FUEL', weight(results.takeoffFuel)),
    `${column('TAKE OFF WEIGHT ACTUAL', weight(results.tow))} MAX ${weight(configuration.mtow)}${limit('TOW')}`,
    column('TRIP FUEL', weight(results.tripFuel)),
    `${column('LANDING WEIGHT ACTUAL', weight(results.lw))} MAX ${weight(configuration.mlw)}${limit('LW')}`,
    '',
    `${results.underload >= 0 ? 'UNDERLOAD' : 'OVERLOAD'} ${weight(Math.abs(results.underload))} LIMITED BY ${results.limitedBy}`,
    '',
    `DOCG ${results.docg.toFixed(1)}  ZFCG ${results.zfcg.toFixed(1)}  TOCG ${results.towCg.toFixed(1)}  LWCG ${results.lwCg.toFixed(1)}`,
    takeoffThsText(results),
  );
  if (results.lmcWeight !== 0) {
    lines.push('', `LMC TOTAL ${results.lmcWeight > 0 ? '+' : '-'}${weight(Math.abs(results.lmcWeight))}`);
  }
  const notes = edition.captInfoNotes.filter((line) => line.trim() !== '');
  if (notes.length > 0) {
    lines.push('', 'CAPT INFO NOTES', ...notes);
  }
  lines.push('', 'END');
  return lines;
}

/**
 * PRINT of the loadsheet on the pedestal printer, under its own title.
 * @param reportLines the report lines
 * @returns the printout
 */
export function loadsheetPrintout(reportLines: readonly string[]): AocPrintout {
  return { title: 'LOADSHEET', text: reportLines.join('\n') };
}
