// @ts-strict-ignore
// Copyright (c) 2021-2023, 2025 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Keypad } from '../legacy/A320_Neo_CDU_Keypad';
import { NXSystemMessages } from '../messages/NXSystemMessages';
import { FmgcFlightPhase } from '@shared/flightphase';
import { LegacyFmsPageInterface } from '../legacy/LegacyFmsPageInterface';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { Column, FormatLine } from '../legacy/A320_Neo_CDU_Format';
import { WaypointEntryUtils } from '@fmgc/flightplanning/WaypointEntryUtils';
import { positionUpdateAtLines } from './PositionMonitorFields';
import { NXUnits } from '@flybywiresim/fbw-sdk';
import { FmsFormatters } from '../legacy/FmsFormatters';
import { ProfilePhase } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import {
  formatReportAltitude,
  formatReportTemperature,
  formatReportWind,
  nextCruiseProfileChange,
} from './ProgressReportFields';
import {
  deselectedSatellitesCell,
  deselectSatellite,
  formatTimeOfDay,
  parsePredictiveEta,
  parseSatelliteNumber,
  PredictiveGpsEntryError,
  predictiveDestinationEtaCell,
  predictivePrimaryLine,
} from './PredictiveGpsFields';

export class CDUProgressPage {
  /** The crew entries of the PREDICTIVE GPS page (PredictiveGpsFields) */
  private static predictiveGps = {
    /** The destination the DEST ETA entry belongs to */
    destinationIdent: null as string | null,
    /** The crew DEST ETA, s of the day, null without one */
    destinationEta: null as number | null,
    /** The crew cleared the DEST ETA: amber boxes until a new entry */
    destinationEtaCleared: false,
    /** The crew reference waypoint and its time (s of the day) */
    waypointIdent: null as string | null,
    waypointEta: null as number | null,
    /** The deselected satellites */
    deselectedSatellites: [] as number[],
  };

