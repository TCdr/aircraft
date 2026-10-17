// @ts-strict-ignore
// Copyright (c) 2021-2023, 2025 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { CDUFlightPlanPage } from './A320_Neo_CDU_FlightPlanPage';
import { CDULateralRevisionPage } from './A320_Neo_CDU_LateralRevisionPage';
import { NXSystemMessages } from '../messages/NXSystemMessages';
import { MagVar, NXUnits, TurnDirection } from '@flybywiresim/fbw-sdk';
import { LegacyFmsPageInterface } from '../legacy/LegacyFmsPageInterface';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { FlightPlanLeg, isDiscontinuity } from '@fmgc/flightplanning/legs/FlightPlanLeg';
import { HoldData } from '@fmgc/flightplanning/data/flightplan';
import { presentPositionComputedHold } from '@fmgc/flightplanning/plans/PresentPositionHold';
import { findDatabaseHold } from '@fmgc/flightplanning/plans/DatabaseHold';
import { holdEntryPrediction, holdLastExit } from '@fmgc/flightplanning/fuel/HoldLastExit';
import { ADIRS } from '../legacy/A32NX_Core/Adirs';

/** Pounds per tonne (the VNAV predictions give the EFOB in pounds) */
const POUNDS_PER_TONNE = 2204.625;

const HoldType = Object.freeze({
  Computed: 0,
  Database: 1,
  Modified: 2,
});

export class CDUHoldAtPage {
  static ShowPage(mcdu: LegacyFmsPageInterface, waypointIndexFP, forPlan, inAlternate) {
    const targetPlan = inAlternate ? mcdu.getAlternateFlightPlan(forPlan) : mcdu.getFlightPlan(forPlan);
    const waypoint = targetPlan.legElementAt(waypointIndexFP);

    if (!waypoint) {
      return CDUFlightPlanPage.ShowPage(mcdu);
    }

    const editingHm = waypoint.type === 'HM'; // HM

    if (editingHm) {
      CDUHoldAtPage.DrawPage(mcdu, waypointIndexFP, waypointIndexFP, forPlan, inAlternate);
    } else {
      const editingHx = waypoint.isHX();
      const alt = waypoint.definition.altitude1
        ? waypoint.definition.altitude1
        : SimVar.GetSimVarValue('INDICATED ALTITUDE', 'feet');

      let defaultHold: HoldData;
      let modifiedHold: HoldData | undefined;
      if (editingHx) {
        defaultHold = waypoint.defaultHold;
        modifiedHold = waypoint.modifiedHold;
      } else {
        const previousLeg = targetPlan.maybeElementAt(waypointIndexFP - 1);

        let inboundMagneticCourse = 100;
        if (previousLeg && previousLeg.isDiscontinuity === false && previousLeg.isXF()) {
          inboundMagneticCourse = Avionics.Utils.computeGreatCircleHeading(
            previousLeg.terminationWaypoint().location,
            waypoint.terminationWaypoint().location,
          );
        }

        defaultHold = {
          inboundMagneticCourse,
          turnDirection: TurnDirection.Right,
          time: alt <= 14000 ? 1 : 1.5,
          type: HoldType.Computed,
        };

        const fix = waypoint.terminationWaypoint();
        // The database hold of the fix (see DatabaseHold.ts), else the computed hold
        findDatabaseHold(
          fix,
          targetPlan.originAirport?.ident,
          targetPlan.destinationAirport?.ident,
          alt,
          inboundMagneticCourse,
        )
          .then((databaseHold) => {
            if (databaseHold) {
              defaultHold = databaseHold;
            }

            CDUHoldAtPage.addOrEditManualHold(
              mcdu,
              waypointIndexFP,
              // eslint-disable-next-line prefer-object-spread
              Object.assign({}, defaultHold),
              modifiedHold,
              defaultHold,
              forPlan,
              inAlternate,
            );
          })
          .catch(() => {
            CDUHoldAtPage.addOrEditManualHold(
              mcdu,
              waypointIndexFP,
              // eslint-disable-next-line prefer-object-spread
              Object.assign({}, defaultHold),
              modifiedHold,
              defaultHold,
              forPlan,
              inAlternate,
            );
          });
        return;
      }

      CDUHoldAtPage.addOrEditManualHold(
        mcdu,
        waypointIndexFP,
        // eslint-disable-next-line prefer-object-spread
        Object.assign({}, defaultHold),
        modifiedHold,
        defaultHold,
        forPlan,
        inAlternate,
      );
    }
  }

