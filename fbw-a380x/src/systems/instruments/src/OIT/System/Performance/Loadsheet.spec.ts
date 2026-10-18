// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  LOADSHEET_AIRCRAFT,
  LOADSHEET_DOCG,
  LOADSHEET_FUEL_TANKS,
  LoadsheetConfiguration,
  LoadsheetLoading,
  TRIM_TANK_INDEX,
  armToPercentMac,
  computeLoadsheet,
  fuelArm,
  loadsheetPrintout,
  loadsheetReportLines,
  ltsEditionAllowed,
  percentMacToArm,
  predictedFuelDistribution,
  takeoffThsText,
} from './Loadsheet';

const CONFIGURATION: LoadsheetConfiguration = {
  mtow: 510_000,
  mtowFromTakeoffPerf: false,
  mlw: 395_000,
  mlwFromLandingPerf: false,
};

const LOADING: LoadsheetLoading = {
  zfw: 360_000,
  zfcg: 36,
  fob: 140_000,
  tripFuel: 120_000,
  taxiFuel: 2_000,
  lmcPax: 0,
  lmcCargo: 0,
};

/** All the fuel in feed tank 2, forward of the MAC leading edge */
const FUEL_IN_FEED_2 = LOADSHEET_FUEL_TANKS.map((_, i) => (i === 4 ? 1 : 0));

const anyCg = () => true;

