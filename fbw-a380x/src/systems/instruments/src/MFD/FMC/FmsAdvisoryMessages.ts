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

import { NXSystemMessages, TypeIIMessage } from '../shared/NXSystemMessages';
import type { FlightManagementComputer } from './FlightManagementComputer';

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
 * CHECK DATABASE CYCLE: the current date is outside the validity of the active navigation database. Checked when the
 * flight crew enters a FROM/TO airport or a company route.
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
 * The type II FMS messages that the FMS raises from its
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

  /** The clock (UTC seconds of the day) at the previous cycle, for T.O TIME REACHED */
  private previousClock: number | null = null;

  /** The ETT that the clock has reached, null before */
  private reachedTakeoffTime: number | null = null;

  constructor(private readonly fmc: FlightManagementComputer) {}

  /** Checks all the messages, once per FMS cycle */
  update(): void {
    const flightPlanService = this.fmc.flightPlanInterface;
    if (!flightPlanService.hasActive) {
      return;
    }
    const phase = this.fmc.fmgc.data.flightPhase.get();
    const navigation = this.fmc.navigation;

    // AREA RNP IS XX.XX / PROC RNP IS XX.XX
    const rnp = activeRnpMessage(navigation, flightPlanService);
    this.apply(
      this.rnpLatch,
      rnp === null
        ? null
        : (rnp.kind === 'area' ? NXSystemMessages.areaRnpIs : NXSystemMessages.procRnpIs).getModifiedMessage(
            formatRnpValue(rnp.rnp),
          ),
    );

    // CHECK IRS / ARPT POSITION, in the preflight phase (the IRS alignment on the ground)
    this.apply(
      this.irsAirportLatch,
      isOriginIrsPositionDisagree(flightPlanService, phase) ? NXSystemMessages.checkIrsArptPosition : null,
    );

    // EXPECT TURN AREA EXCEEDANCE: the aircraft will fly (the next leg) or is flying (the active leg) a
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

    // SPECIF NDB NOT AVAIL: the NDB of the NDB approach is deselected
    this.apply(
      this.specifiedNdbLatch,
      navigation.getNavaidTuner().getSpecifiedNdbMessage() ? NXSystemMessages.specifNdbNotAvail : null,
    );

    // TIME TO EXIT: in the holding, the extra fuel at the primary destination (EFOB - MIN FUEL AT DEST)
    // is zero
    const activeLeg = flightPlanService.active.activeLeg;
    const inHolding = !!activeLeg && activeLeg.isDiscontinuity === false && activeLeg.isHX();
    const destEfob = this.fmc.fmgc.getDestEFOB(true);
    const minDestFob = flightPlanService.active.performanceData.minimumDestinationFuelOnBoard.get();
    const extraFuel = destEfob !== null && minDestFob !== null ? destEfob - minDestFob : null;
    this.apply(this.timeToExitLatch, isTimeToExitHolding(inHolding, extraFuel) ? NXSystemMessages.timeToExit : null);

    // T.O TIME REACHED: the aircraft clock time reaches the ETT, shown until the takeoff or a new ETT
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
