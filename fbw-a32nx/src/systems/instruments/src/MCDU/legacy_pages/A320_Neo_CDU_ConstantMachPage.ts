// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { Keypad } from '../legacy/A320_Neo_CDU_Keypad';
import { LegacyFmsPageInterface } from '../legacy/LegacyFmsPageInterface';
import { NXSystemMessages } from '../messages/NXSystemMessages';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { cruisePredictionLookup } from '@fmgc/guidance/vnav/cruise/ConstantMachSpeedProfile';
import { ReadonlyFlightPlan } from '@fmgc/flightplanning/plans/ReadonlyFlightPlan';
import {
  A320ConstantMachLimits,
  canLegBoundConstantMachSegment,
  constantMachWaypointChoices,
  ConstantMachWaypointChoice,
  findConstantMachSegment,
  isConstantMachSegmentEntryAllowed,
  parseConstantMachEntry,
} from '@fmgc/flightplanning/ConstantMachSegment';
import { FmgcFlightPhase } from '@shared/flightphase';
import { CDUFlightPlanPage } from './A320_Neo_CDU_FlightPlanPage';

/** Start and end selected on the page before the Mach entry creates the segment */
interface PendingConstantMachBounds {
  startLegIndex: number | null;
  endLegIndex: number | null;
}

const VISIBLE_WAYPOINT_ROWS = 3;

export class CDUConstantMachPage {
  /**
   * @param revisedLegIndex the waypoint of the VERT REV the page was called from
   * @param returnTo what the RETURN key does, set by the page that opened this one on this screen
   * @param pending start and end selected before the Mach entry
   * @param scroll the first waypoint shown in the SELECTABLE F-PLN WPTS list
   */
  static ShowPage(
    mcdu: LegacyFmsPageInterface,
    revisedLegIndex: number,
    forPlan: FlightPlanIndex,
    returnTo: () => void,
    pending: PendingConstantMachBounds | null = null,
    scroll = 0,
  ) {
    mcdu.clearDisplay();
    mcdu.page.Current = mcdu.page.ConstantMachPage;

    const refresh = (newPending = pending, newScroll = scroll) =>
      CDUConstantMachPage.ShowPage(mcdu, revisedLegIndex, forPlan, returnTo, newPending, newScroll);

    const plan = mcdu.getFlightPlan(forPlan);
    const isActivePlan = forPlan === FlightPlanIndex.Active;
    const tmpy = isActivePlan && mcdu.flightPlanService.hasTemporary;
    const segment = findConstantMachSegment(plan.allLegs);

    const isPredictedInCruise = cruisePredictionLookup(
      isActivePlan ? mcdu.guidanceController?.vnavDriver.mcduProfile?.waypointPredictions : undefined,
    );

    const fromLegIndex = isActivePlan ? plan.activeLegIndex - 1 : null;
    const defaultStart = CDUConstantMachPage.defaultStartLegIndex(
      mcdu,
      plan,
      revisedLegIndex,
      fromLegIndex,
      isPredictedInCruise,
    );

    const startLegIndex = segment?.startLegIndex ?? pending?.startLegIndex ?? defaultStart;
    const endLegIndex = segment ? segment.endLegIndex : pending?.endLegIndex ?? null;
    const isStartSelected = segment !== null || (pending?.startLegIndex ?? null) !== null;
    const isEndSelected = segment !== null || (pending?.endLegIndex ?? null) !== null;

    const choices = constantMachWaypointChoices(
      plan.allLegs,
      plan.activeLegIndex,
      startLegIndex,
      endLegIndex,
      isPredictedInCruise,
    );
    const firstShown = Math.max(0, Math.min(scroll, choices.length - VISIBLE_WAYPOINT_ROWS));

    const dataColor = tmpy ? 'yellow' : 'cyan';
    const machCell = segment ? `{${dataColor}}${segment.mach.toFixed(2)}{end}` : '{cyan}[\xa0\xa0\xa0]{end}';
    const startIdent =
      startLegIndex === null ? '' : startLegIndex === fromLegIndex ? 'PPOS' : plan.legElementAt(startLegIndex).ident;
    const endIdent = endLegIndex === null ? 'T/D' : plan.legElementAt(endLegIndex).ident;

    const rows: string[][] = [
      [`${isActivePlan ? '' : 'SEC '}CONSTANT MACH`],
      ['\xa0MACH'],
      [machCell],
      ['\xa0START WPT', 'END WPT\xa0'],
      [
        `{${dataColor}}${isStartSelected ? '' : '{small}'}${startIdent}${isStartSelected ? '' : '{end}'}{end}`,
        `{${dataColor}}${isEndSelected ? '' : '{small}'}${endIdent}${isEndSelected ? '' : '{end}'}{end}`,
      ],
    ];

    for (let row = 0; row < VISIBLE_WAYPOINT_ROWS; row++) {
      rows.push(row === 0 ? ['', '', 'SELECTABLE F-PLN WPTS'] : ['']);
      const choice = choices[firstShown + row];
      rows.push(choice ? CDUConstantMachPage.formatChoice(choice) : ['']);
    }

    rows.push(tmpy ? ['{yellow}TMPY{end}', '{yellow}TMPY{end}'] : ['']);
    rows.push(tmpy ? ['{yellow}<F-PLN{end}', '{yellow}INSERT*{end}'] : ['<RETURN']);

    mcdu.setTemplate(rows);

    const up = firstShown + VISIBLE_WAYPOINT_ROWS < choices.length;
    const down = firstShown > 0;
    mcdu.onUp = () => up && refresh(pending, firstShown + 1);
    mcdu.onDown = () => down && refresh(pending, firstShown - 1);
    mcdu.setArrows(up, down, false, false);

    const changeSegmentBounds = async (mach: number, newStart: number, newEnd: number | null) => {
      await mcdu.flightPlanService.setConstantMachSegment(newStart, newEnd, mach, forPlan);
      mcdu.guidanceController?.vnavDriver.invalidateFlightPlanProfile();
      refresh(null);
    };

    mcdu.onLeftInput[0] = async (value, scratchpadCallback) => {
      if (!CDUConstantMachPage.isEntryAllowed(mcdu, forPlan)) {
        mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
        scratchpadCallback();
        return;
      }

      if (value === Keypad.clrValue) {
        if (segment) {
          await mcdu.flightPlanService.deleteConstantMachSegment(forPlan);
          mcdu.guidanceController?.vnavDriver.invalidateFlightPlanProfile();
        }
        refresh(null);
        return;
      }

      const entry = parseConstantMachEntry(value, A320ConstantMachLimits);
      if ('error' in entry) {
        mcdu.setScratchpadMessage(
          entry.error === 'format' ? NXSystemMessages.formatError : NXSystemMessages.entryOutOfRange,
        );
        scratchpadCallback();
        return;
      }

      if (startLegIndex === null) {
        mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
        scratchpadCallback();
        return;
      }

      await mcdu.flightPlanService.setConstantMachSegment(startLegIndex, endLegIndex, entry.mach, forPlan);
      mcdu.guidanceController?.vnavDriver.invalidateFlightPlanProfile();
      refresh(null);
    };

    for (let row = 0; row < VISIBLE_WAYPOINT_ROWS; row++) {
      const choice = choices[firstShown + row];

      mcdu.onLeftInput[2 + row] = (_value, scratchpadCallback) => {
        if (!choice?.canBeStart || !CDUConstantMachPage.isEntryAllowed(mcdu, forPlan)) {
          mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
          scratchpadCallback();
          return;
        }
        if (segment) {
          changeSegmentBounds(segment.mach, choice.legIndex, segment.endLegIndex);
        } else {
          refresh({ startLegIndex: choice.legIndex, endLegIndex: pending?.endLegIndex ?? null });
        }
      };

      mcdu.onRightInput[2 + row] = (_value, scratchpadCallback) => {
        if (!choice?.canBeEnd || !CDUConstantMachPage.isEntryAllowed(mcdu, forPlan)) {
          mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
          scratchpadCallback();
          return;
        }
        if (segment) {
          changeSegmentBounds(segment.mach, segment.startLegIndex, choice.legIndex);
        } else {
          refresh({ startLegIndex: pending?.startLegIndex ?? null, endLegIndex: choice.legIndex });
        }
      };
    }

    mcdu.onLeftInput[5] = () => {
      if (tmpy) {
        CDUFlightPlanPage.ShowPage(mcdu, 0, false, forPlan);
      } else {
        returnTo();
      }
    };

    mcdu.onRightInput[5] = () => {
      if (tmpy) {
        mcdu.insertTemporaryFlightPlan(() => refresh(null));
      }
    };
  }

