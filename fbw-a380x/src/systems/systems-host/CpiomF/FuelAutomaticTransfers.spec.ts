// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSimVars } from '../../../../../fbw-common/src/jest/MockedSimVars';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';
import {
  FuelAutomaticTransfers,
  LOAD_ALLEVIATION_FROM_TRIM_TK_VAR,
  LOAD_ALLEVIATION_TO_OUTR_TKS_VAR,
} from './FuelAutomaticTransfers';
import { FUEL_XFR_PB_IS_AUTO_VARS, INR_TK_XFR_PB_IS_AUTO_VAR } from './FuelManualTransfer';
import {
  AUTO_GND_XFR_COMPLETED_VAR,
  AUTO_GND_XFR_FAULT_VAR,
  AUTO_GND_XFR_IN_PROGRESS_VAR,
  AUTO_GND_XFR_PB_IS_ON_VAR,
} from './FuelGroundTransfer';
import { TRIM_TK_FEED_SELECTOR_VAR, TRIM_TK_GRAVITY_XFR_IN_PROGRESS_VAR } from './FuelTrimTankFeed';
import { OUTR_TK_GRAVITY_XFR_IN_PROGRESS_VAR } from './FuelAlternateTransfers';
import { FuelTransferRestrictions, NO_TRANSFER_RESTRICTION } from './FuelTransferFaults';

const POUNDS_PER_GALLON = 6.7;

/** The capacities of flight_model.cfg Tank.1-11, in gallons */
const CAPACITIES = [2731.5, 7299.6, 9632, 12189.4, 7753.2, 7753.2, 12189.4, 9632, 7299.6, 2731.5, 6260.3];

/** The circuits of the 12 transfer pump pb-sws (systems.cfg circuit.70-81) */
const TRANSFER_PUMP_CIRCUITS = [70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81];

