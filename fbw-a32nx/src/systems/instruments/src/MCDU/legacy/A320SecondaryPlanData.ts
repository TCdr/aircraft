// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { A320AircraftConfig, A320EconParameters } from '@fmgc/flightplanning/A320AircraftConfig';
import { FlightPlan } from '@fmgc/flightplanning/plans/FlightPlan';
import { EconSpeeds, ISA_TROPOPAUSE_ALTITUDE, tonnesToPounds } from '@fmgc/guidance/vnav/EconSpeeds';
import { FlightModel } from '@fmgc/guidance/vnav/FlightModel';
import { ProfilePhase, VerticalWaypointPrediction } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { SecondaryPlanData, SecondaryPredictionRules } from '@fmgc/guidance/vnav/SecondaryFlightPlanPredictions';
import { SpeedLimit } from '@fmgc/guidance/vnav/SpeedLimit';
import { FmgcFlightPhase } from '@shared/flightphase';

type ManagedSpeeds = SecondaryPlanData['managedSpeeds'];

/**
 * The managed speeds of a secondary flight plan: the ECON speeds of its cost index, cruise level and weight (ISA, no
 * wind: the aircraft is not necessarily where the flight plan is), else the cost index tables of the A320.
 */
export function secondaryManagedSpeeds(
  costIndex: number | null,
  cruiseLevel: number | null,
  grossWeightTonnes: number | null,
  tropopause: number | null,
  pilotDescent: { speed: number | null; mach: number | null },
): ManagedSpeeds {
  const ci = costIndex ?? 0;
  const climbRatio = (ci / 999) ** 2;
  const descentRatio = ci / 999;
  let speeds: ManagedSpeeds = {
    managedClimbSpeed: 290 * (1 - climbRatio) + 330 * climbRatio,
    managedClimbSpeedMach: 0.78,
    managedCruiseSpeed: 290 * (1 - climbRatio) + 310 * climbRatio,
    managedCruiseSpeedMach: 0.78,
    managedDescentSpeed: 288 * (1 - descentRatio) + 300 * descentRatio,
    managedDescentSpeedMach: 0.78,
  };
  if (costIndex !== null && cruiseLevel !== null && grossWeightTonnes !== null) {
    const cruiseAltitude = cruiseLevel * 100;
    const segmentAltitude = EconSpeeds.speedSegmentAltitude(cruiseAltitude);
    const weightKg = grossWeightTonnes * 1000;
    const weight = tonnesToPounds(grossWeightTonnes);
    const econ = EconSpeeds.computeEconSpeeds(A320AircraftConfig, A320EconParameters, {
      costIndex,
      cruiseAltitude,
      climbWeight: weight,
      cruiseWeight: weight,
      descentWeight: weight,
      isaDeviation: 0,
      climbHeadwind: 0,
      cruiseHeadwind: 0,
      descentHeadwind: 0,
      tropopause: tropopause ?? ISA_TROPOPAUSE_ALTITUDE,
      climbMinSpeed: FlightModel.getGreenDotSpeedCas(segmentAltitude, weightKg),
      cruiseMinSpeed: FlightModel.getGreenDotSpeedCas(cruiseAltitude, weightKg),
      descentMinSpeed: FlightModel.getGreenDotSpeedCas(segmentAltitude, weightKg),
    });
    if (econ) {
      speeds = {
        managedClimbSpeed: econ.climbSpeed,
        managedClimbSpeedMach: econ.climbMach,
        managedCruiseSpeed: econ.cruiseSpeed,
        managedCruiseSpeedMach: econ.cruiseMach,
        managedDescentSpeed: econ.descentSpeed,
        managedDescentSpeedMach: econ.descentMach,
      };
    }
  }
  return {
    ...speeds,
    managedDescentSpeed: pilotDescent.speed ?? speeds.managedDescentSpeed,
    managedDescentSpeedMach: pilotDescent.mach ?? speeds.managedDescentSpeedMach,
  };
}

function speedLimit(speed: number | null, underAltitude: number | null): SpeedLimit | null {
  return speed !== null && underAltitude !== null ? { speed, underAltitude } : null;
}

/** The entries of the active flight plan that a copy of it falls back on */
export interface ActiveEntries {
  cruiseFlightLevel: number | null;
  /** Tonnes */
  zeroFuelWeight: number | null;
  /** Tonnes */
  fuelOnBoard: number | null;
}

/**
 * @param plan a secondary flight plan
 * @param fuelOnBoard tonnes, the fuel the predictions start with
 * @param tropopause feet, null for the ISA one
 * @returns what the predictions of that flight plan take from it
 */