  /**
   * HOLD at PPOS (see PresentPositionHold.ts): a temporary flight plan with the computed hold at the aircraft position,
   * on the aircraft track. Without a valid aircraft position: A/C POSITION INVALID.
   */
  static ShowPresentPositionPage(mcdu: LegacyFmsPageInterface) {
    const latitude = ADIRS.getLatitude();
    const longitude = ADIRS.getLongitude();
    const trueTrack = ADIRS.getTrueTrack();
    if (!latitude.isNormalOperation() || !longitude.isNormalOperation() || !trueTrack.isNormalOperation()) {
      mcdu.setScratchpadMessage(NXSystemMessages.acPositionInvalid);
      return;
    }

    const ppos = { lat: latitude.value, long: longitude.value };
    const magVar = MagVar.get(ppos.lat, ppos.long);
    const magneticTrack = magVar === null ? trueTrack.value : MagVar.trueToMagnetic(trueTrack.value, magVar);
    const computedHold = presentPositionComputedHold(
      magneticTrack,
      SimVar.GetSimVarValue('INDICATED ALTITUDE', 'feet'),
    );

    mcdu.flightPlanService
      .holdAtPresentPosition(ppos, trueTrack.value, { ...computedHold }, computedHold)
      .then((holdIndex) => {
        // RETURN / ERASE go back to the LAT REV at PPOS (the PPOS waypoint before the hold)
        CDUHoldAtPage.DrawPage(mcdu, holdIndex, holdIndex - 1, FlightPlanIndex.Active, false);
      })
      .catch((e) => {
        console.error(e);
        mcdu.logTroubleshootingError(e);
      });
  }

  static addOrEditManualHold(
    mcdu: LegacyFmsPageInterface,
    atIndex,
    desiredHold: HoldData,
    modifiedHold: HoldData | undefined,
    defaultHold: HoldData,
    planIndex,
    alternate,
  ) {
    mcdu.flightPlanService
      .addOrEditManualHold(atIndex, desiredHold, modifiedHold, defaultHold, planIndex, alternate)
      .then((holdIndex) => {
        CDUHoldAtPage.DrawPage(mcdu, holdIndex, atIndex, planIndex, alternate);
      });
  }