  private static formatChoice(choice: ConstantMachWaypointChoice): string[] {
    return [
      `${choice.canBeStart ? '{' : '\xa0'}${choice.ident}[color]cyan`,
      `${choice.ident}${choice.canBeEnd ? '}' : '\xa0'}[color]cyan`,
    ];
  }

  /**
   * The start proposed by the page: the revised waypoint when it can start a segment (the present position for the
   * FROM waypoint), otherwise the first down path waypoint that can
   */
  private static defaultStartLegIndex(
    mcdu: LegacyFmsPageInterface,
    plan: ReadonlyFlightPlan,
    revisedLegIndex: number,
    fromLegIndex: number | null,
    isPredictedInCruise: (legIndex: number) => boolean | undefined,
  ): number | null {
    if (
      fromLegIndex !== null &&
      revisedLegIndex === fromLegIndex &&
      mcdu.flightPhaseManager.phase === FmgcFlightPhase.Cruise &&
      canLegBoundConstantMachSegment(plan.maybeElementAt(fromLegIndex))
    ) {
      return fromLegIndex;
    }

    if (canLegBoundConstantMachSegment(plan.maybeElementAt(revisedLegIndex), isPredictedInCruise(revisedLegIndex))) {
      return revisedLegIndex;
    }

    return (
      constantMachWaypointChoices(plan.allLegs, plan.activeLegIndex, null, null, isPredictedInCruise)[0]?.legIndex ??
      null
    );
  }

  static isEntryAllowed(mcdu: LegacyFmsPageInterface, forPlan: FlightPlanIndex): boolean {
    return isConstantMachSegmentEntryAllowed(
      mcdu.flightPhaseManager.phase,
      mcdu.isEngineOutCondition.get(),
      forPlan !== FlightPlanIndex.Active,
    );
  }
}
