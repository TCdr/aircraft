// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { NavigationDatabaseService } from '@fmgc/flightplanning/NavigationDatabaseService';
import {
  formatRnpValue,
  hasClockReachedTime,
  isNavDatabaseCycleCurrent,
  isProcedureTurnExceedanceAhead,
  isTimeToExitHolding,
  MessageTextLatch,
  utcCalendarDate,
} from '@fmgc/components/fms-messages/FmsMessageConditions';
import { isOriginIrsPositionDisagree } from '@fmgc/components/fms-messages/IrsPositionMessages';
import { activeRnpMessage } from '@fmgc/components/fms-messages/RnpMessages';
import { FmgcFlightPhase } from '@shared/flightphase';
import { PILeg } from '@fmgc/guidance/lnav/legs/PI';
import { distanceToTopOfDescent } from '@fmgc/components/fms-messages/TopOfDescentDistance';

import { NXSystemMessages, TypeIIMessage } from '../shared/NXSystemMessages';
import type { FlightManagementComputer } from './FlightManagementComputer';
import { isCheckApproachSelection, ManuallyTunedIls } from './CheckApproachSelection';

/** The PFD reads this L:var to show CHECK APPR SEL on the FMA line 3 (A380 FCOM DSC-22-FG-80-80 l.19241) */
const CHECK_APPR_SEL_PFD_VAR = 'L:A32NX_PFD_MSG_CHECK_APPR_SELECTION';

/**
 * @param leg the final leg of the approach
 * @returns the frequency in MHz of its recommended navaid, null without one
 */
function recommendedNavaidFrequency(leg: { recommendedNavaid?: unknown } | undefined): number | null {
  const navaid = leg?.recommendedNavaid as { frequency?: unknown } | undefined;
  return navaid && typeof navaid.frequency === 'number' ? navaid.frequency : null;
}

/**
 * The leg if it is a procedure turn (PI leg, the only legs with a turn area check), else undefined
 * @param leg a leg of the guidance geometry
 * @returns the procedure turn leg, or undefined
 */
function procedureTurnLeg(leg: unknown): PILeg | undefined {
  return leg instanceof PILeg ? leg : undefined;
}

/** What the database cycle check needs from the FMS */
interface MessageQueue {
  addMessageToQueue(message: TypeIIMessage, isResolved: undefined, onClear: undefined): void;
}

/**
 * CHECK DATABASE CYCLE (A380 FCOM DSC-22-FMS-20-110, a380_fcom.txt l.44998-45003): "The current date does not match the
 * effectivity of the active navigation database. This message is triggered when the flight crew enters a FROM/TO airport
 * or company route."
 * @param fms the FMS that shows the message
 */
export async function checkNavDatabaseCycle(fms: MessageQueue): Promise<void> {
  const ident = await NavigationDatabaseService.activeDatabase.getDatabaseIdent();
  const today = utcCalendarDate(
    SimVar.GetSimVarValue('E:ZULU YEAR', 'number'),
    SimVar.GetSimVarValue('E:ZULU MONTH OF YEAR', 'number'),
    SimVar.GetSimVarValue('E:ZULU DAY OF MONTH', 'number'),
  );
  if (!isNavDatabaseCycleCurrent(today, ident)) {
    fms.addMessageToQueue(NXSystemMessages.checkDatabaseCycle, undefined, undefined);
  }
}

/**
 * The type II FMS messages of the A380 FCOM message list (a380_fcom.txt l.44767-46377) that the FMS raises from its
 * own data each cycle: each message is sent once when its condition starts and recalled when it ends (the flight crew
 * can clear it in between). Runs on FMC-A, which has the navigation.
 */
export class FmsAdvisoryMessages {
  private readonly rnpLatch = new MessageTextLatch();

  private readonly irsAirportLatch = new MessageTextLatch();

  private readonly turnAreaLatch = new MessageTextLatch();

  private readonly specifiedNdbLatch = new MessageTextLatch();

  private readonly timeToExitLatch = new MessageTextLatch();

  private readonly takeoffTimeLatch = new MessageTextLatch();

  private readonly checkApprSelLatch = new MessageTextLatch();

  /** CHECK APPR SEL shown on the PFD */
  private checkApprSelOnPfd = false;

  /** The clock (UTC seconds of the day) at the previous cycle, for T.O TIME REACHED */
  private previousClock: number | null = null;

  /** The ETT that the clock has reached, null before */
  private reachedTakeoffTime: number | null = null;

  constructor(private readonly fmc: FlightManagementComputer) {
    // A new FMS (power-up, FMC reset) starts without the PFD message
    SimVar.SetSimVarValue(CHECK_APPR_SEL_PFD_VAR, 'bool', false);
  }

