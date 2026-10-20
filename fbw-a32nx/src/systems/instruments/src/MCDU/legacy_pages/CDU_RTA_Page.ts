// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0
import { LegacyFmsPageInterface } from '../legacy/LegacyFmsPageInterface';
import { FmgcFlightPhase } from '@shared/flightphase';
import { CDUVerticalRevisionPage } from './A320_Neo_CDU_VerticalRevisionPage';
import { CDUFlightPlanPage } from './A320_Neo_CDU_FlightPlanPage';
import { Column, FormatTemplate } from '../legacy/A320_Neo_CDU_Format';
import { VerticalWaypointPrediction } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { FlightPlanLeg, isLeg } from '@fmgc/flightplanning/legs/FlightPlanLeg';
import { Keypad } from '../legacy/A320_Neo_CDU_Keypad';
import { NXSystemMessages } from '../messages/NXSystemMessages';
import { rtaAllowedAt } from '@fmgc/guidance/vnav/rta/RtaFlightPlanInputs';
import { parseRtaEntry, secondsOfDay, timeErrorSeconds } from '@fmgc/guidance/vnav/rta/TimeConstraint';
import { formatRta, formatRtaError, formatTimeOfDay } from './CduRtaFormat';

/**
 * The RTA page, from the RTA prompt of the VERT REV page: the time constraint at a waypoint, its ETA and time error,
 * the managed speed used to meet it, the active speed mode, and the ETT.
 */
