// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  FEED_TANK_LEVEL_LO_KG,
  FeedTankLevelLoMonitor,
  feedTankPumpAlerts,
  FeedTankPumpFlags,
  isTransferPumpAlertFaulty,
  readCrossFeedPbSelections,
  readCrossFeedValveFlags,
  readFeedTankPumpFlags,
  readTransferPumpFlags,
  transferPumpAlerts,
} from './FuelPumpValveFlags';
import { FwcFlightPhase } from './FwsFlightPhases';

const normal: FeedTankPumpFlags = { mainPbOn: true, stbyPbOn: true, mainLowPressure: false, stbyLowPressure: false };

describe('FUEL FEED TK pump alerts (A380 FCOM PRO-ABN-ECAM-10-28)', () => {
  it('gives nothing with both pumps ON and running', () => {
    expect(feedTankPumpAlerts(normal, FwcFlightPhase.AtOrAbove1500FeetTo800Feet)).toEqual({
      mainFault: false,
      stbyFault: false,
      mainAndStbyFault: false,
    });
  });

  it('gives MAIN PMP FAULT for a failed main pump, STBY PMP FAULT for a failed standby pump', () => {
    const phase = FwcFlightPhase.AtOrAbove1500FeetTo800Feet;
    expect(feedTankPumpAlerts({ ...normal, mainLowPressure: true }, phase).mainFault).toBe(true);
    expect(feedTankPumpAlerts({ ...normal, stbyLowPressure: true }, phase).stbyFault).toBe(true);
  });

  it('gives only MAIN + STBY PMPs FAULT when both pumps are faulty', () => {
    expect(
      feedTankPumpAlerts(
        { ...normal, mainLowPressure: true, stbyLowPressure: true },
        FwcFlightPhase.AtOrAbove1500FeetTo800Feet,
      ),
    ).toEqual({ mainFault: false, stbyFault: false, mainAndStbyFault: true });
  });

  it('counts a pump turned off by the flight crew, except in flight phases 1 and 12', () => {
    const mainOff = { ...normal, mainPbOn: false };
    expect(feedTankPumpAlerts(mainOff, FwcFlightPhase.FirstEngineStarted).mainFault).toBe(true);
    expect(feedTankPumpAlerts(mainOff, FwcFlightPhase.ElecPwr).mainFault).toBe(false);
    expect(feedTankPumpAlerts(mainOff, FwcFlightPhase.EnginesShutdown).mainFault).toBe(false);
  });
});

describe('FWS fuel pump and crossfeed valve inputs', () => {
  it('reads the Bool simvars (the number 1) as real booleans', () => {
    const values: Record<string, number> = {
      'A:CIRCUIT CONNECTION ON:2': 1,
      'A:CIRCUIT CONNECTION ON:3': 1,
      'L:A380X_FUEL_FEED_TK_1_MAIN_PMP_LO_PR': 1,
      'L:A380X_FUEL_CROSSFEED_VLV_3_ABNORMAL': 1,
    };
    const read = (name: string) => values[name] ?? 0;

    const pumps = readFeedTankPumpFlags(read);
    expect(pumps[0]).toEqual({ mainPbOn: true, stbyPbOn: true, mainLowPressure: true, stbyLowPressure: false });
    expect(pumps[1].mainPbOn).toBe(false);

    const valves = readCrossFeedValveFlags(read, (valve) => (valve === 48 ? 1 : 0));
    expect(valves[2]).toEqual({ abnormal: true, closed: false });
    expect(valves[0]).toEqual({ abnormal: false, closed: true });
  });
});

describe('CROSSFEED pb-sw selections (sensed CROSSFEED ... ON items)', () => {
  it('reads the pb-sw selection L:vars, not the valve positions', () => {
    const lVars = new Map([
      ['L:A380X_OVHD_FUEL_CROSSFEED_1_PB_IS_ON', 1],
      ['L:A380X_OVHD_FUEL_CROSSFEED_3_PB_IS_ON', 1],
      // a valve open with its pb-sw OFF is no crew action
      ['A:FUELSYSTEM VALVE OPEN:47', 1],
    ]);
    expect(readCrossFeedPbSelections((name) => lVars.get(name) ?? 0)).toEqual([true, false, true, false]);
  });
});

