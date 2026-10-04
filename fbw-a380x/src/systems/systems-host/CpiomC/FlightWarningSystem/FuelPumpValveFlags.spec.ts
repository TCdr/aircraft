// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  feedTankPumpAlerts,
  FeedTankPumpFlags,
  readCrossFeedValveFlags,
  readFeedTankPumpFlags,
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
