// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// the fmgc leg classes import each other in a cycle: this order resolves it
import '@fmgc/flightplanning/FlightPlanService';
import { FmgcFlightPhase } from '@shared/flightphase';
import { ApproachType } from '@flybywiresim/fbw-sdk';
import { TypeIIMessage } from '../shared/NXSystemMessages';
import { FmsAdvisoryMessages } from './FmsAdvisoryMessages';
import type { FlightManagementComputer } from './FlightManagementComputer';

/**
 * Runs `run` with SimVar reads answered from `simVars` (a name that is not listed reads 0) and SimVar writes stored in
 * it, so that a spec can see what the code under test sent to the PFD.
 * @param simVars the SimVar values by name, written into by SetSimVarValue
 * @param run the code under test
 */
export function withStubbedSimVars(simVars: Record<string, unknown>, run: () => void): void {
  const originalGet = SimVar.GetSimVarValue;
  const originalSet = SimVar.SetSimVarValue;
  SimVar.GetSimVarValue = ((name: string) => simVars[name] ?? 0) as unknown as typeof SimVar.GetSimVarValue;
  SimVar.SetSimVarValue = ((name: string, _unit: string, value: unknown) => {
    simVars[name] = value;
    return Promise.resolve();
  }) as unknown as typeof SimVar.SetSimVarValue;
  try {
    run();
  } finally {
    SimVar.GetSimVarValue = originalGet;
    SimVar.SetSimVarValue = originalSet;
  }
}

interface AdvisoryScenario {
  flightPhase: FmgcFlightPhase;
  /** The approach of the active flight plan, null without one */
  approach?: { type: ApproachType; finalLegNavaidIdent: string | null; ident?: string } | null;
  /** The ILS tuned on the POSITION/NAVAIDS page, null when the MMR is auto tuned */
  manuallyTunedIls?: { ident: string; frequency: number } | null;
  baroAltitudeFt?: number | null;
  computedAirspeedKt?: number | null;
  /** Distance to the top of descent in nautical miles, null when there is none */
  distanceToTopOfDescent?: number | null;
  /** The tuner finds the landing system the crew tuned different from the one of the runway of the flight plan */
  runwayLsMismatch?: boolean;
}

/**
 * The FMC data FmsAdvisoryMessages reads for a scenario, everything else reads as "nothing to report".
 * @param scenario the flight situation; runwayLsMismatch is read at every update, so a spec can change it in between
 * @returns the FMS advisory messages over a fake FMC, and the messages the FMC was asked to show or to remove
 */
export function createAdvisoryMessages(scenario: AdvisoryScenario) {
  const queued: TypeIIMessage[] = [];
  const removedTexts: string[] = [];
  const approach = scenario.approach
    ? {
        type: scenario.approach.type,
        ident: scenario.approach.ident ?? 'APPROACH',
        legs: [{ recommendedNavaid: { ident: scenario.approach.finalLegNavaidIdent, frequency: 110.3 } }],
      }
    : undefined;
  const tuned = scenario.manuallyTunedIls;
  const fmc = {
    flightPlanInterface: {
      hasActive: true,
      active: {
        approach,
        destinationAirport: { ident: 'LFBO', location: { alt: 0 } },
        activeLeg: undefined,
        activeLegIndex: 0,
        maybeElementAt: () => undefined,
        performanceData: { minimumDestinationFuelOnBoard: { get: () => null } },
        calculateActiveArea: () => undefined,
      },
    },
    fmgc: {
      data: {
        flightPhase: { get: () => scenario.flightPhase },
        estimatedTakeoffTime: { get: () => null },
        engineOut: { get: () => false },
        greenDotSpeed: { get: () => null },
      },
      getDestEFOB: () => null,
    },
    navigation: {
      isPilotRnp: () => false,
      getNavaidTuner: () => ({
        getMmrRadioTuningStatus: () => ({
          manual: !!tuned,
          ident: tuned?.ident ?? null,
          frequency: tuned?.frequency ?? null,
          facility: null,
        }),
        getSpecifiedNdbMessage: () => false,
        getRwyLsMismatchMessage: () => scenario.runwayLsMismatch === true,
      }),
      getBaroCorrectedAltitude: () => scenario.baroAltitudeFt ?? null,
      getComputedAirspeed: () => scenario.computedAirspeedKt ?? null,
      getPpos: () => null,
    },
    guidanceController: undefined,
    acInterface: undefined,
    addMessageToQueue: (message: TypeIIMessage) => queued.push(message),
    removeMessageFromQueue: (text: string) => removedTexts.push(text),
  };
  return {
    advisoryMessages: new FmsAdvisoryMessages(fmc as unknown as FlightManagementComputer),
    /** the active plan, for a spec that changes the approach between two updates */
    activePlan: fmc.flightPlanInterface.active as { approach: unknown },
    queued,
    removedTexts,
  };
}
