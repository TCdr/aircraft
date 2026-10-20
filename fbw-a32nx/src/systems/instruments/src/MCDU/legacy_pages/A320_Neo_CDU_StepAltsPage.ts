// @ts-strict-ignore
// Copyright (c) 2021-2023 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { NXUnits } from '@flybywiresim/fbw-sdk';
import { NXFictionalMessages, NXSystemMessages } from '../messages/NXSystemMessages';
import { Keypad } from '../legacy/A320_Neo_CDU_Keypad';
import { LegacyFmsPageInterface } from '../legacy/LegacyFmsPageInterface';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { FlightPlanLeg } from '@fmgc/flightplanning/legs/FlightPlanLeg';
import { VerticalWaypointPrediction } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { isaDeviationAt, ISA_TROPOPAUSE_ALTITUDE } from '@fmgc/guidance/vnav/EconSpeeds';
import {
  OptimumStep,
  optimumStepAnchor,
  OptimumStepTarget,
  optimumStepTarget,
  stepPointSecondsFromPresent,
  stepProfileContext,
  waypointDistancesAhead,
} from '@fmgc/guidance/vnav/OptimumStep';
import { FmgcFlightPhase } from '@shared/flightphase';
import { A32NX_Util } from '../../../../shared/src/A32NX_Util';
import {
  A320OptimumStepCache,
  A320OptimumStepState as OptimumStepState,
  formatOptStepLine,
} from '../legacy/A320OptimumStep';

export class CDUStepAltsPage {
  /** The step altitude entered without a waypoint, for the optimum step search when the flight plan has no step */
  static optimumStepAltitude: number | null = null;

  /** The cruise level of that entry: a new cruise level (or flight plan) ends it */
  private static optimumStepCruiseLevel: number | null = null;

  private static readonly optimumStepCache = new A320OptimumStepCache();

  static Return() {}

  static ShowPage(mcdu: LegacyFmsPageInterface, forPlan: FlightPlanIndex) {
    mcdu.pageUpdate = () => {};

    mcdu.page.Current = mcdu.page.StepAltsPage;
    mcdu.SelfPtr = setTimeout(() => {
      if (mcdu.page.Current === mcdu.page.StepAltsPage) {
        CDUStepAltsPage.ShowPage(mcdu, forPlan);
      }
    }, mcdu.PageTimeout.Medium);

    const isActivePlan = forPlan === FlightPlanIndex.Active;
    const plan = mcdu.getFlightPlan(forPlan);

    const legsWithSteps = plan.allLegs
      .filter((it) => it.isDiscontinuity === false)
      .filter((it) => it.cruiseStep !== undefined);

    const transitionAltitude = plan.performanceData.transitionAltitude.get();

    const predictions =
      isActivePlan &&
      mcdu.guidanceController.vnavDriver.mcduProfile &&
      mcdu.guidanceController.vnavDriver.mcduProfile.isReadyToDisplay
        ? mcdu.guidanceController.vnavDriver.mcduProfile.waypointPredictions
        : null;

    const fpIndex = isActivePlan ? FlightPlanIndex.Active : FlightPlanIndex.FirstSecondary;

    // No optimum step in the secondary flight plan, none computed while a time constraint exists
    const rtaExists = isActivePlan && plan.performanceData.timeConstraint.get() !== null;
    const optimumStep = isActivePlan && !rtaExists ? CDUStepAltsPage.computeOptimumStep(mcdu) : null;
    const optimumStepLine = formatOptStepLine(legsWithSteps.length > 0, optimumStep, rtaExists, (pounds) =>
      (NXUnits.poundsToUser(pounds) / 1000).toFixed(1),
    );
    const stepLine = (index: number) =>
      CDUStepAltsPage.formatStepClimbLine(
        mcdu,
        legsWithSteps,
        index,
        predictions,
        transitionAltitude,
        fpIndex,
        optimumStep,
      );

    mcdu.setTemplate([
      [
        `${!isActivePlan ? 'SEC ' : ''}STEP ALTS {small}FROM{end} {green}FL${plan.performanceData.cruiseFlightLevel.get() ?? ''}{end}`,
      ],
      ['\xa0ALT\xa0/\xa0WPT', 'DIST\xa0TIME'],
      stepLine(0),
      [''],
      stepLine(1),
      [''],
      stepLine(2),
      [''],
      stepLine(3),
      optimumStepLine.label,
      optimumStepLine.data,
      [''],
      ['<RETURN'],
    ]);

    for (let i = 0; i < 4; i++) {
      mcdu.onLeftInput[i] = (value, scratchpadCallback) =>
        CDUStepAltsPage.tryAddOrUpdateCruiseStepFromLeftInput(
          mcdu,
          scratchpadCallback,
          legsWithSteps,
          i,
          value,
          forPlan,
        );
    }

    mcdu.onLeftInput[4] = (value, scratchpadCallback) => {
      if (value === Keypad.clrValue && CDUStepAltsPage.optimumStepAltitude !== null) {
        CDUStepAltsPage.optimumStepAltitude = null;
      } else if (value === '' && optimumStep?.optimum) {
        CDUStepAltsPage.insertOptimumStep(mcdu, optimumStep.target, optimumStep.optimum, scratchpadCallback);
      } else {
        mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
        scratchpadCallback();
      }
    };

    mcdu.onLeftInput[5] = () => {
      CDUStepAltsPage.Return();
    };

    mcdu.onRightInput[0] = () => {};
    mcdu.onRightInput[1] = () => {};
    mcdu.onRightInput[2] = () => {};
    mcdu.onRightInput[3] = () => {};
    mcdu.onRightInput[4] = () => {};
    mcdu.onRightInput[5] = () => {};
  }