  static ShowPage(mcdu: LegacyFmsPageInterface) {
    mcdu.clearDisplay();
    mcdu.page.Current = mcdu.page.ProgressPage;
    mcdu.returnPageCallback = () => {
      CDUProgressPage.ShowPage(mcdu);
    };
    mcdu.activeSystem = 'FMGC';

    const plan = mcdu.getFlightPlan(FlightPlanIndex.Active);

    const flightNo = plan.flightNumber.get() ?? '';
    const cruiseLevel = plan.performanceData.cruiseFlightLevel.get();
    const recMaxFl = mcdu.getMaxFlCorrected();
    const flMaxText = recMaxFl !== null ? `{magenta}FL${recMaxFl.toString()}{end}` : `-----`;
    const optFl = mcdu.optimumFlightLevel;
    const flOpt = optFl !== null ? `{green}FL${optFl.toFixed(0)}{end}` : '-----';
    const gpsPrimary = mcdu.navigation.getGpsPrimary();
    const gpsPrimaryStatus = mcdu.navigation.getGpsPrimary() ? '{green}GPS PRIMARY{end}' : '';
    let flCrz = '-----';
    let vDevCell = '';
    switch (mcdu.flightPhaseManager.phase) {
      case FmgcFlightPhase.Preflight:
      case FmgcFlightPhase.Takeoff: {
        if (cruiseLevel) {
          flCrz = 'FL' + cruiseLevel.toFixed(0).padStart(3, '0') + '[color]cyan';
        }
        break;
      }
      case FmgcFlightPhase.Climb: {
        const alt = Math.round(Simplane.getAutoPilotSelectedAltitudeLockValue('feet') / 100);
        const altCtn = Math.round(mcdu.constraintAlt / 100);
        if (!cruiseLevel && !mcdu._activeCruiseFlightLevelDefaulToFcu) {
          flCrz =
            'FL' +
            (altCtn && alt > altCtn ? altCtn.toFixed(0).padStart(3, '0') : alt.toFixed(0).padStart(3, '0')) +
            '[color]cyan';
        } else {
          flCrz = 'FL' + cruiseLevel.toFixed(0).padStart(3, '0') + '[color]cyan';
        }
        break;
      }
      case FmgcFlightPhase.Cruise: {
        // TODO check if this is correct
        // We can get here by taking off without FROM/TO entered, and climbing to the FCU altitude (which will then be used as cruise altitude)
        // to enter the cruise phase. We then enter a new FROM/TO which resets the cruise altitude, but I don't know if it puts us in the CLB phase
        // or keeps us in CRZ.
        if (cruiseLevel) {
          flCrz = 'FL' + cruiseLevel.toFixed(0).padStart(3, '0') + '[color]cyan';
        }
        break;
      }
      case FmgcFlightPhase.Descent: {
        const vDev = mcdu.guidanceController.vnavDriver.getLinearDeviation();
        let vDevFormattedNumber = '{small}-----{end}';

        if (vDev && isFinite(vDev)) {
          const paddedVdev = (10 * Math.round(vDev / 10)).toFixed(0).padStart(4, '\xa0');
          const vDevSign = vDev > 0 ? '+' : ' ';
          const extraSpace = paddedVdev.length > 4 ? '' : '\xa0';

          vDevFormattedNumber = '{green}' + extraSpace + vDevSign + paddedVdev + '{end}';
        }

        vDevCell = '{small}VDEV={end}' + vDevFormattedNumber + '{small}FT{end}';
      }
    }
    let flightPhase;
    switch (mcdu.flightPhaseManager.phase) {
      case FmgcFlightPhase.Preflight:
      case FmgcFlightPhase.Takeoff:
        flightPhase = 'TO';
        break;
      case FmgcFlightPhase.Climb:
        flightPhase = 'CLB';
        break;
      case FmgcFlightPhase.Cruise:
        flightPhase = 'CRZ';
        break;
      case FmgcFlightPhase.Descent:
        flightPhase = 'DES';
        break;
      case FmgcFlightPhase.Approach:
        flightPhase = 'APPR';
        break;
      case FmgcFlightPhase.GoAround:
        flightPhase = 'GA';
        break;
      default:
        flightPhase = '';
        break;
    }

    mcdu.onLeftInput[0] = (value, scratchpadCallback) => {
      if (mcdu.trySetCruiseFlCheckInput(value, FlightPlanIndex.Active)) {
        CDUProgressPage.ShowPage(mcdu);
      } else {
        scratchpadCallback();
      }
    };
    mcdu.leftInputDelay[1] = () => {
      return mcdu.getDelaySwitchPage();
    };
    mcdu.onLeftInput[1] = () => {
      CDUProgressPage.ShowReportPage(mcdu);
    };
    mcdu.leftInputDelay[4] = () => {
      return mcdu.getDelaySwitchPage();
    };
    mcdu.onLeftInput[4] = () => {
      CDUProgressPage.ShowPredictiveGPSPage(mcdu);
    };

    let progBearingDist = '{small}\xa0---°\xa0/----.-{end}';
    let progWaypoint = '[\xa0\xa0\xa0\xa0\xa0]';
    if (mcdu.progWaypointIdent !== undefined) {
      progWaypoint = mcdu.progWaypointIdent.padEnd(7, '\xa0');
      if (mcdu.progBearing > 0 && mcdu.progDistance > 0) {
        const distDigits = mcdu.progDistance > 9999 ? 0 : 1;
        progBearingDist = `{small}{green}\xa0${mcdu.progBearing.toFixed(0).padStart(3, '0')}°\xa0/${mcdu.progDistance.toFixed(distDigits).padStart(3)}{end}{end}`;
      }
    }
    // the actual query takes long enough...
    mcdu.rightInputDelay[3] = () => 0;
    mcdu.onRightInput[3] = (input, scratchpadCallback) => {
      mcdu.trySetProgWaypoint(input, (success) => {
        if (!success) {
          scratchpadCallback();
        }

        CDUProgressPage.ShowPage(mcdu);
      });
    };

    // POSITION UPDATE AT [3L], CONFIRM UPDATE AT [3R] (A320 FCOM DSC-22_20-30-10-18, see PositionMonitorFields)
    if (gpsPrimary) {
      mcdu.pendingPositionUpdate = null;
    }
    const [positionUpdateLabel, positionUpdateData] = positionUpdateAtLines(gpsPrimary, mcdu.pendingPositionUpdate);
    mcdu.onLeftInput[2] = (input, scratchpadCallback) => {
      if (gpsPrimary) {
        mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
        scratchpadCallback();
        return;
      }
      if (input === Keypad.clrValue) {
        mcdu.pendingPositionUpdate = null;
        CDUProgressPage.ShowPage(mcdu);
        return;
      }
      WaypointEntryUtils.getOrCreateWaypoint(mcdu, input, false, 'ENTRY')
        .then((fix) => {
          if (!fix) {
            mcdu.setScratchpadMessage(NXSystemMessages.notInDatabase);
            scratchpadCallback();
            return;
          }
          mcdu.pendingPositionUpdate = { ident: fix.ident, location: fix.location };
          CDUProgressPage.ShowPage(mcdu);
        })
        .catch((err) => {
          // Rethrow if error is not an FMS message to display
          if (err.type === undefined) {
            throw err;
          }
          mcdu.showFmsErrorMessage(err.type);
          scratchpadCallback();
        });
    };
    mcdu.onRightInput[2] = (_input, scratchpadCallback) => {
      const pending = mcdu.pendingPositionUpdate;
      if (pending === null) {
        return;
      }
      // "When the aircraft position is computed based on GPIRS, [...] NOT ALLOWED" (a320_fcom.txt l.14784-14786)
      if (!mcdu.navigation.updatePositionAt(pending.location)) {
        mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
        scratchpadCallback();
      }
      mcdu.pendingPositionUpdate = null;
      CDUProgressPage.ShowPage(mcdu);
    };

    let rnpCell = '{white}----{end}';
    const rnpSize = mcdu.navigation.requiredPerformance.manualRnp ? 'big' : 'small';
    const rnp = mcdu.navigation.requiredPerformance.activeRnp;
    // TODO check 2 decimal cut-off
    if (rnp !== undefined) {
      if (rnp > 1) {
        rnpCell = rnp.toFixed(1).padStart(4);
      } else {
        rnpCell = rnp.toFixed(2);
      }
    }

    mcdu.onLeftInput[5] = (input, scratchpadCallback) => {
      if (input === Keypad.clrValue) {
        mcdu.navigation.requiredPerformance.clearPilotRnp();
        return CDUProgressPage.ShowPage(mcdu);
      }

      const match = input.match(/^\d{1,2}(\.\d{1,2})?$/);
      if (match === null) {
        mcdu.setScratchpadMessage(NXSystemMessages.formatError);
        scratchpadCallback();
        return;
      }

      const rnp = parseFloat(input);
      if (rnp < 0.01 || rnp > 20) {
        mcdu.setScratchpadMessage(NXSystemMessages.entryOutOfRange);
        scratchpadCallback();
        return;
      }

      mcdu.navigation.requiredPerformance.setPilotRnp(rnp);
      CDUProgressPage.ShowPage(mcdu);
    };

    let anpCell = '{white}----{end}';
    const anp = mcdu.navigation.currentPerformance;
    // TODO check 2 decimal cut-off
    if (anp !== undefined) {
      if (anp > 1) {
        anpCell = anp.toFixed(1).padStart(4);
      } else {
        anpCell = anp.toFixed(2);
      }
    }

    mcdu.setTemplate([
      [...FormatLine(new Column(11, flightPhase, Column.green, { alignRight: true }), new Column(13, flightNo))],
      ['\xa0' + 'CRZ\xa0', 'OPT\xa0\xa0\xa0\xa0REC MAX'],
      [flCrz, flOpt + '\xa0\xa0\xa0\xa0' + flMaxText + '\xa0'],
      [''],
      ['<REPORT', vDevCell],
      positionUpdateLabel,
      positionUpdateData,
      ['\xa0\xa0BRG / DIST'],
      [progBearingDist, `{small}{white}TO{end}{end}\xa0{cyan}${progWaypoint}{end}`],
      ['\xa0PREDICTIVE'],
      ['<GPS', gpsPrimaryStatus],
      ['REQUIRED', 'ESTIMATED', 'ACCUR{sp}'],
      [
        `{cyan}{${rnpSize}}${rnpCell}NM{end}{end}`,
        `{green}{small}${anpCell}NM{end}{end}`,
        `{green}${mcdu.navigation.accuracyHigh.get() ? 'HIGH' : 'LOW\xa0'}{end}`,
      ],
    ]);

    // regular update due to showing dynamic data on this page
    mcdu.SelfPtr = setTimeout(() => {
      if (mcdu.page.Current === mcdu.page.ProgressPage) {
        CDUProgressPage.ShowPage(mcdu);
      }
    }, mcdu.PageTimeout.Default);
  }

