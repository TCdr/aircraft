// Copyright (c) 2024-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0
import { TurnDirection, WaypointDescriptor } from '@flybywiresim/fbw-sdk';
import { HoldType } from '@fmgc/flightplanning/data/flightplan';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { SegmentClass } from '@fmgc/flightplanning/segments/SegmentClass';
import { ProfilePhase } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { MfdFmsFpln } from './MfdFmsFpln';
import { ContextMenuElement } from '../../../../MsfsAvionicsCommon/UiWidgets/ContextMenu';
import { BitFlags } from '@microsoft/msfs-sdk';
import { FlightPlanLegFlags } from '@fmgc/flightplanning/legs/FlightPlanLeg';
import { isConstraintRevisionAllowed, lateralRevisionHoldPage, showReturnButtonUriExtra } from '../../../shared/utils';

export enum FplnRevisionsMenuType {
  Waypoint,
  PseudoWaypoint,
  Discontinuity,
  Runway,
  Departure,
  Arrival,
  TooSteepPath,
}

export function getRevisionsMenu(fpln: MfdFmsFpln, type: FplnRevisionsMenuType): ContextMenuElement[] {
  const legIndex = fpln.props.fmcService.master?.revisedLegIndex.get();
  const planIndex = fpln.props.fmcService.master?.revisedLegPlanIndex.get();
  const altnFlightPlan = fpln.props.fmcService.master?.revisedLegIsAltn.get();

  if (legIndex == null || planIndex == null || altnFlightPlan == null) {
    return [];
  }

  const previousLeg = fpln.loadedFlightPlan?.maybeElementAt(legIndex - 1);
  const revisedLeg = fpln.loadedFlightPlan?.elementAt(legIndex);

  const isFromLeg = legIndex === fpln.loadedFlightPlan?.fromLegIndex;
  const isLegTerminatingAtDatabaseFix =
    revisedLeg &&
    revisedLeg.isDiscontinuity === false &&
    revisedLeg.isXF() &&
    !BitFlags.isAny(revisedLeg.flags, FlightPlanLegFlags.DirectToTurningPoint);

  return [
    {
      name: planIndex >= FlightPlanIndex.FirstSecondary ? '\xa0' : 'FROM P.POS DIR TO *',
      disabled:
        altnFlightPlan ||
        legIndex >= (fpln.loadedFlightPlan?.firstMissedApproachLegIndex ?? Infinity) ||
        planIndex === FlightPlanIndex.Temporary ||
        planIndex >= FlightPlanIndex.FirstSecondary ||
        type === FplnRevisionsMenuType.Discontinuity ||
        type === FplnRevisionsMenuType.TooSteepPath ||
        isFromLeg ||
        !isLegTerminatingAtDatabaseFix,
      onPressed: () => {
        //FIXME This should navigate to DIR TO page instead.
        const ppos = fpln.props.fmcService.master?.navigation.getPpos();
        if (ppos) {
          fpln.props.fmcService.master?.flightPlanInterface.directToLeg(
            ppos,
            SimVar.GetSimVarValue('GPS GROUND TRUE TRACK', 'degree'),
            legIndex,
            true,
            planIndex,
          );
          fpln.props.mfd.uiService.navigateTo(
            `fms/${fpln.props.mfd.uiService.activeUri.get().category}/f-pln-direct-to`,
          );
        }
      },
    },
    {
      name: 'INSERT NEXT WPT',
      disabled: revisedLeg?.isDiscontinuity === false && revisedLeg.isVectors(),
      onPressed: () => fpln.openInsertNextWptFromWindow(),
    },
    {
      name: 'DELETE *',
      disabled:
        type === FplnRevisionsMenuType.Runway ||
        type === FplnRevisionsMenuType.TooSteepPath ||
        (revisedLeg?.isDiscontinuity && previousLeg?.isDiscontinuity === false && previousLeg?.isVectors()) ||
        isFromLeg, // TODO allow in HDG/TRK
      onPressed: () => {
        fpln.props.fmcService.master?.flightPlanInterface.deleteElementAt(legIndex, false, planIndex, altnFlightPlan);
      },
    },
    {
      name: 'DEPARTURE',
      disabled: type !== FplnRevisionsMenuType.Departure && type !== FplnRevisionsMenuType.Runway,
      onPressed: () =>
        fpln.props.mfd.uiService.navigateTo(`fms/${fpln.props.mfd.uiService.activeUri.get().category}/f-pln-departure`),
    },
    {
      name: 'ARRIVAL',
      disabled: type !== FplnRevisionsMenuType.Arrival && type !== FplnRevisionsMenuType.Runway,
      onPressed: () =>
        fpln.props.mfd.uiService.navigateTo(`fms/${fpln.props.mfd.uiService.activeUri.get().category}/f-pln-arrival`),
    },
    {
      name: 'OFFSET',
      // FCOM DSC-22-FMS-20-30 P 216: OFFSET page (entries inactive, no lateral offset guidance yet)
      disabled: false,
      onPressed: () =>
        fpln.props.mfd.uiService.navigateTo(`fms/${fpln.props.mfd.uiService.activeUri.get().category}/f-pln-offset`),
    },
    {
      name: 'HOLD',
      disabled:
        type === FplnRevisionsMenuType.Discontinuity ||
        type === FplnRevisionsMenuType.TooSteepPath ||
        isFromLeg || // TODO should be allowed at FROM but we don't support PPOS holds yet.
        !isLegTerminatingAtDatabaseFix,
      onPressed: async () => {
        if (revisedLeg && revisedLeg.isDiscontinuity === false && !revisedLeg.isHX()) {
          // FCOM DSC-22-FMS-20-30 HOLD page, COMPUTED HOLD: 1 min leg below 14 000 ft, 1.5 min above, at the
          // predicted altitude at the hold
          const predictedAltitude =
            planIndex === FlightPlanIndex.Active
              ? fpln.props.fmcService.master?.guidanceController?.vnavDriver?.mcduProfile?.waypointPredictions?.get(
                  legIndex,
                )?.altitude
              : undefined;
          const alt =
            predictedAltitude ??
            (revisedLeg.definition.altitude1
              ? revisedLeg.definition.altitude1
              : SimVar.GetSimVarValue('INDICATED ALTITUDE', 'feet'));

          const previousLeg = fpln.props.fmcService.master?.flightPlanInterface.active.maybeElementAt(legIndex - 1);

          let inboundMagneticCourse = 100;
          const prevTerm = previousLeg?.isDiscontinuity === false && previousLeg.terminationWaypoint();
          const wptTerm = revisedLeg.terminationWaypoint();
          if (previousLeg && previousLeg.isDiscontinuity === false && previousLeg.isXF() && prevTerm && wptTerm) {
            inboundMagneticCourse = Avionics.Utils.computeGreatCircleHeading(prevTerm.location, wptTerm.location);
          }

          const defaultHold = {
            inboundMagneticCourse,
            turnDirection: TurnDirection.Right,
            time: alt <= 14000 ? 1 : 1.5,
            type: HoldType.Computed,
          };
          await fpln.props.fmcService.master?.flightPlanInterface.addOrEditManualHold(
            legIndex,
            Object.assign({}, defaultHold),
            undefined,
            defaultHold,
            planIndex,
            altnFlightPlan,
          );

          fpln.props.fmcService.master?.revisedLegIndex.set(legIndex + 1); // We just inserted a new HOLD leg
        }
        fpln.props.mfd.uiService.navigateTo(
          `fms/${fpln.props.mfd.uiService.activeUri.get().category}/${lateralRevisionHoldPage}`,
        );
      },
    },
    {
      name: 'AIRWAYS',
      disabled:
        type === FplnRevisionsMenuType.Runway ||
        type === FplnRevisionsMenuType.Discontinuity ||
        type === FplnRevisionsMenuType.TooSteepPath ||
        isFromLeg ||
        !isLegTerminatingAtDatabaseFix ||
        revisedLeg.definition.waypointDescriptor === WaypointDescriptor.Airport ||
        revisedLeg.definition.waypointDescriptor === WaypointDescriptor.Runway,
      onPressed: () => {
        fpln.props.fmcService.master?.flightPlanInterface.startAirwayEntry(legIndex, planIndex, altnFlightPlan);
        fpln.props.mfd.uiService.navigateTo(`fms/${fpln.props.mfd.uiService.activeUri.get().category}/f-pln-airways`);
      },
    },
    {
      name:
        !altnFlightPlan &&
        type !== FplnRevisionsMenuType.Discontinuity &&
        type !== FplnRevisionsMenuType.TooSteepPath &&
        revisedLeg?.isDiscontinuity === false &&
        revisedLeg.definition.overfly
          ? 'DELETE OVERFLY *'
          : 'OVERFLY *',
      disabled:
        altnFlightPlan ||
        type === FplnRevisionsMenuType.Discontinuity ||
        type === FplnRevisionsMenuType.TooSteepPath ||
        isFromLeg ||
        !isLegTerminatingAtDatabaseFix,
      onPressed: () =>
        fpln.props.fmcService.master?.flightPlanInterface.toggleOverfly(legIndex, planIndex, altnFlightPlan),
    },
    {
      name: 'ENABLE ALTN *',
      disabled:
        altnFlightPlan ||
        !revisedLeg ||
        revisedLeg.isDiscontinuity ||
        fpln.props.fmcService.master.flightPlanInterface.get(planIndex).alternateDestinationAirport === undefined,
      onPressed: () => {
        const cruiseLevel = fpln.props.fmcService.master?.computeAlternateCruiseLevel(planIndex) ?? 100;
        fpln.props.fmcService.master?.flightPlanInterface.enableAltn(legIndex, cruiseLevel, planIndex);
        fpln.props.fmcService.master?.acInterface.updateFmsData();
        fpln.props.fmcService.master?.acInterface.calculateFinalAndAlternateFuel(planIndex);
      },
    },
    {
      name: 'NEW DEST',
      disabled: isFromLeg || !isLegTerminatingAtDatabaseFix,
      onPressed: () => fpln.openNewDestWindow(),
    },
    {
      name: 'CONSTRAINTS',
      disabled:
        revisedLeg === undefined ||
        type === FplnRevisionsMenuType.Discontinuity ||
        type === FplnRevisionsMenuType.TooSteepPath ||
        !isConstraintRevisionAllowed(revisedLeg),
      onPressed: () =>
        fpln.props.mfd.uiService.navigateTo(
          `fms/${fpln.props.mfd.uiService.activeUri.get().category}/f-pln-vert-rev/alt`,
        ),
    },
    {
      name: 'CMS',
      disabled:
        true ||
        altnFlightPlan ||
        type === FplnRevisionsMenuType.Discontinuity ||
        type === FplnRevisionsMenuType.TooSteepPath,
      onPressed: () =>
        fpln.props.mfd.uiService.navigateTo(
          `fms/${fpln.props.mfd.uiService.activeUri.get().category}/f-pln-vert-rev/cms`,
        ),
    },
    {
      name: 'STEP ALTs',
      disabled:
        altnFlightPlan ||
        !isLegTerminatingAtDatabaseFix ||
        type === FplnRevisionsMenuType.Discontinuity ||
        type === FplnRevisionsMenuType.TooSteepPath,
      onPressed: () =>
        fpln.props.mfd.uiService.navigateTo(
          `fms/${fpln.props.mfd.uiService.activeUri.get().category}/f-pln-vert-rev/step-alts`,
        ),
    },
    {
      name: 'WIND',
      disabled: altnFlightPlan || !revisedLeg || revisedLeg.isDiscontinuity !== false,
      onPressed: () => {
        if (!revisedLeg || revisedLeg.isDiscontinuity !== false) {
          return;
        }

        // FCOM DSC-22-FMS-20-30 F-PLN page, WIND revision: the CLB, CRZ or DES panel of the WIND page, for a climb,
        // cruise or descent waypoint. The vertical profile phase is used when predictions exist.
        const profilePhase =
          planIndex === FlightPlanIndex.Active
            ? fpln.props.fmcService.master?.guidanceController?.vnavDriver?.mcduProfile?.waypointPredictions?.get(
                legIndex,
              )?.profilePhase
            : undefined;
        if (profilePhase !== undefined) {
          const panel =
            profilePhase === ProfilePhase.Descent ? 'des' : profilePhase === ProfilePhase.Cruise ? 'crz' : 'clb';
          fpln.props.mfd.uiService.navigateTo(
            `fms/${fpln.props.mfd.uiService.activeUri.get().category}/wind/${panel}/${showReturnButtonUriExtra}`,
          );
        } else if (revisedLeg.segment.class === SegmentClass.Arrival) {
          fpln.props.mfd.uiService.navigateTo(
            `fms/${fpln.props.mfd.uiService.activeUri.get().category}/wind/des/${showReturnButtonUriExtra}`,
          );
        } else if (revisedLeg.segment.class === SegmentClass.Enroute) {
          fpln.props.mfd.uiService.navigateTo(
            `fms/${fpln.props.mfd.uiService.activeUri.get().category}/wind/crz/${showReturnButtonUriExtra}`,
          );
        } else {
          fpln.props.mfd.uiService.navigateTo(
            `fms/${fpln.props.mfd.uiService.activeUri.get().category}/wind/clb/${showReturnButtonUriExtra}`,
          );
        }
      },
    },
  ];
}
