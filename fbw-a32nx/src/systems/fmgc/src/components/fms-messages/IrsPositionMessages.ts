// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Arinc429Register, FMMessage } from '@flybywiresim/fbw-sdk';
import { FlightPlanService } from '@fmgc/flightplanning/FlightPlanService';
import { GuidanceController } from '@fmgc/guidance/GuidanceController';
import { Navigation } from '@fmgc/navigation/Navigation';
import { FmNavigationMode } from '@fmgc/navigation/PositionUncertainty';
import { FlightArea } from '@fmgc/navigation/FlightArea';
import { FmgcFlightPhase } from '@shared/flightphase';
import { Coordinates } from 'msfs-geo';

import { FMMessageSelector, FMMessageUpdate } from './FmsMessages';
import { FMMessageTypes } from './FmMessages';
import { IrsOnlyNavigationLogic, isIrsAirportPositionDisagree, MessageTextLatch } from './FmsMessageConditions';

const irsPositionWord = Arinc429Register.empty();

/**
 * The positions of the three IRS (L:A32NX_ADIRS_IR_n_LATITUDE / _LONGITUDE, both aircraft), null for an IRS that has no
 * valid position (not aligned, off).
 * @returns the three positions
 */
export function readIrsPositions(): (Coordinates | null)[] {
  const positions: (Coordinates | null)[] = [];
  for (let ir = 1; ir <= 3; ir++) {
    irsPositionWord.setFromSimVar(`L:A32NX_ADIRS_IR_${ir}_LATITUDE`);
    const lat = irsPositionWord.isNormalOperation() ? irsPositionWord.value : null;
    irsPositionWord.setFromSimVar(`L:A32NX_ADIRS_IR_${ir}_LONGITUDE`);
    const long = irsPositionWord.isNormalOperation() ? irsPositionWord.value : null;
    positions.push(lat !== null && long !== null ? { lat, long } : null);
  }
  return positions;
}

/**
 * Whether an IRS position disagrees with the origin airport of the active flight plan, checked in the preflight phase
 * (the IRS alignment position on the ground). Shared by the A320 MCDU and the A380 MFD.
 * @param flightPlanService the flight plan service
 * @param flightPhase the FMGC flight phase
 * @returns whether the CHECK IRS/AIRPORT POS (A320) / CHECK IRS / ARPT POSITION (A380) message applies
 */
export function isOriginIrsPositionDisagree(
  flightPlanService: FlightPlanService,
  flightPhase: FmgcFlightPhase,
): boolean {
  if (flightPhase !== FmgcFlightPhase.Preflight || !flightPlanService.hasActive) {
    return false;
  }
  return isIrsAirportPositionDisagree(readIrsPositions(), flightPlanService.active.originAirport?.location ?? null);
}

/**
 * CHECK IRS/AIRPORT POS (A320 FCOM l.22539, l.22552-22553): "The distance between ADIRS alignment position and the NAV
 * Database Airport Reference Point is at least 5 NM." Recalled when the positions agree again (e.g. the FROM airport is
 * corrected) or after the preflight phase.
 */
export class CheckIrsAirportPosition implements FMMessageSelector {
  public readonly message: FMMessage = FMMessageTypes.CheckIrsAirportPosition;

  private readonly latch = new MessageTextLatch();

  private flightPlanService?: FlightPlanService;

  init(_navigation: Navigation, _guidanceController: GuidanceController, flightPlanService: FlightPlanService): void {
    this.flightPlanService = flightPlanService;
  }

  process(_deltaTime: number): FMMessageUpdate {
    if (!this.flightPlanService) {
      return FMMessageUpdate.NO_ACTION;
    }
    const phase = SimVar.GetSimVarValue('L:A32NX_FMGC_FLIGHT_PHASE', 'number') as FmgcFlightPhase;
    const disagree = isOriginIrsPositionDisagree(this.flightPlanService, phase);
    return latchToUpdate(this.latch.update(disagree ? this.message.text! : null));
  }
}

/**
 * IRS ONLY NAVIGATION (A320 FCOM l.22740, l.22750-22756): the aircraft is neither in an approach nor in a terminal area,
 * and it has been in IRS (only) mode for more than 10 min, or it is in IRS mode and starting the descent phase.
 */
export class IrsOnlyNavigation implements FMMessageSelector {
  public readonly message: FMMessage = FMMessageTypes.IrsOnlyNavigation;

  private readonly logic = new IrsOnlyNavigationLogic();

  private readonly latch = new MessageTextLatch();

  private navigation?: Navigation;

  private flightPlanService?: FlightPlanService;

  init(navigation: Navigation, _guidanceController: GuidanceController, flightPlanService: FlightPlanService): void {
    this.navigation = navigation;
    this.flightPlanService = flightPlanService;
  }

  process(deltaTime: number): FMMessageUpdate {
    if (!this.navigation || !this.flightPlanService) {
      return FMMessageUpdate.NO_ACTION;
    }
    const area = this.flightPlanService.hasActive ? this.flightPlanService.active.calculateActiveArea() : null;
    const enroute = area === null || area === FlightArea.Enroute || area === FlightArea.Oceanic;
    const show = this.logic.update(
      deltaTime,
      this.navigation.getNavigationMode() === FmNavigationMode.IrsOnly,
      enroute,
      SimVar.GetSimVarValue('L:A32NX_FMGC_FLIGHT_PHASE', 'number') as FmgcFlightPhase,
    );
    return latchToUpdate(this.latch.update(show ? this.message.text! : null));
  }
}

/** The FM message update of a latch update */
function latchToUpdate(update: ReturnType<MessageTextLatch['update']>): FMMessageUpdate {
  if (update === null) {
    return FMMessageUpdate.NO_ACTION;
  }
  return update.action === 'send' ? FMMessageUpdate.SEND : FMMessageUpdate.RECALL;
}