  static DrawPage(mcdu: LegacyFmsPageInterface, waypointIndexFP, originalFpIndex, forPlan, inAlternate) {
    mcdu.clearDisplay();
    mcdu.page.Current = mcdu.page.HoldAtPage;

    const tmpy = forPlan === FlightPlanIndex.Active && mcdu.flightPlanService.hasTemporary;
    const targetPlan = inAlternate ? mcdu.getAlternateFlightPlan(forPlan) : mcdu.getFlightPlan(forPlan);

    const leg = targetPlan.legElementAt(waypointIndexFP);

    const speed = waypointIndexFP === mcdu.holdIndex && mcdu.holdSpeedTarget > 0 ? mcdu.holdSpeedTarget : 180;

    const modifiedHold = leg.modifiedHold;
    const defaultHold = leg.defaultHold;
    const currentHold = CDUHoldAtPage.computeDesiredHold(leg);

    // TODO this doesn't account for wind... we really need to access the actual hold leg once the ts/js barrier is broken
    const displayTime = currentHold.time === undefined ? (currentHold.distance * 60) / speed : currentHold.time;
    const displayDistance = currentHold.distance === undefined ? (speed * currentHold.time) / 60 : currentHold.distance;

    const defaultType = defaultHold.type === HoldType.Database ? 'DATABASE' : 'COMPUTED';
    const defaultTitle = `${defaultType}\xa0`;
    const defaultRevert = `${defaultType}}`;

    const ident = leg.ident.replace('T-P', 'PPOS').padEnd(7, '\xa0');
    const rows = [];
    rows.push([
      `${currentHold.type !== HoldType.Modified ? defaultTitle : ''}HOLD\xa0{small}AT{end}\xa0{green}${ident}{end}`,
    ]);
    rows.push(['INB CRS', '', '']);
    rows.push([
      `{${tmpy ? 'yellow' : 'cyan'}}${modifiedHold && modifiedHold.inboundMagneticCourse !== undefined ? '{big}' : '{small}'}${currentHold.inboundMagneticCourse.toFixed(0).padStart(3, '0')}°{end}{end}`,
    ]);
    rows.push(['TURN', currentHold.type === HoldType.Modified ? 'REVERT TO' : '']);
    rows.push([
      `{${tmpy ? 'yellow' : 'cyan'}}${modifiedHold && modifiedHold.turnDirection !== undefined ? '{big}' : '{small}'}${currentHold.turnDirection === TurnDirection.Left ? 'L' : 'R'}{end}`,
      `{cyan}${currentHold.type === HoldType.Modified ? defaultRevert : ''}{end}`,
    ]);
    rows.push(['TIME/DIST']);
    rows.push([
      `{${tmpy ? 'yellow' : 'cyan'}}${modifiedHold && modifiedHold.time !== undefined ? '{big}' : '{small}'}${displayTime.toFixed(1).padStart(4, '\xa0')}{end}/${modifiedHold && modifiedHold.distance !== undefined ? '{big}' : '{small}'}${displayDistance.toFixed(1)}{end}{end}`,
    ]);
    rows.push(['', '', '\xa0LAST EXIT']);
    rows.push(['', '', '{small}UTC\xa0\xa0\xa0FUEL{end}']);
    rows.push(['', '', CDUHoldAtPage.lastExitCell(mcdu, targetPlan, waypointIndexFP, forPlan, tmpy, inAlternate)]);
    rows.push(['']);
    rows.push(['']);
    rows.push([tmpy ? '{amber}{ERASE{end}' : '{RETURN', tmpy ? '{amber}INSERT*{end}' : '', '']);

    mcdu.setTemplate([...rows]);

    // TODO what happens if CLR attemped?
    // change course
    mcdu.onLeftInput[0] = (value, scratchpadCallback) => {
      if (value.match(/^[0-9]{1,3}$/) === null) {
        mcdu.setScratchpadMessage(NXSystemMessages.formatError);
        scratchpadCallback();
        return;
      }
      const magCourse = parseInt(value);
      if (magCourse > 360) {
        mcdu.setScratchpadMessage(NXSystemMessages.entryOutOfRange);
        scratchpadCallback();
        return;
      }

      CDUHoldAtPage.modifyHold(
        mcdu,
        waypointIndexFP,
        leg,
        'inboundMagneticCourse',
        magCourse,
        forPlan,
        inAlternate,
      ).then(() => {
        CDUHoldAtPage.DrawPage(mcdu, waypointIndexFP, originalFpIndex, forPlan, inAlternate);
      });
    };

    // change turn direction
    mcdu.onLeftInput[1] = async (value, scratchpadCallback) => {
      if (value !== 'L' && value !== 'R') {
        mcdu.setScratchpadMessage(NXSystemMessages.formatError);
        scratchpadCallback();
        return;
      }

      await CDUHoldAtPage.modifyHold(
        mcdu,
        waypointIndexFP,
        leg,
        'turnDirection',
        value === 'L' ? TurnDirection.Left : TurnDirection.Right,
        forPlan,
        inAlternate,
      );

      CDUHoldAtPage.DrawPage(mcdu, waypointIndexFP, originalFpIndex, forPlan, inAlternate);
    };

    // change time or distance
    mcdu.onLeftInput[2] = (value, scratchpadCallback) => {
      const m = value.match(/^(([0-9]{0,1}(\.[0-9])?)\/?|\/([0-9]{0,2}(\.[0-9])?))$/);
      if (m === null || m[0].length === 0 || m[0] === '/') {
        mcdu.setScratchpadMessage(NXSystemMessages.formatError);
        scratchpadCallback();
        return;
      }

      const time = m[2];
      const dist = m[4];

      const param = dist ? 'distance' : 'time';
      const newValue = dist ? parseFloat(dist) : parseFloat(time);

      CDUHoldAtPage.modifyHold(mcdu, waypointIndexFP, leg, param, newValue, forPlan, inAlternate).then(() => {
        CDUHoldAtPage.DrawPage(mcdu, waypointIndexFP, originalFpIndex, forPlan, inAlternate);
      });
    };

    // revert to computed/database
    if (currentHold.type === HoldType.Modified) {
      mcdu.onRightInput[1] = async () => {
        mcdu.flightPlanService.revertHoldToComputed(waypointIndexFP);

        CDUHoldAtPage.DrawPage(mcdu, waypointIndexFP, originalFpIndex, forPlan, inAlternate);
      };
    }

    // erase/return
    mcdu.onLeftInput[5] = () => {
      const element = targetPlan.maybeElementAt(originalFpIndex);
      if (isDiscontinuity(element)) {
        // Failsafe
        CDUFlightPlanPage.ShowPage(mcdu, 0, false, forPlan);
        return;
      }

      if (tmpy) {
        mcdu.eraseTemporaryFlightPlan(() => {
          CDULateralRevisionPage.ShowPage(mcdu, element, originalFpIndex, forPlan, inAlternate);
        });
      } else {
        CDULateralRevisionPage.ShowPage(mcdu, element, originalFpIndex, forPlan, inAlternate);
      }
    };

    // insert
    mcdu.onRightInput[5] = () => {
      if (tmpy) {
        mcdu.insertTemporaryFlightPlan(() => {
          CDUFlightPlanPage.ShowPage(mcdu, waypointIndexFP, false, forPlan);
        });
      }
    };
  }