describe('FUEL transfer pump alerts (A380 FCOM PRO-ABN-ECAM-10-28)', () => {
  const cruise = FwcFlightPhase.AtOrAbove1500FeetTo800Feet;
  /** Every pb-sw ON, no FAULT */
  const normalSimVars = (): Map<string, number> =>
    new Map(
      [70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81].map((circuit) => [`A:CIRCUIT CONNECTION ON:${circuit}`, 1]),
    );

  it('reads the pb-sw of every transfer pump and the FAULT of the pumps that can fail', () => {
    const simVars = normalSimVars();
    simVars.set('A:CIRCUIT CONNECTION ON:72', 0);
    simVars.set('L:A380X_FUEL_TRIM_TK_R_PMP_FAULT', 1);
    const flags = readTransferPumpFlags((name) => simVars.get(name) ?? 0);
    expect(flags.leftMidAft).toEqual({ pbOn: false, fault: false });
    expect(flags.trimRight).toEqual({ pbOn: true, fault: true });
    expect(flags.leftOuter).toEqual({ pbOn: true, fault: false });
  });

  it('counts a pump turned off by the flight crew, except in flight phases 1 and 12', () => {
    const off = { pbOn: false, fault: false };
    expect(isTransferPumpAlertFaulty(off, cruise)).toBe(true);
    expect(isTransferPumpAlertFaulty(off, FwcFlightPhase.ElecPwr)).toBe(false);
    expect(isTransferPumpAlertFaulty(off, FwcFlightPhase.EnginesShutdown)).toBe(false);
    expect(isTransferPumpAlertFaulty({ pbOn: true, fault: true }, FwcFlightPhase.ElecPwr)).toBe(true);
  });

  it('gives nothing with every pump ON and no FAULT', () => {
    const simVars = normalSimVars();
    const alerts = transferPumpAlerts(
      readTransferPumpFlags((name) => simVars.get(name) ?? 0),
      cruise,
    );
    const none = { first: false, second: false, both: false };
    expect(alerts).toEqual({
      leftOuter: false,
      rightOuter: false,
      leftInner: none,
      rightInner: none,
      leftMid: none,
      rightMid: none,
      trim: none,
    });
  });

  it('gives the single alert of a failed pump, and the double alert when the other pump of the pair is off', () => {
    const simVars = normalSimVars();
    simVars.set('L:A380X_FUEL_L_INR_TK_FWD_PMP_FAULT', 1);
    simVars.set('L:A380X_FUEL_R_OUTR_TK_PMP_FAULT', 1);
    let alerts = transferPumpAlerts(
      readTransferPumpFlags((name) => simVars.get(name) ?? 0),
      cruise,
    );
    expect(alerts.leftInner).toEqual({ first: true, second: false, both: false });
    expect(alerts.rightOuter).toBe(true);
    expect(alerts.leftOuter).toBe(false);

    // L INR TK AFT PMP turned off: L INR TK FWD+AFT PMPs FAULT only
    simVars.set('A:CIRCUIT CONNECTION ON:74', 0);
    alerts = transferPumpAlerts(
      readTransferPumpFlags((name) => simVars.get(name) ?? 0),
      cruise,
    );
    expect(alerts.leftInner).toEqual({ first: false, second: false, both: true });
  });

  it('gives TRIM TK L+R PMPs FAULT for both trim tank pumps', () => {
    const simVars = normalSimVars();
    simVars.set('L:A380X_FUEL_TRIM_TK_L_PMP_FAULT', 1);
    simVars.set('L:A380X_FUEL_TRIM_TK_R_PMP_FAULT', 1);
    const alerts = transferPumpAlerts(
      readTransferPumpFlags((name) => simVars.get(name) ?? 0),
      cruise,
    );
    expect(alerts.trim).toEqual({ first: false, second: false, both: true });
  });
});

describe('FUEL FEED TK 1(2)(3)(4) LEVEL LO detection (A380 FCOM PRO-ABN-ECAM-10-28, less than 3 030 lb)', () => {
  /** Runs the monitor for some seconds with the given feed tank quantities, 1 s steps */
  const run = (monitor: FeedTankLevelLoMonitor, feedTankWeightsKg: number[], seconds: number): boolean[] => {
    let lowLevels: boolean[] = [];
    for (let second = 0; second < seconds; second++) {
      lowLevels = monitor.update(feedTankWeightsKg, 1000);
    }
    return lowLevels;
  };

  it('confirms a single low feed tank after 30 s, the others staying normal', () => {
    const monitor = new FeedTankLevelLoMonitor();
    const weights = [5000, FEED_TANK_LEVEL_LO_KG - 100, 5000, 5000];
    expect(run(monitor, weights, 29)).toEqual([false, false, false, false]);
    expect(run(monitor, weights, 3)).toEqual([false, true, false, false]);
  });

  it('confirms each low feed tank on its own, and clears a refilled one at once', () => {
    const monitor = new FeedTankLevelLoMonitor();
    expect(run(monitor, [1000, 5000, 5000, 1000], 32)).toEqual([true, false, false, true]);
    expect(run(monitor, [1000, 5000, 5000, 5000], 1)).toEqual([true, false, false, false]);
  });

  it('gives no low level at 3 030 lb or more', () => {
    expect(run(new FeedTankLevelLoMonitor(), [1375, 1400, 5000, 7000], 40)).toEqual([false, false, false, false]);
  });
});