describe('FuelAutomaticTransfers', () => {
  const simVars = new Map<string, number | boolean>();
  const failures = new Set<number>();
  const commandedOn = new Set<number>();
  const quantity = (tank: number) => Number(simVars.get(`FUELSYSTEM TANK QUANTITY:${tank}`) ?? 0);
  const setQuantity = (tank: number, gallons: number) => simVars.set(`FUELSYSTEM TANK QUANTITY:${tank}`, gallons);
  const rtdWord = (minutes: number) => Arinc429Word.getRawWord(minutes * 60, Arinc429SignStatusMatrix.NormalOperation);

  let transfers: FuelAutomaticTransfers;

  const transferFaults: { restrictions: Readonly<FuelTransferRestrictions> } = {
    restrictions: NO_TRANSFER_RESTRICTION,
  };

  /** Runs the transfers for a time, in seconds, at the update period */
  const run = (seconds: number) => {
    for (let ms = 0; ms < seconds * 1000; ms += FuelAutomaticTransfers.UPDATE_PERIOD_MS) {
      transfers.onUpdate();
    }
  };

  beforeEach(() => {
    simVars.clear();
    failures.clear();
    commandedOn.clear();
    transferFaults.restrictions = NO_TRANSFER_RESTRICTION;
    mockSimVars(simVars);
    simVars.set('FUEL WEIGHT PER GALLON', POUNDS_PER_GALLON);
    CAPACITIES.forEach((capacity, index) => simVars.set(`FUELSYSTEM TANK CAPACITY:${index + 1}`, capacity));
    for (const circuit of TRANSFER_PUMP_CIRCUITS) {
      simVars.set(`A:CIRCUIT CONNECTION ON:${circuit}`, 1);
    }
    for (const pbVar of FUEL_XFR_PB_IS_AUTO_VARS) {
      simVars.set(pbVar, 1);
    }
    // In cruise, no destination prediction
    simVars.set('PRESSURE ALTITUDE', 37_000);
    transfers = new FuelAutomaticTransfers(
      { deltaTime: FuelAutomaticTransfers.UPDATE_PERIOD_MS },
      { isActive: (failure) => failures.has(failure) },
      { isTransferPumpCommandedOn: (pump) => commandedOn.has(pump) },
      transferFaults,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('after takeoff, fills the outer tanks from the inner tanks (load alleviation, FOB above 110 200 lb)', () => {
    setQuantity(1, 1_000);
    setQuantity(10, 1_000);
    setQuantity(4, 10_000);
    setQuantity(7, 10_000);
    run(60);
    expect(simVars.get(LOAD_ALLEVIATION_TO_OUTR_TKS_VAR)).toBe(true);
    // 44 100 lb/h per outer tank: 109.7 gal in one minute
    expect(quantity(1)).toBeCloseTo(1_000 + 44_100 / 60 / POUNDS_PER_GALLON, 0);
    expect(quantity(4)).toBeCloseTo(10_000 - 44_100 / 60 / POUNDS_PER_GALLON, 0);
    expect(quantity(10)).toBeCloseTo(quantity(1), 3);
  });

  it('a manual transfer stops the load alleviation transfers', () => {
    setQuantity(1, 1_000);
    setQuantity(4, 18_000);
    simVars.set(INR_TK_XFR_PB_IS_AUTO_VAR, 0);
    run(60);
    expect(quantity(1)).toBe(1_000);
    expect(simVars.get(LOAD_ALLEVIATION_TO_OUTR_TKS_VAR)).toBe(false);
  });

  it('before landing, empties the trim tank into the feed tanks (RTD below 80 min for 3 min)', () => {
    setQuantity(11, 3_000);
    for (const feedTank of [2, 5, 6, 9]) {
      setQuantity(feedTank, 4_000);
    }
    simVars.set('L:A32NX_FM1_REMAINING_FLIGHT_TIME', rtdWord(79));
    run(170);
    expect(quantity(11)).toBe(3_000);
    run(20);
    expect(simVars.get(LOAD_ALLEVIATION_FROM_TRIM_TK_VAR)).toBe(true);
    expect(quantity(11)).toBeLessThan(3_000);
    expect(quantity(2)).toBeGreaterThan(4_000);
  });

  it('on ground, the AUTO GND XFR pb-sw moves the trim tank fuel forward until the CG is 39.5 %', () => {
    simVars.set('SIM ON GROUND', 1);
    setQuantity(11, 3_000);
    setQuantity(4, 5_000);
    setQuantity(7, 5_000);
    const cg = (percent: number) =>
      simVars.set(
        'L:A32NX_FQMS_CENTER_OF_GRAVITY_MAC',
        Arinc429Word.getRawWord(percent, Arinc429SignStatusMatrix.NormalOperation),
      );
    cg(41);
    run(1);
    expect(simVars.get(AUTO_GND_XFR_IN_PROGRESS_VAR)).toBe(false);
    simVars.set(AUTO_GND_XFR_PB_IS_ON_VAR, 1);
    run(60);
    expect(simVars.get(AUTO_GND_XFR_IN_PROGRESS_VAR)).toBe(true);
    expect(quantity(11)).toBeLessThan(3_000);
    expect(quantity(4)).toBeGreaterThan(5_000);
    expect(quantity(4)).toBeCloseTo(quantity(7), 3);
    cg(39.5);
    run(1);
    expect(simVars.get(AUTO_GND_XFR_IN_PROGRESS_VAR)).toBe(false);
    expect(simVars.get(AUTO_GND_XFR_COMPLETED_VAR)).toBe(true);
  });

  it('the ground transfer faults without the FMS ZFW / ZFCG (no FQMS CG) or with a transfer pump off', () => {
    simVars.set('SIM ON GROUND', 1);
    setQuantity(11, 3_000);
    simVars.set(AUTO_GND_XFR_PB_IS_ON_VAR, 1);
    run(1);
    expect(simVars.get(AUTO_GND_XFR_FAULT_VAR)).toBe(true);
    expect(quantity(11)).toBe(3_000);
  });

  it('TRIM TK FEED OPEN: gravity transfer from the trim tank to the inner tanks, pitch below 3°', () => {
    setQuantity(11, 3_000);
    simVars.set(TRIM_TK_FEED_SELECTOR_VAR, 1);
    simVars.set('PLANE PITCH DEGREES', -2.5); // MSFS: nose up negative
    run(36);
    expect(simVars.get(TRIM_TK_GRAVITY_XFR_IN_PROGRESS_VAR)).toBe(true);
    expect(quantity(11)).toBeCloseTo(3_000 - 10, 3);
    simVars.set('PLANE PITCH DEGREES', -4);
    run(36);
    expect(quantity(11)).toBeCloseTo(3_000 - 10, 3);
    expect(simVars.get(TRIM_TK_GRAVITY_XFR_IN_PROGRESS_VAR)).toBe(false);
  });

  it('CASE 5: a failed outer tank pump empties its tank by gravity into FEED TK 2 below 28 660 lb', () => {
    failures.add(A380Failure.FuelLeftOuterTankPump);
    setQuantity(1, 2_000);
    for (const feedTank of [2, 5, 6, 9]) {
      setQuantity(feedTank, 4_000);
    }
    run(36);
    expect(simVars.get(OUTR_TK_GRAVITY_XFR_IN_PROGRESS_VAR)).toBe(true);
    expect(quantity(1)).toBeCloseTo(2_000 - 5, 3);
    expect(quantity(5)).toBeCloseTo(4_000 + 5, 3);
  });

  it('CASE 4: the fuel of an inner tank with a failed fwd pump goes on to the receiving feed tanks', () => {
    failures.add(A380Failure.FuelLeftInnerTankFwdPump);
    commandedOn.add(12);
    setQuantity(4, 5_000);
    setQuantity(7, 5_000);
    setQuantity(2, 6_000);
    // FEED TK 1 receives the main transfer (FeedTank1FwdTransferValve2 open)
    simVars.set('FUELSYSTEM VALVE OPEN:11', 1);
    run(60);
    const oneMinuteGal = 22_050 / 2 / 60 / POUNDS_PER_GALLON;
    expect(quantity(2)).toBeCloseTo(6_000 + oneMinuteGal, 1);
    expect(quantity(4)).toBeCloseTo(5_000 - oneMinuteGal, 1);
    expect(quantity(7)).toBe(5_000);
  });

  it('without the forward gallery the outer tanks go by gravity, as after an outer tank pump failure', () => {
    transferFaults.restrictions = { ...NO_TRANSFER_RESTRICTION, outerPumpedTransferLost: true };
    setQuantity(1, 2_000);
    setQuantity(10, 2_000);
    for (const feedTank of [2, 5, 6, 9]) {
      setQuantity(feedTank, 4_000);
    }
    run(36);
    expect(simVars.get(OUTR_TK_GRAVITY_XFR_IN_PROGRESS_VAR)).toBe(true);
    expect(quantity(1)).toBeCloseTo(2_000 - 5, 3);
    expect(quantity(10)).toBeCloseTo(2_000 - 5, 3);
  });

  it('the automatic transfers lost to the transfer failures stop the load alleviation and gravity transfers', () => {
    transferFaults.restrictions = {
      ...NO_TRANSFER_RESTRICTION,
      manualTransferRequired: true,
      automaticTransfersLost: true,
    };
    failures.add(A380Failure.FuelLeftOuterTankPump);
    setQuantity(1, 1_000);
    setQuantity(10, 1_000);
    setQuantity(4, 10_000);
    setQuantity(7, 10_000);
    run(60);
    expect(simVars.get(LOAD_ALLEVIATION_TO_OUTR_TKS_VAR)).toBe(false);
    expect(simVars.get(OUTR_TK_GRAVITY_XFR_IN_PROGRESS_VAR)).toBe(false);
    expect(quantity(1)).toBe(1_000);
    expect(quantity(4)).toBe(10_000);
  });

  it('no load alleviation transfer out of the trim tank with the trim line damaged', () => {
    transferFaults.restrictions = { ...NO_TRANSFER_RESTRICTION, trimTankAutomaticTransfersInhibited: true };
    setQuantity(11, 3_000);
    for (const feedTank of [2, 5, 6, 9]) {
      setQuantity(feedTank, 4_000);
    }
    simVars.set('L:A32NX_FM1_REMAINING_FLIGHT_TIME', rtdWord(79));
    run(190);
    expect(simVars.get(LOAD_ALLEVIATION_FROM_TRIM_TK_VAR)).toBe(false);
    expect(quantity(11)).toBe(3_000);
  });

  it('no gravity transfer out of the trim tank without both transfer galleries', () => {
    transferFaults.restrictions = {
      ...NO_TRANSFER_RESTRICTION,
      automaticTransfersLost: true,
      innerMidTrimTransfersLost: true,
    };
    setQuantity(11, 3_000);
    simVars.set(TRIM_TK_FEED_SELECTOR_VAR, 1);
    simVars.set('PLANE PITCH DEGREES', -2.5);
    run(36);
    expect(simVars.get(TRIM_TK_GRAVITY_XFR_IN_PROGRESS_VAR)).toBe(false);
    expect(quantity(11)).toBe(3_000);
  });

  it('a jettison stops every transfer', () => {
    setQuantity(1, 1_000);
    setQuantity(4, 18_000);
    simVars.set('L:A380X_FUEL_JETTISON_IN_PROGRESS', 1);
    run(60);
    expect(quantity(1)).toBe(1_000);
  });
});