export class CduRtaPage {
  static ShowPage(
    mcdu: LegacyFmsPageInterface,
    waypoint: FlightPlanLeg,
    index: number,
    verticalWaypoint: VerticalWaypointPrediction | undefined,
    forPlan: FlightPlanIndex,
  ): void {
    mcdu.clearDisplay();
    mcdu.page.Current = mcdu.page.RTAPage;
    const phase = mcdu.flightPhaseManager.phase;
    const isPreFlight = phase === FmgcFlightPhase.Preflight;
    const flightplan = mcdu.getFlightPlan(forPlan);
    const tmpy = forPlan === FlightPlanIndex.Active && mcdu.flightPlanService.hasTemporary;
    const dataColor = tmpy ? Column.yellow : Column.green;
    const ett = flightplan.performanceData.estimatedTakeoffTime.get();
    const ettExists = ett !== null && !flightplan.performanceData.estimatedTakeoffTimeExpired.get();
    const rta = mcdu.flightPlanService.timeConstraintOf(forPlan);
    const element = flightplan.maybeElementAt(index);
    // From a VERT REV at the origin (for the ETT), no waypoint is defined yet
    const waypointDefined =
      isLeg(element) &&
      element.definition.waypoint?.databaseId === waypoint?.definition.waypoint?.databaseId &&
      rtaAllowedAt(flightplan, index);
    const rtaHere = waypointDefined && rta !== null && rta.databaseId === waypoint.definition.waypoint?.databaseId;
    const forActiveOrTemporary = forPlan === FlightPlanIndex.Active;

    // The page follows the predictions and the clock
    mcdu.SelfPtr = setTimeout(() => {
      if (mcdu.page.Current === mcdu.page.RTAPage) {
        CduRtaPage.ShowPage(mcdu, waypoint, index, verticalWaypoint, forPlan);
      }
    }, mcdu.PageTimeout.Slow);

    const profile = forActiveOrTemporary ? mcdu.guidanceController?.vnavDriver.mcduProfile : undefined;
    const prediction =
      waypointDefined && profile?.isReadyToDisplay ? profile.waypointPredictions.get(index) : undefined;
    const secondsFromPresent =
      prediction && Number.isFinite(prediction.secondsFromPresent) ? prediction.secondsFromPresent : null;

    const distanceCell =
      waypointDefined && prediction && Number.isFinite(prediction.distanceFromAircraft)
        ? Math.max(0, Math.round(prediction.distanceFromAircraft)).toFixed(0)
        : '';
    const etaUtcSeconds =
      rtaHere && secondsFromPresent !== null ? mcdu.rtaFunction.etaUtcSeconds(secondsFromPresent) : null;
    const missed =
      rtaHere && rta && secondsFromPresent !== null
        ? mcdu.rtaFunction.isPredictedMissed(rta, secondsFromPresent)
        : false;

    const allowEtt = isPreFlight || !flightplan.isActiveOrCopiedFromActive();
    const ettCell = allowEtt
      ? ettExists
        ? formatTimeOfDay(secondsOfDay(ett / 1000))
        : '[\xa0\xa0\xa0\xa0\xa0\xa0]*'
      : '';

    const [managedSpeed, managedMach] =
      phase >= FmgcFlightPhase.Descent
        ? [mcdu.managedSpeedDescend, mcdu.managedSpeedDescendMach]
        : phase === FmgcFlightPhase.Cruise
          ? [mcdu.managedSpeedCruise, mcdu.managedSpeedCruiseMach]
          : [mcdu.managedSpeedClimb, mcdu.managedSpeedClimbMach];
    const managedCell = `${Math.round(managedSpeed).toFixed(0)}/${managedMach.toFixed(2)}`;

    const speedManaged =
      isPreFlight || !!mcdu.guidanceController?.verticalProfileComputationParametersObserver.get().fcuSpeedManaged;
    const selectedSpeed = SimVar.GetSimVarValue('L:A32NX_AUTOPILOT_SPEED_SELECTED', 'number');
    const activeModeCell = speedManaged
      ? 'MANAGED'
      : `SELECTED/${selectedSpeed < 1 ? selectedSpeed.toFixed(2).replace('0.', '.') : Math.round(selectedSpeed).toFixed(0)}`;

    const nowSeconds = mcdu.rtaFunction.utcSeconds;

    mcdu.setTemplate(
      FormatTemplate([
        [
          new Column(
            0,
            (flightplan.index === FlightPlanIndex.FirstSecondary ? 'SEC' : '').padEnd(10, '\xa0') + 'RTA',
            Column.white,
          ),
        ],
        [new Column(1, 'AT WPT'), new Column(10, 'DIST'), new Column(22, 'RTA', Column.right)],
        [
          new Column(0, waypointDefined ? waypoint.ident : '[\xa0\xa0\xa0\xa0\xa0\xa0]', Column.cyan),
          new Column(10, distanceCell, dataColor, Column.small),
          new Column(
            23,
            !waypointDefined ? '' : rtaHere && rta ? formatRta(rta) : '[\xa0\xa0\xa0\xa0\xa0\xa0]*',
            rtaHere ? (tmpy ? Column.yellow : Column.magenta) : Column.cyan,
            Column.right,
          ),
        ],
        [new Column(1, 'MANAGED'), new Column(22, rtaHere ? 'ETA' : '', Column.right)],
        [
          new Column(0, managedCell, dataColor, Column.small),
          new Column(
            23,
            etaUtcSeconds !== null ? formatTimeOfDay(etaUtcSeconds) : '',
            dataColor,
            Column.small,
            Column.right,
          ),
        ],
        [new Column(1, 'ACT MODE'), new Column(22, missed ? 'RTA ERROR' : '', Column.small, Column.right)],
        [
          new Column(0, activeModeCell, Column.green),
          new Column(
            23,
            missed && rta && etaUtcSeconds !== null
              ? formatRtaError(timeErrorSeconds(etaUtcSeconds, rta.utcSeconds))
              : '',
            Column.amber,
            Column.right,
          ),
        ],
        [],
        [],
        [new Column(22, allowEtt ? 'ETT' : 'UTC', Column.right)],
        [
          allowEtt
            ? new Column(
                23,
                ettCell,
                ettExists ? Column.magenta : Column.cyan,
                ettExists ? Column.small : Column.big,
                Column.right,
              )
            : new Column(23, formatTimeOfDay(nowSeconds), Column.green, Column.small, Column.right),
        ],
        [],
        [
          tmpy ? new Column(0, '<TMPY F-PLN', Column.yellow) : new Column(0, '<RETURN'),
          new Column(23, tmpy ? 'TMPY INSERT*' : '', Column.amber, Column.right),
        ],
      ]),
    );

    const reshow = (leg = waypoint, legIndex = index) =>
      CduRtaPage.ShowPage(mcdu, leg, legIndex, verticalWaypoint, forPlan);

    // AT WPT: the waypoint of the time constraint
    mcdu.onLeftInput[0] = (value, scratchpadCallback) => {
      const plan = mcdu.getFlightPlan(forPlan);
      for (let i = plan.activeLegIndex; i < plan.firstMissedApproachLegIndex; i++) {
        const leg = plan.maybeElementAt(i);
        if (isLeg(leg) && leg.ident === value && rtaAllowedAt(plan, i)) {
          reshow(leg, i);
          return;
        }
      }
      mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
      scratchpadCallback();
    };

    // RTA: HHMMSS (AT), +HHMMSS (AT OR AFTER), -HHMMSS (AT OR BEFORE); CLR deletes it
    mcdu.onRightInput[0] = (value, scratchpadCallback) => {
      if (!waypointDefined) {
        mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
        scratchpadCallback();
        return;
      }
      if (value === Keypad.clrValue) {
        if (!rtaHere) {
          mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
          scratchpadCallback();
          return;
        }
        mcdu.rtaFunction.setTimeConstraint(null, forPlan);
        reshow();
        return;
      }
      const entry = parseRtaEntry(value);
      if (entry === null) {
        mcdu.setScratchpadMessage(NXSystemMessages.formatError);
        scratchpadCallback();
        return;
      }
      const rtaRefused =
        flightplan.isActiveOrCopiedFromActive() &&
        (mcdu.isEngineOutCondition.get() || phase === FmgcFlightPhase.GoAround);
      if (rtaRefused || !waypoint.definition.waypoint) {
        mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
        scratchpadCallback();
        return;
      }
      mcdu.rtaFunction.setTimeConstraint(
        { ident: waypoint.ident, databaseId: waypoint.definition.waypoint.databaseId, ...entry },
        forPlan,
      );
      reshow();
    };

    mcdu.onRightInput[4] = (value) => {
      if (allowEtt) {
        mcdu.setEstimatedTakeoffTime(value, forPlan);
        reshow();
      }
    };

    mcdu.onLeftInput[5] = () => {
      if (tmpy) {
        CDUFlightPlanPage.ShowPage(mcdu, 0, false, forPlan);
        return;
      }
      CDUVerticalRevisionPage.ShowPage(
        mcdu,
        waypoint,
        index,
        verticalWaypoint,
        undefined,
        undefined,
        undefined,
        forPlan,
      );
    };

    mcdu.onRightInput[5] = () => {
      if (tmpy) {
        mcdu.insertTemporaryFlightPlan(() => reshow());
      }
    };
  }
}