export function a320SecondaryPlanData(
  plan: FlightPlan,
  fuelOnBoard: number | null,
  tropopause: number | null,
  active: ActiveEntries,
): SecondaryPlanData {
  const pd = plan.performanceData;
  const copiedFromActive = plan.isActiveOrCopiedFromActive();
  // A copy of the active flight plan uses the same data: an entry made in the active flight plan after the copy, or
  // not piped to the copy, still counts
  const cruiseFlightLevel = pd.cruiseFlightLevel.get() ?? (copiedFromActive ? active.cruiseFlightLevel : null);
  const zeroFuelWeight = pd.zeroFuelWeight.get() ?? (copiedFromActive ? active.zeroFuelWeight : null);
  return {
    copiedFromActive,
    zeroFuelWeight,
    fuelOnBoard: fuelOnBoard ?? (copiedFromActive ? active.fuelOnBoard : null),
    cruiseAltitude: cruiseFlightLevel ? cruiseFlightLevel * 100 : null,
    originElevation: plan.originRunway?.thresholdLocation?.alt ?? plan.originAirport?.location.alt ?? null,
    destinationElevation:
      plan.destinationRunway?.thresholdLocation?.alt ?? plan.destinationAirport?.location.alt ?? null,
    originLocation: plan.originAirport?.location ?? null,
    managedSpeeds: secondaryManagedSpeeds(
      pd.costIndex.get(),
      cruiseFlightLevel,
      zeroFuelWeight !== null && fuelOnBoard !== null ? zeroFuelWeight + fuelOnBoard : null,
      tropopause,
      { speed: pd.pilotManagedDescentSpeed.get(), mach: pd.pilotManagedDescentMach.get() },
    ),
    climbSpeedLimit: speedLimit(pd.climbSpeedLimitSpeed.get(), pd.climbSpeedLimitAltitude.get()),
    descentSpeedLimit: speedLimit(pd.descentSpeedLimitSpeed.get(), pd.descentSpeedLimitAltitude.get()),
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

/** What decides whether the predictions of a secondary flight plan copied from the active one are updated */
export interface SecondarySituation {
  copiedFromActive: boolean;
  activeFlightPhase: FmgcFlightPhase;
  /** The active leg of the active flight plan and of the secondary flight plan, by waypoint identity */
  activeLegId: string | null;
  secondaryLegId: string | null;
  sameDepartureAirport: boolean;
}

/**
 * The update rule of the secondary flight plan predictions:
 * - one created on its INIT page is computed once, as for the aircraft on ground before engine start;
 * - a copy of the active flight plan is updated like it, stops at the top of descent of the aircraft (the predictions
 *   are removed) and stops when its active leg diverges from the active flight plan (they stay as they were);
 * - before the takeoff a copy is computed while both flight plans leave the same airport, whatever the runways.
 */
export function secondaryPredictionGate(situation: SecondarySituation): 'compute' | 'freeze' | 'clear' {
  if (!situation.copiedFromActive) {
    return 'compute';
  }
  if (situation.activeFlightPhase >= FmgcFlightPhase.Descent) {
    return 'clear';
  }
  if (situation.activeFlightPhase <= FmgcFlightPhase.Preflight) {
    return situation.sameDepartureAirport ? 'compute' : 'freeze';
  }
  return situation.activeLegId === situation.secondaryLegId ? 'compute' : 'freeze';
}

/** @returns whether a SEC prediction is shown: the FMGS gives none for the descent, approach and go around phases */
export function isSecondaryPredictionShown(prediction: VerticalWaypointPrediction): boolean {
  return prediction.profilePhase !== ProfilePhase.Descent;
}

export function a320SecondaryRules(
  plans: { get(index: number): FlightPlan; active: FlightPlan },
  flightPhase: () => FmgcFlightPhase,
): SecondaryPredictionRules {
  return {
    gate: (planIndex) => {
      const secondary = plans.get(planIndex);
      const active = plans.active;
      return secondaryPredictionGate({
        copiedFromActive: secondary.isActiveOrCopiedFromActive(),
        activeFlightPhase: flightPhase(),
        activeLegId: active.activeLeg && 'ident' in active.activeLeg ? active.activeLeg.ident : null,
        secondaryLegId: secondary.activeLeg && 'ident' in secondary.activeLeg ? secondary.activeLeg.ident : null,
        sameDepartureAirport:
          active.originAirport !== undefined && active.originAirport?.ident === secondary.originAirport?.ident,
      });
    },
    keep: isSecondaryPredictionShown,
  };
}