  static formatFl(altitude: number, transAlt: number) {
    if (transAlt >= 100 && altitude > transAlt) {
      return 'FL' + Math.round(altitude / 100);
    }
    return altitude;
  }

  /**
   * The optimum step point of the active flight plan: for the first step ahead when it is a step climb, or without a
   * step, for the step altitude entered alone. Computed when the F-PLN, CRZ FL, CI, ZFW and ZFWCG are entered.
   */
  static computeOptimumStep(mcdu: LegacyFmsPageInterface): OptimumStepState | null {
    const plan = mcdu.getFlightPlan(FlightPlanIndex.Active);
    const performanceData = plan.performanceData;
    const profile = mcdu.guidanceController?.vnavDriver.mcduProfile;
    const cruiseLevel = performanceData.cruiseFlightLevel.get();
    if (cruiseLevel !== CDUStepAltsPage.optimumStepCruiseLevel) {
      CDUStepAltsPage.optimumStepAltitude = null;
    }
    if (!profile || cruiseLevel === null) {
      return null;
    }
    const context = stepProfileContext(profile, plan.allLegs, plan.activeLegIndex);
    const target = context ? optimumStepTarget(context, cruiseLevel * 100, CDUStepAltsPage.optimumStepAltitude) : null;
    if (!context || !target) {
      return null;
    }

    const costIndex = performanceData.costIndex.get();
    const zeroFuelWeight = performanceData.zeroFuelWeight.get();
    if (costIndex === null || zeroFuelWeight === null || performanceData.zeroFuelWeightCenterOfGravity.get() === null) {
      return { target, optimum: null };
    }
    // Design choice: the measured temperature and wind in cruise; before it, the CRZ TEMP entry and no wind
    const inCruise = mcdu.flightPhaseManager.phase === FmgcFlightPhase.Cruise;
    const tropopause = mcdu.tropo ?? ISA_TROPOPAUSE_ALTITUDE;
    const cruiseTemperature = performanceData.cruiseTemperature.get();
    const isaDeviation = inCruise
      ? A32NX_Util.getIsaTempDeviation()
      : cruiseTemperature !== null
        ? isaDeviationAt(cruiseLevel * 100, cruiseTemperature, tropopause)
        : 0;
    const optimum = CDUStepAltsPage.optimumStepCache.get(context, target, {
      costIndex,
      zeroFuelWeight,
      isaDeviation,
      headwind: inCruise ? -SimVar.GetSimVarValue('AIRCRAFT WIND Z', 'knots') : 0,
      tropopause,
    });
    return { target, optimum };
  }

