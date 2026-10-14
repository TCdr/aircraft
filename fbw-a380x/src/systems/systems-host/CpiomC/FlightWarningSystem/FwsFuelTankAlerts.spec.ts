// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  CollectorCellAlertInputs,
  CollectorCellNotFullMonitor,
  collectorCellNotFullLines,
  feedTankLevelLoTransferLines,
  FeedTankLevelLoTransferInputs,
  feedTankTempHiLines,
  FUEL_TANK_PHASE_INHIBITION,
  FuelTankProcedureInputs,
  fuelTempLoLines,
  fuelTempLoState,
  isFeedTankTempHi,
  manualTransferCompleted,
  ManualTransferCompletedInputs,
  manualTransferCompletedLines,
  TEMP_LO_OUTER_XFR_FEED_TANK_KG,
  TempLoTankInputs,
} from './FwsFuelTankAlerts';

const KG_PER_LB = 0.45359237;

const procedure = (inputs: Partial<FuelTankProcedureInputs> = {}): FuelTankProcedureInputs => ({
  onGround: false,
  feedMainPbOn: [true, true, true, true],
  feedStbyPbOn: [true, true, true, true],
  crossFeedPbOn: [false, false, false, false],
  outerXfrMan: false,
  midXfrMan: false,
  innerXfrMan: false,
  trimXfrFwd: false,
  trimTankFeedAuto: true,
  emerOuterXfrOn: false,
  ...inputs,
});

