// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  cgAtFwdLimitLines,
  cgLimitAt,
  CgOutOfRangeInputs,
  CgOutOfRangeMonitor,
  cgOutOfRangeLines,
  ExcessAftCgMonitor,
  excessAftCgLines,
  FLIGHT_FWD_CG_LIMIT,
  FUEL_CG_WEIGHT_PHASE_INHIBITION,
  FuelCgProcedureInputs,
  isCgAtFwdLimit,
  isCgDataDisagree,
  isOutsideTakeoffCgLimits,
  isWeightDataDisagree,
  TAKEOFF_AFT_CG_LIMIT,
  TAKEOFF_FWD_CG_LIMIT,
  TrimTankFeedSelector,
} from './FwsFuelCgWeightAlerts';

const KG_PER_LB = 0.45359237;

const procedure = (inputs: Partial<FuelCgProcedureInputs> = {}): FuelCgProcedureInputs => ({
  trimTankFeed: TrimTankFeedSelector.Auto,
  trimTankXfrAuto: true,
  outerTankXfrAuto: true,
  trimTankPumpAvailable: true,
  trimTankHoldsFuel: true,
  outerTanksHoldFuel: true,
  autoGroundTransferOn: false,
  trimTankColdFuel: false,
  ...inputs,
});

describe('A380X FUEL CG and weight alerts', () => {
  it('has the flight phase inhibitions', () => {
    const onlyPhase8 = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12];
    expect(FUEL_CG_WEIGHT_PHASE_INHIBITION.cgAtFwdLimit).toEqual(onlyPhase8);
    expect(FUEL_CG_WEIGHT_PHASE_INHIBITION.cgDataDisagree).toEqual(onlyPhase8);
    expect(FUEL_CG_WEIGHT_PHASE_INHIBITION.excessAftCg).toEqual(onlyPhase8);
    expect(FUEL_CG_WEIGHT_PHASE_INHIBITION.weightDataDisagree).toEqual(onlyPhase8);
    expect(FUEL_CG_WEIGHT_PHASE_INHIBITION.cgOutOfRange).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  describe('CG limits', () => {
    it('the limit lines go by increasing weight from 260 t to MTOW (560 t)', () => {
      for (const limit of [FLIGHT_FWD_CG_LIMIT, TAKEOFF_FWD_CG_LIMIT, TAKEOFF_AFT_CG_LIMIT]) {
        expect(limit[0].weightKg).toBe(260_000);
        expect(limit[limit.length - 1].weightKg).toBeCloseTo(560_000, -3);
        limit.slice(1).forEach((point, i) => expect(point.weightKg).toBeGreaterThan(limit[i].weightKg));
      }
    });

    it('interpolates and holds the end values', () => {
      expect(cgLimitAt(FLIGHT_FWD_CG_LIMIT, 200_000)).toBe(27.95);
      expect(cgLimitAt(FLIGHT_FWD_CG_LIMIT, 600_000)).toBe(36.73);
      expect(cgLimitAt(FLIGHT_FWD_CG_LIMIT, 444_400)).toBeCloseTo((30.9 + 33.23) / 2, 2);
    });

    it('the takeoff envelope is inside the flight envelope, about 29 % to 43 % MAC', () => {
      for (let weightKg = 260_000; weightKg <= 560_000; weightKg += 20_000) {
        expect(cgLimitAt(TAKEOFF_FWD_CG_LIMIT, weightKg)).toBeGreaterThan(cgLimitAt(FLIGHT_FWD_CG_LIMIT, weightKg));
        expect(cgLimitAt(TAKEOFF_AFT_CG_LIMIT, weightKg)).toBeLessThan(43.5);
      }
      expect(cgLimitAt(TAKEOFF_FWD_CG_LIMIT, 300_000)).toBeCloseTo(29, 0);
      expect(cgLimitAt(TAKEOFF_AFT_CG_LIMIT, 450_000)).toBeCloseTo(43, 0);
    });
  });

  it('CG AT FWD LIMIT: the FQMS CG forward of the flight forward limit', () => {
    expect(isCgAtFwdLimit({ grossWeightKg: 500_000, cgPercentMac: 34 })).toBe(true);
    expect(isCgAtFwdLimit({ grossWeightKg: 500_000, cgPercentMac: 36 })).toBe(false);
    expect(isCgAtFwdLimit({ grossWeightKg: 350_000, cgPercentMac: 28.5 })).toBe(false);
    expect(isCgAtFwdLimit({ grossWeightKg: null, cgPercentMac: 20 })).toBe(false);
  });

  describe('CG OUT OF RANGE', () => {
    const inputs = (overrides: Partial<CgOutOfRangeInputs> = {}): CgOutOfRangeInputs => ({
      engModeIgnStart: false,
      enginesRunning: 0,
      fqms: { grossWeightKg: 500_000, cgPercentMac: 44 },
      alternateGaugingCgPercentMac: 40,
      ...overrides,
    });

    it('triggers when the ENG MODE selector is set to IGN/START with the FQMS CG outside the takeoff limits', () => {
      const monitor = new CgOutOfRangeMonitor();
      expect(monitor.update(inputs()).active).toBe(false);
      const state = monitor.update(inputs({ engModeIgnStart: true }));
      expect(state).toEqual({ active: true, takeoffLimitsAtEngineStart: true, alternateCgAbove54: false });
      // Stays after the selector is back to NORM, until the CG is back inside (AUTO GND XFR)
      expect(monitor.update(inputs()).active).toBe(true);
      expect(monitor.update(inputs({ fqms: { grossWeightKg: 500_000, cgPercentMac: 39.5 } })).active).toBe(false);
      expect(monitor.update(inputs()).active).toBe(false);
    });

    it('does not trigger with the CG inside the takeoff limits', () => {
      const monitor = new CgOutOfRangeMonitor();
      const inside = { grossWeightKg: 500_000, cgPercentMac: 39 };
      expect(isOutsideTakeoffCgLimits(inside)).toBe(false);
      expect(monitor.update(inputs({ engModeIgnStart: true, fqms: inside })).active).toBe(false);
    });

    it('triggers with the alternate gauging CG above 54 % after the second engine start', () => {
      const monitor = new CgOutOfRangeMonitor();
      const inside = { grossWeightKg: 500_000, cgPercentMac: 39 };
      expect(monitor.update(inputs({ fqms: inside, enginesRunning: 1, alternateGaugingCgPercentMac: 55 })).active).toBe(
        false,
      );
      expect(monitor.update(inputs({ fqms: inside, enginesRunning: 2, alternateGaugingCgPercentMac: 55 }))).toEqual({
        active: true,
        takeoffLimitsAtEngineStart: false,
        alternateCgAbove54: true,
      });
    });

    it('lines: DELAY ENG START and AUTO GND XFR ON, or DELAY T.O', () => {
      const engineStart = { active: true, takeoffLimitsAtEngineStart: true, alternateCgAbove54: false };
      expect(cgOutOfRangeLines(engineStart, procedure({ autoGroundTransferOn: true }))).toEqual({
        show: [true, true, false],
        checked: [false, true, false],
      });
      const alternate = { active: true, takeoffLimitsAtEngineStart: false, alternateCgAbove54: true };
      expect(cgOutOfRangeLines(alternate, procedure()).show).toEqual([false, false, true]);
    });
  });

  describe('EXCESS AFT CG', () => {
    it('triggers above a WBBC CG of 50 % in automatic mode, and stays after TRIM TK XFR FWD', () => {
      const monitor = new ExcessAftCgMonitor();
      expect(monitor.update(49, true)).toBe(false);
      expect(monitor.update(51, false)).toBe(false);
      expect(monitor.update(51, true)).toBe(true);
      expect(monitor.update(51, false)).toBe(true);
      expect(monitor.update(49, false)).toBe(false);
      expect(monitor.update(null, true)).toBe(false);
    });

    it('lines: TRIM TK FEED AUTO if isolated, TRIM TK XFR FWD, then OUTR TK XFR MAN', () => {
      const isolated = excessAftCgLines(procedure({ trimTankFeed: TrimTankFeedSelector.Isol }));
      expect(isolated.show.slice(0, 2)).toEqual([true, true]);
      expect(isolated.checked.slice(0, 2)).toEqual([false, false]);
      const fwd = excessAftCgLines(procedure({ trimTankXfrAuto: false, outerTankXfrAuto: false }));
      expect(fwd.show).toEqual([false, true, true, true, true, true, true, true, true, true, false, false]);
      expect(fwd.checked[1]).toBe(true);
      expect(fwd.checked[9]).toBe(true);
      const trimEmpty = excessAftCgLines(procedure({ trimTankHoldsFuel: false }));
      expect(trimEmpty.show).toEqual([
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        true,
      ]);
    });
  });

  it('CG AT FWD LIMIT lines: pumped or gravity forward transfer, under IF NO TRIM TK COLD FUEL', () => {
    const pumped = cgAtFwdLimitLines(procedure({ trimTankFeed: TrimTankFeedSelector.Isol }));
    expect(pumped.show).toEqual([true, true, true, true, true, true, false, false]);
    expect(pumped.checked.slice(0, 3)).toEqual([true, true, true]);
    const gravity = cgAtFwdLimitLines(procedure({ trimTankPumpAvailable: false, trimTankColdFuel: true }));
    expect(gravity.show).toEqual([true, true, true, true, false, false, true, true]);
    expect(gravity.checked[0]).toBe(false);
  });

  it('CG DATA DISAGREE above 8 % MAC between the FQMS and the WBBC', () => {
    expect(isCgDataDisagree({ grossWeightKg: 1, cgPercentMac: 30 }, { grossWeightKg: 1, cgPercentMac: 38.5 })).toBe(
      true,
    );
    expect(isCgDataDisagree({ grossWeightKg: 1, cgPercentMac: 30 }, { grossWeightKg: 1, cgPercentMac: 37.5 })).toBe(
      false,
    );
    expect(isCgDataDisagree({ grossWeightKg: 1, cgPercentMac: 30 }, { grossWeightKg: 1, cgPercentMac: null })).toBe(
      false,
    );
  });

  it('WEIGHT DATA DISAGREE above 198 400 lb between the FQMS and the WBBC', () => {
    const wbbc = { grossWeightKg: 450_000, cgPercentMac: null };
    expect(isWeightDataDisagree({ grossWeightKg: 450_000 + 198_500 * KG_PER_LB, cgPercentMac: 38 }, wbbc)).toBe(true);
    expect(isWeightDataDisagree({ grossWeightKg: 450_000 - 198_300 * KG_PER_LB, cgPercentMac: 38 }, wbbc)).toBe(false);
    expect(isWeightDataDisagree({ grossWeightKg: 100_000, cgPercentMac: 38 }, { ...wbbc, grossWeightKg: null })).toBe(
      false,
    );
  });
});