  /**
   * The REPORT page (A320 FCOM DSC-22_20-50-10-28 REPORT PAGE, a320_fcom.txt l.21408-21469, see ProgressReportFields):
   * no data can be inserted or modified on it (l.21469).
   */
  static ShowReportPage(mcdu: LegacyFmsPageInterface) {
    const plan = mcdu.flightPlanService.active;

    mcdu.clearDisplay();
    mcdu.page.Current = mcdu.page.ProgressPageReport;

    const transitionAltitude = plan.performanceData.transitionAltitude.get();
    const transitionLevel = plan.performanceData.transitionLevel.get();
    const formatAltitude = (altitude: number, descending: boolean) =>
      formatReportAltitude(altitude, descending, transitionAltitude, transitionLevel);

    // OVHD: the last sequenced waypoint, its time and altitude, SAT, wind and FOB recorded at the sequencing
    const overhead = mcdu.overheadWaypointRecorder.record;
    let overheadCell = '';
    let overheadUtcCell = '';
    let overheadAltCell = '';
    let satCell = '';
    let windCell = '';
    let fobCell = '';
    if (overhead !== null) {
      overheadCell = overhead.ident;
      overheadUtcCell = FmsFormatters.milisecondsTohhmm(overhead.utcMs);
      overheadAltCell = overhead.altitude !== null ? formatAltitude(overhead.altitude, overhead.descending) : '-----';
      satCell = formatReportTemperature(overhead.staticAirTemperature);
      windCell = formatReportWind(overhead.windDirection, overhead.windSpeed);
      fobCell = overhead.fob !== null ? overhead.fob.toFixed(1) : '---.-';
    }

    // TO and NEXT: the predicted time and altitude, the same as on the F-PLN pages (l.21434-21440)
    const fmsGeometryProfile = mcdu.guidanceController?.vnavDriver.mcduProfile;
    const predictions = fmsGeometryProfile?.isReadyToDisplay ? fmsGeometryProfile.waypointPredictions : null;
    const predictionCells = (legIndex: number): [string, string] => {
      const prediction = predictions ? predictions.get(legIndex) : undefined;
      const utc =
        prediction && Number.isFinite(prediction.secondsFromPresent)
          ? mcdu.getTimePrediction(prediction.secondsFromPresent, FlightPlanIndex.Active)
          : '----';
      const alt =
        prediction && Number.isFinite(prediction.altitude)
          ? formatAltitude(prediction.altitude, prediction.profilePhase === ProfilePhase.Descent)
          : '-----';
      return [utc, alt];
    };

    const toLeg = plan.activeLeg;
    let toWaypointCell = '';
    let toWaypointUTCCell = '';
    let toWaypointAltCell = '';
    let nextWaypointCell = '';
    let nextWaypointUTCCell = '';
    let nextWaypointAltCell = '';
    if (toLeg && toLeg.isDiscontinuity === false) {
      toWaypointCell = toLeg.ident;
      [toWaypointUTCCell, toWaypointAltCell] = predictionCells(plan.activeLegIndex);
      const nextLeg = plan.maybeElementAt(plan.activeLegIndex + 1);

      if (nextLeg && nextLeg.isDiscontinuity === false) {
        nextWaypointCell = nextLeg.ident;
        [nextWaypointUTCCell, nextWaypointAltCell] = predictionCells(plan.activeLegIndex + 1);
      }
    }

    // T/D (S/C, S/D): the next change of the cruise profile, in the cruise phase only (l.21446-21448)
    const cruiseProfileChange = nextCruiseProfileChange(
      mcdu.guidanceController ? mcdu.guidanceController.currentPseudoWaypoints : [],
      mcdu.flightPhaseManager.phase === FmgcFlightPhase.Cruise,
    );
    const cruiseProfileChangeLabel = cruiseProfileChange !== null ? '\xa0' + cruiseProfileChange.name : '';
    const cruiseProfileChangeCell =
      cruiseProfileChange !== null
        ? `${mcdu.getTimePrediction(cruiseProfileChange.secondsFromPresent, FlightPlanIndex.Active)}\xa0${Math.round(cruiseProfileChange.distance).toFixed(0).padStart(4, '\xa0')}`
        : '';

    // DEST: the time, distance and EFOB of the F-PLN pages (l.21464-21467)
    let destCell = '';
    let destUTCCell = '----';
    let destDistCell = '----';
    let destEfobCell = '---.-';
    if (plan.destinationAirport) {
      destCell = plan.destinationRunway ? plan.destinationRunway.ident : plan.destinationAirport.ident;

      const destDist = mcdu.guidanceController?.getAlongTrackDistanceToDestination(FlightPlanIndex.Active);
      if (destDist !== undefined && Number.isFinite(destDist)) {
        destDistCell = Math.round(destDist).toFixed(0);
      }
      if (fmsGeometryProfile && fmsGeometryProfile.isReadyToDisplay) {
        const destEfob = fmsGeometryProfile.getRemainingFuelAtDestination();
        if (Number.isFinite(destEfob)) {
          destEfobCell = (NXUnits.poundsToUser(destEfob) / 1000).toFixed(1);
        }
        const timeRemaining = fmsGeometryProfile.getTimeToDestination();
        if (timeRemaining !== null && Number.isFinite(timeRemaining)) {
          destUTCCell = mcdu.getTimePrediction(timeRemaining, FlightPlanIndex.Active);
        }
      }
    }

    const timeHeader = mcdu.getTimePredictionHeader(FlightPlanIndex.Active);
    mcdu.setTemplate([
      ['REPORT'],
      ['\xa0OVHD', 'ALT\xa0', timeHeader],
      [overheadCell + '[color]green', overheadAltCell + '[color]green', overheadUtcCell + '[color]green'],
      ['\xa0TO'],
      [toWaypointCell + '[color]green', toWaypointAltCell + '[color]green', toWaypointUTCCell + '[color]green'],
      ['\xa0NEXT'],
      [nextWaypointCell + '[color]green', nextWaypointAltCell + '[color]green', nextWaypointUTCCell + '[color]green'],
      ['\xa0SAT', 'FOB\xa0', 'T. WIND'],
      [satCell + '[color]green', fobCell + '[color]green', windCell + '[color]green'],
      [cruiseProfileChangeLabel, '', cruiseProfileChange !== null ? `${timeHeader}\xa0DIST` : ''],
      ['', '', cruiseProfileChangeCell + '[color]green'],
      ['\xa0DEST', 'EFOB', `${timeHeader}\xa0DIST`],
      [
        destCell + '[color]green',
        destEfobCell + '[color]green',
        `${destUTCCell}\xa0${destDistCell.padStart(4, '\xa0')}[color]green`,
      ],
    ]);

    // regular update due to showing dynamic data on this page
    mcdu.SelfPtr = setTimeout(() => {
      if (mcdu.page.Current === mcdu.page.ProgressPageReport) {
        CDUProgressPage.ShowReportPage(mcdu);
      }
    }, mcdu.PageTimeout.Default);
  }