  /** Inserts the optimum step point in place of the step it optimises, a distance before the next waypoint */
  static insertOptimumStep(
    mcdu: LegacyFmsPageInterface,
    target: OptimumStepTarget,
    optimum: OptimumStep,
    scratchpadCallback: () => void,
  ) {
    const plan = mcdu.getFlightPlan(FlightPlanIndex.Active);
    const waypointDistances = waypointDistancesAhead(
      mcdu.guidanceController?.vnavDriver.mcduProfile?.waypointPredictions,
      plan.activeLegIndex,
    );
    const anchor = optimumStepAnchor(optimum.distance, waypointDistances, plan.allLegs, target.stepLegIndex);
    if (!anchor) {
      mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
      scratchpadCallback();
      return;
    }
    if (target.stepLegIndex !== null && target.stepLegIndex !== anchor.legIndex) {
      mcdu.flightPlanService.removeCruiseStep(target.stepLegIndex, FlightPlanIndex.Active);
    }
    mcdu.flightPlanService.addOrUpdateCruiseStep(
      anchor.legIndex,
      target.toAltitude,
      FlightPlanIndex.Active,
      anchor.distanceBeforeTermination,
      true,
    );
    CDUStepAltsPage.optimumStepAltitude = null;
  }

  // TODO: I think it should not allow entries of step climbs after step descents, but I'm not sure if it rejects it entirely
  // or gives you an IGNORED.
  /**
   * @param legsWithSteps {FlightPlanLeg[]}
   */
  static formatStepClimbLine(
    mcdu: LegacyFmsPageInterface,
    legsWithSteps: FlightPlanLeg[],
    index: number,
    predictions: Map<number, VerticalWaypointPrediction>,
    transitionAltitude: number,
    forPlan: FlightPlanIndex,
    optimumStep: OptimumStepState | null,
  ) {
    if (!legsWithSteps || index > legsWithSteps.length) {
      return [''];
    } else if (index === legsWithSteps.length) {
      return ['{cyan}[\xa0\xa0\xa0]/[\xa0\xa0\xa0\xa0\xa0]{end}'];
    } else {
      const waypoint = legsWithSteps[index];
      const step = legsWithSteps[index].cruiseStep;

      const prediction = predictions ? predictions.get(step.waypointIndex) : null;

      // Cases:
      // 1. Step above MAX FL (on PROG page)
      // 2. IGNORED (If too close to T/D or before T/C)
      // 3. STEP AHEAD
      // 4. Distance and time<

      // An inserted optimum step for which a better point is now found
      const isNoLongerOptimal =
        step.isOptimum === true &&
        optimumStep?.target.isOptimum === true &&
        optimumStep.optimum !== null &&
        optimumStep.target.toAltitude === step.toAltitude;

      let lastColumn = '----\xa0----';
      if (this.checkIfStepAboveMaxFl(mcdu, step.toAltitude)) {
        lastColumn = 'ABOVE\xa0MAX[s-text]';
      } else if (step.isIgnored) {
        lastColumn = 'IGNORED\xa0[s-text]';
      } else if (isNoLongerOptimal) {
        lastColumn = 'NO\xa0OPTIMAL[s-text]';
      } else if (prediction) {
        // An optimum step point is before its waypoint
        const distanceFromAircraft = prediction.distanceFromAircraft - step.distanceBeforeTermination;
        const profile = mcdu.guidanceController?.vnavDriver.mcduProfile;
        const secondsFromPresent = profile
          ? stepPointSecondsFromPresent(profile, prediction.distanceFromStart, step.distanceBeforeTermination)
          : prediction.secondsFromPresent;

        if (Number.isFinite(distanceFromAircraft) && Number.isFinite(secondsFromPresent)) {
          if (distanceFromAircraft < 20) {
            lastColumn = 'STEP\xa0AHEAD[s-text]';
          } else {
            const distanceCell = '{green}' + Math.round(distanceFromAircraft).toFixed(0) + '{end}';
            const timeCell = `{green}${mcdu.getTimePrediction(secondsFromPresent, forPlan)}[s-text]{end}`;

            lastColumn = distanceCell + '\xa0' + timeCell;
          }
        }
      }

      return [
        '{cyan}' +
          CDUStepAltsPage.formatFl(step.toAltitude, transitionAltitude) +
          '/' +
          (step.isOptimum ? '(OPT)' : waypoint.ident) +
          '{end}',
        lastColumn,
      ];
    }
  }