  /** Checks all the messages, once per FMS cycle */
  update(): void {
    const flightPlanService = this.fmc.flightPlanInterface;
    if (!flightPlanService.hasActive) {
      this.setCheckApprSelOnPfd(false);
      return;
    }
    const phase = this.fmc.fmgc.data.flightPhase.get();
    const navigation = this.fmc.navigation;

    // CHECK APPR SEL (l.44966-44979): an ILS manually tuned on the POSITION/NAVAIDS page that does not correspond with
    // the approach of the flight plan, near the T/D, in descent, or in approach above 800 ft (CheckApproachSelection)
    const mmr = navigation.getNavaidTuner().getMmrRadioTuningStatus(1);
    const tunedIls: ManuallyTunedIls | null =
      mmr.manual && (mmr.ident !== null || mmr.frequency !== null)
        ? { ident: mmr.facility?.ident ?? mmr.ident, frequency: mmr.frequency }
        : null;
    const approach = flightPlanService.active.approach;
    const finalLeg = approach ? approach.legs[approach.legs.length - 1] : undefined;
    const altitude = navigation.getBaroCorrectedAltitude();
    const destinationElevation = flightPlanService.active.destinationAirport?.location.alt;
    const checkApprSel = isCheckApproachSelection(
      approach ? { type: approach.type, ident: finalLeg?.recommendedNavaid?.ident ?? null } : null,
      tunedIls,
      recommendedNavaidFrequency(finalLeg),
      phase,
      this.fmc.guidanceController ? distanceToTopOfDescent(this.fmc.guidanceController) : null,
      altitude !== null && destinationElevation !== undefined ? altitude - destinationElevation : null,
    );
    this.apply(this.checkApprSelLatch, checkApprSel ? NXSystemMessages.checkApprSel : null);
    this.setCheckApprSelOnPfd(checkApprSel);

    // AREA RNP IS XX.XX (l.44876-44881) / PROC RNP IS XX.XX (l.45916-45920)
    const rnp = activeRnpMessage(navigation, flightPlanService);
    this.apply(
      this.rnpLatch,
      rnp === null
        ? null
        : (rnp.kind === 'area' ? NXSystemMessages.areaRnpIs : NXSystemMessages.procRnpIs).getModifiedMessage(
            formatRnpValue(rnp.rnp),
          ),
    );

    // CHECK IRS / ARPT POSITION (l.45028-45033), in the preflight phase (the IRS alignment on the ground)
    this.apply(
      this.irsAirportLatch,
      isOriginIrsPositionDisagree(flightPlanService, phase) ? NXSystemMessages.checkIrsArptPosition : null,
    );

    // EXPECT TURN AREA EXCEEDANCE (l.45384-45389): the aircraft will fly (the next leg) or is flying (the active leg) a
    // procedure turn that exceeds the excursion distance of the navigation database
    const guidance = this.fmc.guidanceController;
    const geometry = guidance?.activeGeometry;
    const legIndex = guidance?.activeLegIndex ?? 0;
    this.apply(
      this.turnAreaLatch,
      geometry &&
        isProcedureTurnExceedanceAhead([legIndex, legIndex + 1].map((i) => procedureTurnLeg(geometry.legs.get(i))))
        ? NXSystemMessages.expectTurnAreaExceedance
        : null,
    );

    // SPECIF NDB NOT AVAIL (l.46154-46157): the NDB of the NDB approach is deselected
    this.apply(
      this.specifiedNdbLatch,
      navigation.getNavaidTuner().getSpecifiedNdbMessage() ? NXSystemMessages.specifNdbNotAvail : null,
    );

    // TIME TO EXIT (l.46252-46256): in the holding, the extra fuel at the primary destination (EFOB - MIN FUEL AT DEST)
    // is zero
    const activeLeg = flightPlanService.active.activeLeg;
    const inHolding = !!activeLeg && activeLeg.isDiscontinuity === false && activeLeg.isHX();
    const destEfob = this.fmc.fmgc.getDestEFOB(true);
    const minDestFob = flightPlanService.active.performanceData.minimumDestinationFuelOnBoard.get();
    const extraFuel = destEfob !== null && minDestFob !== null ? destEfob - minDestFob : null;
    this.apply(this.timeToExitLatch, isTimeToExitHolding(inHolding, extraFuel) ? NXSystemMessages.timeToExit : null);

    // T.O TIME REACHED (l.46287-46291): the aircraft clock time reaches the ETT, shown until the takeoff or a new ETT
    const ett = this.fmc.fmgc.data.estimatedTakeoffTime.get();
    const clock = SimVar.GetSimVarValue('E:ZULU TIME', 'seconds');
    if (phase === FmgcFlightPhase.Preflight && ett !== null && hasClockReachedTime(this.previousClock, clock, ett)) {
      this.reachedTakeoffTime = ett;
    }
    this.previousClock = clock;
    this.apply(
      this.takeoffTimeLatch,
      phase === FmgcFlightPhase.Preflight && ett !== null && this.reachedTakeoffTime === ett
        ? NXSystemMessages.toTimeReached
        : null,
    );
  }

  /** Writes the PFD message L:var on a change */
  private setCheckApprSelOnPfd(shown: boolean): void {
    if (shown !== this.checkApprSelOnPfd) {
      this.checkApprSelOnPfd = shown;
      SimVar.SetSimVarValue(CHECK_APPR_SEL_PFD_VAR, 'bool', shown);
    }
  }

  /** Sends or recalls the message of a latch */
  private apply(latch: MessageTextLatch, wanted: TypeIIMessage | null): void {
    const update = latch.update(wanted?.text ?? null);
    if (update?.action === 'send' && wanted) {
      this.fmc.addMessageToQueue(wanted, undefined, undefined);
    } else if (update?.action === 'recall') {
      this.fmc.removeMessageFromQueue(update.text);
    }
  }
}