  /**
   * The LAST EXIT UTC / FUEL cell (see HoldLastExit.ts): the time and the fuel on board when the EXTRA fuel of the FUEL
   * PRED page is burnt in the hold, from the arrival at the hold fix (or now, in the hold).
   * Design choice: dashes for a hold of the temporary, secondary or alternate flight plan, whose fuel predictions the FMS
   * does not compute.
   */
  static lastExitCell(
    mcdu: LegacyFmsPageInterface,
    targetPlan,
    holdLegIndex: number,
    forPlan: number,
    tmpy: boolean,
    inAlternate: boolean,
  ): string {
    const dashes = '----\xa0\xa0----';
    if (forPlan !== FlightPlanIndex.Active || tmpy || inAlternate) {
      return dashes;
    }

    const profile = mcdu.guidanceController?.vnavDriver?.mcduProfile;
    const holdFix = profile?.isReadyToDisplay ? profile.waypointPredictions.get(holdLegIndex - 1) : undefined;
    const fob = mcdu.getFOB(FlightPlanIndex.Active);
    const entry = holdEntryPrediction(
      holdLegIndex,
      targetPlan.activeLegIndex,
      fob ?? null,
      holdFix
        ? {
            secondsFromPresent: holdFix.secondsFromPresent,
            fuelOnBoard: holdFix.estimatedFuelOnBoard / POUNDS_PER_TONNE,
          }
        : undefined,
    );
    const predictions = mcdu.getFuelPredComputation(FlightPlanIndex.Active);
    const lastExit = holdLastExit(entry, predictions.extraFuel, predictions.extraTime);
    if (lastExit === null) {
      return dashes;
    }

    const time = mcdu.getTimePrediction(lastExit.secondsFromPresent, FlightPlanIndex.Active);
    const fuel = NXUnits.kgToUser(lastExit.fuelOnBoard).toFixed(1).padStart(4, '\xa0');
    return `{green}${time}\xa0\xa0${fuel}{end}`;
  }

  static computeDesiredHold(/** @type {FlightPlanLeg} */ leg) {
    const modifiedHold = leg.modifiedHold;
    const defaultHold = leg.defaultHold;

    const pilotTimeOrDistance =
      modifiedHold && (modifiedHold.time !== undefined || modifiedHold.distance !== undefined);

    return {
      inboundMagneticCourse:
        modifiedHold && modifiedHold.inboundMagneticCourse !== undefined
          ? modifiedHold.inboundMagneticCourse
          : defaultHold.inboundMagneticCourse,
      turnDirection:
        modifiedHold && modifiedHold.turnDirection !== undefined
          ? modifiedHold.turnDirection
          : defaultHold.turnDirection,
      distance: pilotTimeOrDistance ? modifiedHold.distance : defaultHold.distance,
      time: pilotTimeOrDistance ? modifiedHold.time : defaultHold.time,
      type: modifiedHold !== undefined ? modifiedHold.type : defaultHold.type,
    };
  }

  static async modifyHold(
    mcdu: LegacyFmsPageInterface,
    waypointIndexFP: number,
    waypointData: FlightPlanLeg,
    param: string,
    value: number | string,
    forPlan: number,
    inAlternate: boolean,
  ) {
    if (waypointData.modifiedHold === undefined) {
      waypointData.modifiedHold = {
        inboundMagneticCourse: waypointData.defaultHold.inboundMagneticCourse,
        turnDirection: waypointData.defaultHold.turnDirection,
        time: waypointData.defaultHold.time,
        distance: waypointData.defaultHold.distance,
        type: HoldType.Modified,
      };
    }
    waypointData.modifiedHold.type = HoldType.Modified;

    if (param === 'time') {
      waypointData.modifiedHold.distance = undefined;
    } else if (param === 'distance') {
      waypointData.modifiedHold.time = undefined;
    }

    waypointData.modifiedHold[param] = value;

    await mcdu.flightPlanService.addOrEditManualHold(
      waypointIndexFP,
      CDUHoldAtPage.computeDesiredHold(waypointData),
      waypointData.modifiedHold,
      waypointData.defaultHold,
      forPlan,
      inAlternate,
    );
  }
}
