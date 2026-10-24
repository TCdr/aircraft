// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FlightPlanService } from '@fmgc/flightplanning/FlightPlanService';
import { SecondaryPlanData } from '@fmgc/guidance/vnav/SecondaryFlightPlanPredictions';
import { FmgcDataService } from './fmgc';

/**
 * @param fmgc the FMGC data of the A380X
 * @param plans the flight plans
 * @param planIndex a secondary flight plan
 * @returns what the predictions of that flight plan take from it
 */
export function a380SecondaryPlanData(
  fmgc: FmgcDataService,
  plans: FlightPlanService,
  planIndex: number,
): SecondaryPlanData {
  const plan = plans.get(planIndex);
  const pd = plan.performanceData;
  const cruiseFlightLevel = pd.cruiseFlightLevel.get();
  return {
    copiedFromActive: plan.isActiveOrCopiedFromActive(),
    zeroFuelWeight: pd.zeroFuelWeight.get(),
    fuelOnBoard: fmgc.getPredictionStartFob(planIndex),
    cruiseAltitude: cruiseFlightLevel ? cruiseFlightLevel * 100 : null,
    originElevation: plan.originRunway?.thresholdLocation?.alt ?? plan.originAirport?.location.alt ?? null,
    destinationElevation:
      plan.destinationRunway?.thresholdLocation?.alt ?? plan.destinationAirport?.location.alt ?? null,
    originLocation: plan.originAirport?.location ?? null,
    managedSpeeds: {
      managedClimbSpeed: fmgc.getManagedClimbSpeed(planIndex),
      managedClimbSpeedMach: fmgc.getManagedClimbSpeedMach(planIndex),
      managedCruiseSpeed: fmgc.getManagedCruiseSpeed(planIndex),
      managedCruiseSpeedMach: fmgc.getManagedCruiseSpeedMach(planIndex),
      managedDescentSpeed: fmgc.getManagedDescentSpeed(planIndex),
      managedDescentSpeedMach: fmgc.getManagedDescentSpeedMach(planIndex),
    },
    climbSpeedLimit: fmgc.getClimbSpeedLimit(planIndex),
    descentSpeedLimit: fmgc.getDescentSpeedLimit(planIndex),
    v2Speed: pd.v2.get(),
    accelerationAltitude: pd.accelerationAltitude.get(),
    thrustReductionAltitude: pd.thrustReductionAltitude.get(),
    transitionAltitude: pd.transitionAltitude.get(),
    preselectedClbSpeed: pd.preselectedClimbSpeed.get(),
    preselectedCruiseSpeed: pd.preselectedCruiseSpeed.get(),
    takeoffFlaps: pd.takeoffFlaps.get(),
    descentCabinRate: pd.descentCabinRate?.get() ?? null,
  };
}