  static tryAddOrUpdateCruiseStepFromLeftInput(
    mcdu: LegacyFmsPageInterface,
    scratchpadCallback: () => void,
    stepLegs: FlightPlanLeg[],
    index: number,
    input: string,
    forPlan: FlightPlanIndex,
  ) {
    if (index < stepLegs.length) {
      this.onClickExistingStepClimb(mcdu, scratchpadCallback, stepLegs, index, input, forPlan);

      return;
    }

    // Create new step altitude
    if (stepLegs.length >= 4) {
      mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
      scratchpadCallback();
      return;
    }

    const splitInputs = input.split('/');
    const rawAltitudeInput = splitInputs[0];
    const rawIdentInput = splitInputs[1];

    if (!rawIdentInput) {
      // A step altitude alone: the FMS searches its optimum step point (only without a step in the flight plan)
      const cruiseLevel = mcdu.getFlightPlan(forPlan).performanceData.cruiseFlightLevel.get();
      const optimumAltitude = this.tryParseAltitude(rawAltitudeInput);
      if (!optimumAltitude) {
        mcdu.setScratchpadMessage(NXSystemMessages.formatError);
        scratchpadCallback();
      } else if (
        forPlan !== FlightPlanIndex.Active ||
        stepLegs.length > 0 ||
        cruiseLevel === null ||
        optimumAltitude - cruiseLevel * 100 < 1000
      ) {
        mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
        scratchpadCallback();
      } else {
        CDUStepAltsPage.optimumStepAltitude = optimumAltitude;
        CDUStepAltsPage.optimumStepCruiseLevel = cruiseLevel;
        if (CDUStepAltsPage.checkIfStepAboveMaxFl(mcdu, optimumAltitude)) {
          mcdu.addMessageToQueue(NXSystemMessages.stepAboveMaxFl);
        }
      }
      return;
    }

    const alt = this.tryParseAltitude(rawAltitudeInput);
    if (!alt) {
      mcdu.setScratchpadMessage(NXSystemMessages.formatError);
      scratchpadCallback();
      return;
    }

    const plan = mcdu.getFlightPlan(forPlan);
    const legIndex = plan.findLegIndexByFixIdent(rawIdentInput);

    if (legIndex < 0) {
      // Waypoint ident not found in flightplan
      mcdu.setScratchpadMessage(NXSystemMessages.formatError);
      scratchpadCallback();
      return;
    } else if (legIndex < plan.activeLegIndex) {
      // Don't allow step on FROM waypoint
      mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
      scratchpadCallback();
      return;
    } else if (!this.checkStepInsertionRules(stepLegs, legIndex, alt, plan.performanceData.cruiseFlightLevel.get())) {
      // Step too small or step descent after step climb
      mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
      scratchpadCallback();
      return;
    }

    const leg = plan.legElementAt(legIndex);

    // It is not allowed to have two steps on the same waypoint (FCOM)
    if (leg.cruiseStep !== undefined) {
      mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
      scratchpadCallback();
      return;
    }

    mcdu.flightPlanService.addOrUpdateCruiseStep(legIndex, alt, forPlan);
    CDUStepAltsPage.optimumStepAltitude = null;

    if (CDUStepAltsPage.checkIfStepAboveMaxFl(mcdu, alt)) {
      mcdu.addMessageToQueue(NXSystemMessages.stepAboveMaxFl);
    }
  }

  static tryParseAltitude(altitudeInput) {
    if (!altitudeInput) {
      return false;
    }

    const match = altitudeInput.match(/^(FL)?(\d{1,3})$/);

    if (!match) {
      return false;
    }

    const altValue = parseInt(match[2]) * 100;
    if (altValue < 1000 || altValue > 39000) {
      return false;
    }

    return altValue;
  }