  /**
   * The PREDICTIVE GPS page (A320 FCOM DSC-22_20-50-10-28 PREDICTIVE GPS PAGE, a320_fcom.txt l.21346-21404, see
   * PredictiveGpsFields).
   */
  static ShowPredictiveGPSPage(mcdu: LegacyFmsPageInterface) {
    mcdu.clearDisplay();
    mcdu.page.Current = mcdu.page.ProgressPagePredictiveGPS;

    const plan = mcdu.flightPlanService.active;
    const entries = CDUProgressPage.predictiveGps;
    const showError = (error: PredictiveGpsEntryError) =>
      mcdu.setScratchpadMessage(error === 'range' ? NXSystemMessages.entryOutOfRange : NXSystemMessages.formatError);

    // no constellation in the sim: the prediction is whether a GPS receiver gives a position now
    const gpsAvailable =
      !!mcdu.navigation && (mcdu.navigation.getGpsPosition(1) !== null || mcdu.navigation.getGpsPosition(2) !== null);

    // DEST and its ETA: "Dashes appear in this field, when no destination airport exists" (l.21356-21359)
    const destination = plan.destinationAirport;
    if ((destination ? destination.ident : null) !== entries.destinationIdent) {
      entries.destinationIdent = destination ? destination.ident : null;
      entries.destinationEta = null;
      entries.destinationEtaCleared = false;
    }
    let destIdentCell = '----';
    let destEtaCell = '';
    let destDefined = false;
    if (destination) {
      destIdentCell = destination.ident + '[color]green';

      let predictedEta: number | null = null;
      const fmsGeometryProfile = mcdu.guidanceController?.vnavDriver.mcduProfile;
      const timeRemaining = fmsGeometryProfile?.isReadyToDisplay ? fmsGeometryProfile.getTimeToDestination() : null;
      if (timeRemaining !== null && timeRemaining !== undefined && Number.isFinite(timeRemaining)) {
        predictedEta = SimVar.GetGlobalVarValue('ZULU TIME', 'seconds') + timeRemaining;
      }
      const eta = predictiveDestinationEtaCell(entries.destinationEta, entries.destinationEtaCleared, predictedEta);
      destEtaCell = eta.text;
      destDefined = eta.etaSeconds !== null;

      mcdu.onRightInput[0] = (value, scratchpadCallback) => {
        if (value === Keypad.clrValue) {
          entries.destinationEta = null;
          entries.destinationEtaCleared = true;
        } else {
          const parsed = parsePredictiveEta(value);
          if (typeof parsed !== 'number') {
            showError(parsed);
            scratchpadCallback();
            return;
          }
          entries.destinationEta = parsed;
          entries.destinationEtaCleared = false;
        }
        CDUProgressPage.ShowPredictiveGPSPage(mcdu);
      };
    }

    // WPT and its reference time: blue brackets, then amber boxes for the time (l.21388-21396)
    let waypointCell = '[\xa0\xa0\xa0\xa0\xa0][color]cyan';
    let waypointEtaCell = '';
    if (entries.waypointIdent !== null) {
      waypointCell = entries.waypointIdent + '[color]cyan';
      waypointEtaCell =
        entries.waypointEta !== null ? `{cyan}${formatTimeOfDay(entries.waypointEta)}{end}` : '{amber}____{end}';
    }
    mcdu.onLeftInput[2] = (value, scratchpadCallback) => {
      if (value === Keypad.clrValue) {
        entries.waypointIdent = null;
        entries.waypointEta = null;
        CDUProgressPage.ShowPredictiveGPSPage(mcdu);
        return;
      }
      WaypointEntryUtils.getOrCreateWaypoint(mcdu, value, false)
        .then((fix) => {
          if (!fix) {
            mcdu.setScratchpadMessage(NXSystemMessages.notInDatabase);
            scratchpadCallback();
            return;
          }
          entries.waypointIdent = fix.ident;
          entries.waypointEta = null;
          CDUProgressPage.ShowPredictiveGPSPage(mcdu);
        })
        .catch((err) => {
          // Rethrow if error is not an FMS message to display
          if (err.type === undefined) {
            throw err;
          }
          mcdu.showFmsErrorMessage(err.type);
          scratchpadCallback();
        });
    };
    mcdu.onRightInput[2] = (value, scratchpadCallback) => {
      if (entries.waypointIdent === null) {
        mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
        scratchpadCallback();
        return;
      }
      if (value === Keypad.clrValue) {
        entries.waypointEta = null;
      } else {
        const parsed = parsePredictiveEta(value);
        if (typeof parsed !== 'number') {
          showError(parsed);
          scratchpadCallback();
          return;
        }
        entries.waypointEta = parsed;
      }
      CDUProgressPage.ShowPredictiveGPSPage(mcdu);
    };

    // DESELECTED SATELLITES: up to four, CLR cancels the deselection (l.21398-21404)
    mcdu.onLeftInput[4] = (value, scratchpadCallback) => {
      if (value === Keypad.clrValue) {
        entries.deselectedSatellites = [];
      } else {
        const parsed = parseSatelliteNumber(value);
        if (typeof parsed !== 'number') {
          showError(parsed);
          scratchpadCallback();
          return;
        }
        entries.deselectedSatellites = deselectSatellite(entries.deselectedSatellites, parsed);
      }
      CDUProgressPage.ShowPredictiveGPSPage(mcdu);
    };

    const header = '\xa0\xa0-15 -10 -5 ETA+5 +10 +15';
    mcdu.setTemplate([
      ['PREDICTIVE GPS'],
      ['DEST', 'ETA'],
      [destIdentCell, destEtaCell, '{small}PRIMARY{end}'],
      [header],
      [predictivePrimaryLine(destDefined, gpsAvailable)],
      ['WPT', 'ETA'],
      [waypointCell, waypointEtaCell, '{small}PRIMARY{end}'],
      [header],
      [predictivePrimaryLine(entries.waypointIdent !== null && entries.waypointEta !== null, gpsAvailable)],
      ['', '', 'DESELECTED SATELLITES'],
      [deselectedSatellitesCell(entries.deselectedSatellites)],
      [''],
      [''],
    ]);

    // regular update: the DEST ETA prediction and the GPS receivers change
    mcdu.SelfPtr = setTimeout(() => {
      if (mcdu.page.Current === mcdu.page.ProgressPagePredictiveGPS) {
        CDUProgressPage.ShowPredictiveGPSPage(mcdu);
      }
    }, mcdu.PageTimeout.Default);
  }
}