describe('LOADSHEET', () => {
  it('converts arms and % MAC', () => {
    expect(armToPercentMac(LOADSHEET_AIRCRAFT.leadingEdgeMac)).toBeCloseTo(0, 9);
    expect(armToPercentMac(LOADSHEET_AIRCRAFT.leadingEdgeMac - LOADSHEET_AIRCRAFT.macLength)).toBe(100);
    expect(percentMacToArm(armToPercentMac(-30))).toBeCloseTo(-30, 9);
    expect(LOADSHEET_DOCG).toBeCloseTo(36.2, 1);
  });

  it('adds the fuel to the ZFW, and moves the CG with the fuel moment', () => {
    const zfwArm = percentMacToArm(36);
    const tanks = LOADSHEET_FUEL_TANKS.map(() => 0);
    tanks[TRIM_TANK_INDEX] = 1;
    const fuelAtTrim = predictedFuelDistribution(140_000, tanks);
    expect(fuelArm(fuelAtTrim)).toBeCloseTo(LOADSHEET_FUEL_TANKS[TRIM_TANK_INDEX].arm, 9);

    const { results, errors } = computeLoadsheet(CONFIGURATION, LOADING, fuelAtTrim, 84, anyCg);
    expect(errors).toEqual([]);
    expect(results).toMatchObject({
      dow: LOADSHEET_AIRCRAFT.dow,
      payload: 360_000 - LOADSHEET_AIRCRAFT.dow,
      zfw: 360_000,
      zfcg: 36,
      takeoffFuel: 138_000,
      tow: 498_000,
      tripFuel: 120_000,
      lw: 378_000,
    });
    const trimArm = LOADSHEET_FUEL_TANKS[TRIM_TANK_INDEX].arm;
    expect(results!.towCg).toBeCloseTo(armToPercentMac((360_000 * zfwArm + 138_000 * trimArm) / 498_000), 9);
    expect(results!.lwCg).toBeCloseTo(armToPercentMac((360_000 * zfwArm + 18_000 * trimArm) / 378_000), 9);
    // Fuel aft of the ZFW CG moves the CG aft
    expect(results!.towCg).toBeGreaterThan(results!.lwCg);
    expect(results!.lwCg).toBeGreaterThan(36);
  });

  it('gives the underload and the weight that limits it', () => {
    const { results } = computeLoadsheet(CONFIGURATION, LOADING, FUEL_IN_FEED_2, 84, anyCg);
    // ZFW 13 t, TOW 12 t, LW 17 t below their maximum
    expect(results?.underload).toBe(12_000);
    expect(results?.limitedBy).toBe('TOW');
    const overload = computeLoadsheet({ ...CONFIGURATION, mlw: 370_000 }, LOADING, FUEL_IN_FEED_2, 84, anyCg).results!;
    expect(overload.underload).toBe(-8_000);
    expect(overload.limitedBy).toBe('LW');
    expect(overload.lwOutOfLimits).toBe(true);
    expect(ltsEditionAllowed(overload)).toBe(false);
    expect(ltsEditionAllowed(results!)).toBe(true);
  });

  it('adds a total LMC to the weights only', () => {
    const { results } = computeLoadsheet(
      CONFIGURATION,
      { ...LOADING, lmcPax: 10, lmcCargo: 500 },
      FUEL_IN_FEED_2,
      84,
      anyCg,
    );
    expect(results?.lmcWeight).toBe(1_340);
    expect(results?.zfw).toBe(361_340);
    expect(results?.zfcg).toBe(36);
  });

  it('blocks LTS EDITION with a CG out of the envelope', () => {
    const { results } = computeLoadsheet(CONFIGURATION, LOADING, FUEL_IN_FEED_2, 84, (cg) => cg < 30);
    expect(results?.zfwOutOfLimits).toBe(true);
    expect(ltsEditionAllowed(results!)).toBe(false);
  });

  it('lists the missing entries and the inconsistent fuel', () => {
    expect(computeLoadsheet(CONFIGURATION, { ...LOADING, zfw: null, tripFuel: null }, [], 84, anyCg).errors).toEqual([
      'Missing parameter ZFW',
      'Missing parameter TRIP FUEL',
    ]);
    expect(computeLoadsheet(CONFIGURATION, { ...LOADING, tripFuel: 139_000 }, [], 84, anyCg).errors).toEqual([
      'TRIP FUEL above T.O FUEL',
    ]);
  });

  it('predicts the fuel in the proportions of the tanks, or of their capacities when empty', () => {
    const now = LOADSHEET_FUEL_TANKS.map((_, i) => (i === 1 || i === 8 ? 1000 : 0));
    const predicted = predictedFuelDistribution(10_000, now);
    expect(predicted[1]).toBe(5_000);
    expect(predicted[8]).toBe(5_000);
    const fromCapacities = predictedFuelDistribution(
      100_000,
      LOADSHEET_FUEL_TANKS.map(() => 0),
    );
    const totalGallons = LOADSHEET_FUEL_TANKS.reduce((sum, t) => sum + t.gallons, 0);
    expect(fromCapacities[TRIM_TANK_INDEX]).toBeCloseTo((100_000 * 6260.3) / totalGallons, 6);
  });

  it('gives the T.O THS for the TOW CG', () => {
    const results = computeLoadsheet(CONFIGURATION, { ...LOADING, zfcg: 34.5 }, FUEL_IN_FEED_2, 84, anyCg).results!;
    expect(takeoffThsText({ ...results, towCg: 34.5, takeoffThs: 4.68 })).toBe('T.O THS FOR 34.5% (4.7 UP)');
    expect(takeoffThsText({ ...results, towCg: 43, takeoffThs: -0.18 })).toBe('T.O THS FOR 43.0% (0.2 DN)');
    // The fuel forward of the MAC brings the TOW CG forward of the trim table: full nose up
    expect(results.towCg).toBeLessThan(29);
    expect(results.takeoffThs).toBe(5.8);
  });

  it('writes the loadsheet report', () => {
    const results = computeLoadsheet(CONFIGURATION, LOADING, FUEL_IN_FEED_2, 84, anyCg).results!;
    const lines = loadsheetReportLines(
      {
        checkedBy: 'BARKER',
        approvedBy: 'BROWNSON',
        captInfoNotes: ['NOTE 1', '', '', '', ''],
        crew: '2/24',
        paxPerType: '400/32/4',
        paxPerClass: '9/48/375',
        cargo: 20_000,
        status: 'FINAL',
      },
      { flightNumber: 'AIB406', registration: 'F-FBWA', from: 'LFBO', to: 'RJTT' },
      CONFIGURATION,
      results,
      new Date(Date.UTC(2026, 9, 17, 16, 33)),
      true,
    );
    expect(lines).toContain('LOADSHEET FINAL');
    expect(lines).toContain('ALL WEIGHTS IN KILOGRAMS');
    expect(lines).toContain('LFBO RJTT AIB406   F-FBWA   2/24   17OCT26  1633');
    expect(lines).toContain('TAKE OFF WEIGHT ACTUAL   498000 MAX 510000 L');
    expect(lines).toContain('LANDING WEIGHT ACTUAL    378000 MAX 395000');
    expect(lines).toContain('UNDERLOAD 12000 LIMITED BY TOW');
    expect(lines).toContain('NOTE 1');
    expect(lines.every((line) => line.length <= 64)).toBe(true);
  });

  it('writes the report without the string functions the sim browser lacks', () => {
    const results = computeLoadsheet(CONFIGURATION, LOADING, FUEL_IN_FEED_2, 84, anyCg).results!;
    const edition = {
      checkedBy: '',
      approvedBy: 'BROWNSON',
      captInfoNotes: ['', '', '', '', ''],
      crew: '',
      paxPerType: '400/32/4',
      paxPerClass: '',
      cargo: null,
      status: 'PRELIM' as const,
    };
    const flight = { flightNumber: 'AIB406', registration: 'F-FBWA', from: 'LFBO', to: 'RJTT' };
    const trimEnd = Object.getOwnPropertyDescriptor(String.prototype, 'trimEnd')!;
    const trimStart = Object.getOwnPropertyDescriptor(String.prototype, 'trimStart')!;
    // The sim browser is an old JavaScriptCore without the ES2019 string functions
    Reflect.deleteProperty(String.prototype, 'trimEnd');
    Reflect.deleteProperty(String.prototype, 'trimStart');
    try {
      const lines = loadsheetReportLines(edition, flight, CONFIGURATION, results, new Date(0), true);
      expect(lines).toContain('CHECKED');
      expect(lines).toContain('APPROVED BROWNSON');
      expect(lines).toContain('PASSENGER 400/32/4');
    } finally {
      Object.defineProperty(String.prototype, 'trimEnd', trimEnd);
      Object.defineProperty(String.prototype, 'trimStart', trimStart);
    }
  });
});

describe('LOADSHEET printout', () => {
  it('prints the report lines under its own title', () => {
    expect(loadsheetPrintout(['LOADSHEET FINAL', 'ZFW 300000'])).toEqual({
      title: 'LOADSHEET',
      text: 'LOADSHEET FINAL\nZFW 300000',
    });
  });
});