describe('A380X FUEL tank alerts (FCOM PRO-ABN-ECAM-10-28)', () => {
  it('has the FCOM flight phase inhibitions (PDF p.5158, 5179, 5258, 5198, 5241, 5251, 5269)', () => {
    expect(FUEL_TANK_PHASE_INHIBITION.collectorCellNotFull).toEqual([1, 3, 4, 5, 6, 7, 9, 10, 11, 12]);
    expect(FUEL_TANK_PHASE_INHIBITION.feedTankTempHi).toEqual([3, 4, 5, 6, 7, 9, 10]);
    expect(FUEL_TANK_PHASE_INHIBITION.tempLo).toEqual([3, 4, 5, 6, 7, 9, 10, 11, 12]);
    expect(FUEL_TANK_PHASE_INHIBITION.manXfrCompleted).toEqual([3, 4, 5, 6, 7, 9, 10]);
  });

  describe('COLLECTOR CELL 1(2)(3)(4) NOT FULL (l.149560-149568)', () => {
    const cells = (cell2: Partial<CollectorCellAlertInputs>): CollectorCellAlertInputs[] =>
      [0, 1, 2, 3].map((index) => ({
        quantityKg: 1_300,
        feedTankLevelLo: false,
        pumpRunning: true,
        ...(index === 1 ? cell2 : {}),
      }));

    it('triggers below 1 735 lb and clears above 2 076 lb', () => {
      const monitor = new CollectorCellNotFullMonitor();
      expect(monitor.update(cells({}))).toEqual([false, false, false, false]);
      expect(monitor.update(cells({ quantityKg: 1_700 * KG_PER_LB }))).toEqual([false, true, false, false]);
      expect(monitor.update(cells({ quantityKg: 2_000 * KG_PER_LB }))).toEqual([false, true, false, false]);
      expect(monitor.update(cells({ quantityKg: 2_100 * KG_PER_LB }))).toEqual([false, false, false, false]);
    });

    it('is inhibited with the feed tank level low or both feed tank pumps not running', () => {
      const monitor = new CollectorCellNotFullMonitor();
      expect(monitor.update(cells({ quantityKg: 500, feedTankLevelLo: true }))[1]).toBe(false);
      expect(monitor.update(cells({ quantityKg: 500, pumpRunning: false }))[1]).toBe(false);
      expect(monitor.update(cells({ quantityKg: 500 }))[1]).toBe(true);
    });

    it('lines: own and opposite feed tank pumps ON, both crossfeeds ON; 2000 KG NOT USABLE for cells 2 and 3', () => {
      const cell1 = collectorCellNotFullLines(
        0,
        procedure({ feedMainPbOn: [true, true, true, false], crossFeedPbOn: [true, false, false, true] }),
      );
      expect(cell1.show).toHaveLength(7);
      expect(cell1.checked).toEqual([false, true, true, false, true, true, true]);
      const cell3 = collectorCellNotFullLines(2, procedure({ crossFeedPbOn: [false, true, true, false] }));
      expect(cell3.show).toHaveLength(8);
      expect(cell3.checked).toEqual([false, true, true, true, true, true, true, false]);
    });
  });

  it('FEED TK TEMP HI above 53 °C (l.150383); DELAY T.O on ground, ENG PARAMETERS in flight (l.150410-150426)', () => {
    expect(isFeedTankTempHi(53)).toBe(false);
    expect(isFeedTankTempHi(54)).toBe(true);
    expect(feedTankTempHiLines(true).show).toEqual([true, false, false, false]);
    expect(feedTankTempHiLines(false).show).toEqual([false, true, true, true]);
  });

  describe('TEMP LO (l.153448)', () => {
    const tanks = (overrides: Partial<TempLoTankInputs> = {}): TempLoTankInputs => ({
      outer: [
        { temperatureC: -30, quantityKg: 8_000 },
        { temperatureC: -30, quantityKg: 8_000 },
      ],
      trim: { temperatureC: -30, quantityKg: 10_000 },
      feed: [0, 1, 2, 3].map(() => ({ temperatureC: -20, quantityKg: 20_000 })),
      ...overrides,
    });

    it('triggers below -40 °C in an outer tank, the trim tank or a feed tank, with an immersed sensor', () => {
      expect(fuelTempLoState(tanks()).active).toBe(false);
      const outer = fuelTempLoState(
        tanks({
          outer: [
            { temperatureC: -41, quantityKg: 8_000 },
            { temperatureC: -30, quantityKg: 8_000 },
          ],
        }),
      );
      expect(outer).toEqual({ active: true, outerTankLo: true, trimTankLo: false, feedTankLo: false });
      // 3 000 kg in an outer tank: sensor not immersed (8 819 lb), no temperature
      expect(
        fuelTempLoState(
          tanks({
            outer: [
              { temperatureC: -45, quantityKg: 3_000 },
              { temperatureC: -30, quantityKg: 8_000 },
            ],
          }),
        ).active,
      ).toBe(false);
      expect(fuelTempLoState(tanks({ trim: { temperatureC: -42, quantityKg: 10_000 } })).trimTankLo).toBe(true);
      expect(fuelTempLoState(tanks({ trim: { temperatureC: -42, quantityKg: 5_000 } })).trimTankLo).toBe(false);
    });

    it('lines: DELAY T.O on ground; in flight, stop the inner/mid transfers, OUTR TK XFR MAN when a feed tank < 35 300 lb', () => {
      const outerLo = { active: true, outerTankLo: true, trimTankLo: false, feedTankLo: false };
      expect(fuelTempLoLines(outerLo, procedure({ onGround: true }), false).show).toEqual([
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
      ]);
      const inFlight = fuelTempLoLines(outerLo, procedure({ innerXfrMan: true, outerXfrMan: true }), true);
      expect(inFlight.show).toEqual([false, true, false, true, true, false, false, false]);
      expect(inFlight.checked).toEqual([false, false, true, true, true, false, false, false]);
      expect(TEMP_LO_OUTER_XFR_FEED_TANK_KG).toBeCloseTo(35_300 * KG_PER_LB, 3);
      const feedLo = { active: true, outerTankLo: false, trimTankLo: true, feedTankLo: true };
      expect(fuelTempLoLines(feedLo, procedure(), false).show).toEqual([
        false,
        false,
        false,
        false,
        false,
        true,
        true,
        true,
      ]);
    });
  });

  describe('MAN XFR COMPLETED (l.151086, l.152837, l.153233, l.153832)', () => {
    const tanks = (overrides: Partial<ManualTransferCompletedInputs>): ManualTransferCompletedInputs => ({
      innerTanksHoldFuel: true,
      midTanksHoldFuel: true,
      outerTanksHoldFuel: true,
      trimTankHoldsFuel: true,
      outerXfrMan: false,
      midXfrMan: false,
      innerXfrMan: false,
      trimXfrFwd: false,
      ...overrides,
    });

    it('a manual transfer is completed when its tanks are empty with its pb-sw still in MAN (FWD)', () => {
      expect(manualTransferCompleted(tanks({ innerXfrMan: true }))).toEqual({
        inner: false,
        mid: false,
        outer: false,
        trim: false,
      });
      expect(manualTransferCompleted(tanks({ innerXfrMan: true, innerTanksHoldFuel: false })).inner).toBe(true);
      expect(manualTransferCompleted(tanks({ innerTanksHoldFuel: false })).inner).toBe(false);
      expect(manualTransferCompleted(tanks({ midXfrMan: true, midTanksHoldFuel: false })).mid).toBe(true);
      expect(manualTransferCompleted(tanks({ outerXfrMan: true, outerTanksHoldFuel: false })).outer).toBe(true);
      expect(manualTransferCompleted(tanks({ trimXfrFwd: true, trimTankHoldsFuel: false })).trim).toBe(true);
    });

    it('lines: the pb-sw back to AUTO; EMER OUTR TK XFR OFF; TRIM TK FEED AUTO', () => {
      expect(manualTransferCompletedLines('inner', procedure({ innerXfrMan: true }))).toEqual({
        show: [true],
        checked: [false],
      });
      expect(manualTransferCompletedLines('outer', procedure({ emerOuterXfrOn: true }))).toEqual({
        show: [true, true],
        checked: [true, false],
      });
      expect(manualTransferCompletedLines('trim', procedure({ trimXfrFwd: true, trimTankFeedAuto: false }))).toEqual({
        show: [true, true],
        checked: [false, false],
      });
    });
  });

  it('FEED TK LEVEL LO transfer lines: shown for the tanks with fuel, ticked from the XFR pb-sws (l.149913-149923)', () => {
    const tanks: FeedTankLevelLoTransferInputs = {
      trimTankGravityXfrInProgress: true,
      outerTanksHoldFuel: true,
      trimTankHoldsFuel: true,
      innerTanksHoldFuel: false,
      midTanksHoldFuel: true,
      trimTankPumpRunning: true,
    };
    const lines = feedTankLevelLoTransferLines(tanks, procedure({ outerXfrMan: true, trimTankFeedAuto: false }));
    expect(lines.show).toEqual([true, true, true, false, true]);
    expect(lines.checked).toEqual([false, true, false, false, false]);
    expect(feedTankLevelLoTransferLines({ ...tanks, trimTankPumpRunning: false }, procedure()).show[2]).toBe(false);
  });
});