  static onClickExistingStepClimb(
    mcdu: LegacyFmsPageInterface,
    scratchpadCallback: () => void,
    stepLegs: FlightPlanLeg[],
    index: number,
    input: string,
    forPlan: FlightPlanIndex,
  ) {
    const plan = mcdu.getFlightPlan(forPlan);

    const stepWaypoint = stepLegs[index];
    const clickedStep = stepWaypoint.cruiseStep;

    if (input === Keypad.clrValue) {
      mcdu.flightPlanService.removeCruiseStep(clickedStep.waypointIndex, forPlan);

      return true;
    }

    // Edit step
    const splitInputs = input.split('/');
    if (splitInputs.length === 1 || (splitInputs.length === 2 && splitInputs[1] === '')) {
      // Altitude
      const altitude = this.tryParseAltitude(splitInputs[0]);
      if (!altitude) {
        mcdu.setScratchpadMessage(NXSystemMessages.formatError);
        scratchpadCallback();
        return;
      } else if (
        !this.checkStepInsertionRules(
          stepLegs,
          clickedStep.waypointIndex,
          clickedStep.toAltitude,
          plan.performanceData.cruiseFlightLevel.get(),
        )
      ) {
        // Step too small or step descent after step climb
        mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
        scratchpadCallback();
        return;
      }

      mcdu.flightPlanService.addOrUpdateCruiseStep(clickedStep.waypointIndex, altitude, forPlan);

      if (this.checkIfStepAboveMaxFl(mcdu, altitude)) {
        mcdu.addMessageToQueue(NXSystemMessages.stepAboveMaxFl);
      }
    } else if (splitInputs.length === 2) {
      const rawAltitudeInput = splitInputs[0];
      const rawIdentInput = splitInputs[1];

      const legIndex = plan.findLegIndexByFixIdent(rawIdentInput);

      if (legIndex < 0) {
        // Waypoint ident not found in flightplan
        mcdu.setScratchpadMessage(NXSystemMessages.formatError);
        scratchpadCallback();
        return;
      }

      if (rawAltitudeInput === '') {
        // /Waypoint
        mcdu.flightPlanService.addOrUpdateCruiseStep(legIndex, clickedStep.toAltitude, forPlan);
        mcdu.flightPlanService.removeCruiseStep(clickedStep.waypointIndex, forPlan);
      } else {
        // Altitude/waypoint
        const altitude = this.tryParseAltitude(rawAltitudeInput);

        if (!altitude) {
          mcdu.setScratchpadMessage(NXSystemMessages.formatError);
          scratchpadCallback();
          return;
        }

        mcdu.flightPlanService.addOrUpdateCruiseStep(legIndex, altitude, forPlan);
        mcdu.flightPlanService.removeCruiseStep(clickedStep.waypointIndex, forPlan);

        if (this.checkIfStepAboveMaxFl(mcdu, altitude)) {
          mcdu.addMessageToQueue(NXSystemMessages.stepAboveMaxFl);
        }
      }
    } else if (splitInputs.length === 3) {
      // Altitude/place/distance or
      // /Place/distance
      mcdu.setScratchpadMessage(NXFictionalMessages.notYetImplemented);
      scratchpadCallback();
      return;
    }
  }

  static checkIfStepAboveMaxFl(mcdu, altitude) {
    const maxFl = mcdu.getMaxFlCorrected();
    return Number.isFinite(maxFl) && altitude > maxFl * 100;
  }

  /**
   * Check a couple of rules about insertion of step:
   * - Minimum step size is 1000ft
   * - S/C follows step descent
   * TODO: It's possible that the insertion of a step in between already inserted steps causes a step descent after step climb
   * I don't know how the plane handles this.
   */
  static checkStepInsertionRules(
    stepLegs: FlightPlanLeg[],
    insertAtIndex: number,
    toAltitude: number,
    cruiseLevel: number,
  ) {
    let altitude = cruiseLevel * 100;
    let doesHaveStepDescent = false;

    let i = 0;
    for (; i < stepLegs.length; i++) {
      const step = stepLegs[i].cruiseStep;
      if (step.waypointIndex > insertAtIndex) {
        break;
      }

      const stepAltitude = step.toAltitude;
      if (stepAltitude < altitude) {
        doesHaveStepDescent = true;
      }

      altitude = stepAltitude;
    }

    const isStepSizeValid = Math.abs(toAltitude - altitude) >= 1000;
    if (!isStepSizeValid) {
      return false;
    }

    const isClimbVsDescent = toAltitude > altitude;
    if (!isClimbVsDescent) {
      doesHaveStepDescent = true;
    } else if (doesHaveStepDescent) {
      return false;
    }

    if (i < stepLegs.length) {
      const stepAfter = stepLegs[i].cruiseStep;
      const isStepSizeValid = Math.abs(stepAfter.toAltitude - toAltitude) >= 1000;
      const isClimbVsDescent = stepAfter.toAltitude > toAltitude;

      const isClimbAfterDescent = isClimbVsDescent && doesHaveStepDescent;

      return isStepSizeValid && !isClimbAfterDescent;
    }

    return true;
  }
}
