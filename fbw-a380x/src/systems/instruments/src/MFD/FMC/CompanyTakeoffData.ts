// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { CompanyTakeoffDataLink, CompanyTakeoffDataUplink } from '@flybywiresim/fbw-sdk';
import { TakeoffDerated, TakeoffPowerSetting } from '@fmgc/flightplanning/plans/performance/FlightPlanPerformanceData';

import { takeoffDeratedOfThrustReduction } from '../shared/TakeoffDerate';

/** The PERF T.O thrust settings that INSERT gives received takeoff data */
export interface CompanyTakeoffThrustSettings {
  powerSetting: TakeoffPowerSetting;
  /** The FLEX temperature in °C for FLEX, null otherwise */
  flexTemperature: number | null;
  /** The derated level for DERATED, null otherwise */
  derated: TakeoffDerated | null;
}

/** The PERF T.O thrust settings of received takeoff data */
export function companyTakeoffThrustSettings(uplink: CompanyTakeoffDataUplink): CompanyTakeoffThrustSettings {
  const derated = uplink.thrust === 'DERATED' ? takeoffDeratedOfThrustReduction(uplink.derate) : null;
  if (derated !== null) {
    return { powerSetting: TakeoffPowerSetting.DERATED, flexTemperature: null, derated };
  }
  if (uplink.thrust === 'FLEX' && uplink.flexTemperature !== null) {
    return { powerSetting: TakeoffPowerSetting.FLEX, flexTemperature: uplink.flexTemperature, derated: null };
  }
  return { powerSetting: TakeoffPowerSetting.TOGA, flexTemperature: null, derated: null };
}

/**
 * The company takeoff data of the FMS: the request sent with SEND T.O
 * REQUEST (REQUEST PENDING... while it waits), and the takeoff data received with or without a request, kept until the
 * flight crew inserts or clears it. The company ground station is the flypad takeoff calculator.
 */
export class CompanyTakeoffData extends CompanyTakeoffDataLink {
  /**
   * The A380 data needs the runway condition, and a derate one of the engine's levels; V1 and VR may be missing (real
   * data only mode of the calculator)
   */
  protected override isValid(uplink: CompanyTakeoffDataUplink): boolean {
    const finite = CompanyTakeoffDataLink.isFiniteNumber;
    return (
      super.isValid(uplink) &&
      (uplink.thrust !== 'DERATED' || takeoffDeratedOfThrustReduction(uplink.derate) !== null) &&
      finite(uplink.runwayCondition) &&
      (uplink.v1 === null || finite(uplink.v1)) &&
      (uplink.vr === null || finite(uplink.vr))
    );
  }
}
