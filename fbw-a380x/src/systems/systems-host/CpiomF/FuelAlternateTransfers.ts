// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  FEED_TANK_1,
  FEED_TANK_2,
  FEED_TANK_3,
  FEED_TANK_4,
  FuelMove,
  isTankEmpty,
  LEFT_INNER_TANK,
  LEFT_MID_TANK,
  LEFT_OUTER_TANK,
  moveFuel,
  RIGHT_INNER_TANK,
  RIGHT_MID_TANK,
  RIGHT_OUTER_TANK,
  TankLevels,
} from './FuelTransferSchedule';

/*
 * The A380 alternate fuel transfers after a transfer pump failure: the FQMS keeps transferring automatically, by
 * alternate transfers when the normal ones are lost. The simulation only has pump failures: the gallery functionality
 * swap (INR TK PMP, MID TK PMP failed) and the gravity transfer from the outer tanks (OUTR TK PMP failed). The other
 * alternate transfers follow transfer valve failures, which the simulation does not have.
 */

/** A gravity transfer from an outer tank with a failed pump is in progress: FUEL NORM XFR FAULT */
export const OUTR_TK_GRAVITY_XFR_IN_PROGRESS_VAR = 'L:A380X_FUEL_ALTN_OUTR_TK_GRAVITY_XFR_IN_PROGRESS';

/**
 * The outer tank gravity transfer starts when the lowest feed tank goes below this quantity, so it comes before the
 * transfer from the trim tank.
 */
export const OUTER_GRAVITY_START_LOWEST_FEED_TANK_LB = 28_660;

/**
 * The gravity flow out of an outer tank, in gallons per hour. Design choice: no rate is published; this is the
 * 500 gal/h of the gravity lines of the MSFS fuel system (flight_model.cfg Line.142-145).
 */
export const OUTER_TANK_GRAVITY_RATE_GAL_PER_H = 500;

/**
 * The main transfer rate from an inner or mid tank, in pounds per hour per feed tank (approximate published value).
 * Both tanks of the pair pump into the forward gallery: one tank gives half of it.
 */
export const MAIN_TRANSFER_RATE_LB_PER_H_PER_FEED_TANK = 22_050;

/**
 * Gravity transfer from the outer tanks: with FUEL L(R) OUTR TK PMP FAULT the outer tank fuel goes by gravity, all
 * the other transfers stay normal. It starts below OUTER_GRAVITY_START_LOWEST_FEED_TANK_LB, together with FUEL NORM
 * XFR FAULT, whose procedure opens the emergency outer tank transfer valves. The outer tank fuel then goes to feed
 * tanks 1 and 4 through the forward gallery and the emergency valves, and to feed tanks 2 and 3 through the aft
 * gallery.
 * The flow into feed tanks 1 and 4 is the MSFS gravity line of the emergency outer tank transfer valves
 * (CpiomF/FuelEmerOuterTransfer, EMER OUTR TK XFR pb-sw); this transfer is the flow into feed tank 2 (left outer tank)
 * and 3 (right outer tank). In flight only, as the other automatic transfers; it stops when the outer tank is empty or
 * its pump is repaired.
 */
export class OuterTankGravityTransferLogic {
  private readonly started: [boolean, boolean] = [false, false];

  /**
   * @param inFlight whether the aircraft is in flight
   * @param outerPumpFailed whether the left and right outer tank pumps are failed
   * @param outerTankEmpty whether the left and right outer tanks are empty
   * @param lowestFeedTankLb the fuel in the feed tank holding the least, in pounds
   * @returns whether the gravity transfer runs from the left and right outer tanks
   */
  public update(
    inFlight: boolean,
    outerPumpFailed: readonly [boolean, boolean],
    outerTankEmpty: readonly [boolean, boolean],
    lowestFeedTankLb: number,
  ): [boolean, boolean] {
    for (const side of [0, 1]) {
      if (!inFlight || !outerPumpFailed[side] || outerTankEmpty[side]) {
        this.started[side] = false;
      } else if (lowestFeedTankLb < OUTER_GRAVITY_START_LOWEST_FEED_TANK_LB) {
        this.started[side] = true;
      }
    }
    return [this.started[0], this.started[1]];
  }
}

const OUTER_GRAVITY_ROUTES = [
  { outer: LEFT_OUTER_TANK, feedTank: FEED_TANK_2 },
  { outer: RIGHT_OUTER_TANK, feedTank: FEED_TANK_3 },
];

/** The fuel moves of the outer tank gravity transfers over one update (MSFS tanks moved directly: no such MSFS line) */
export function outerTankGravityMoves(
  running: readonly [boolean, boolean],
  levels: TankLevels,
  deltaTimeS: number,
): FuelMove[] {
  const moves: FuelMove[] = [];
  OUTER_GRAVITY_ROUTES.forEach(({ outer, feedTank }, side) => {
    if (running[side]) {
      moves.push(...moveFuel(levels, outer, [[feedTank]], (OUTER_TANK_GRAVITY_RATE_GAL_PER_H * deltaTimeS) / 3600));
    }
  });
  return moves;
}

/** A forward transfer pump of an inner or mid tank, and its tank */
export interface ForwardGalleryPump {
  /** The MSFS pump (Pump.N) */
  readonly pump: number;
  /** The MSFS tank (Tank.N) */
  readonly tank: number;
  /** The circuit of the aft pump of the same tank (its pb-sw), which takes over when the fwd pump fails */
  readonly aftPumpCircuit: number;
}

/**
 * The fwd pumps of the inner and mid tanks (flight_model.cfg Pump.12, 13, 10, 15) and the circuits of the aft pumps of their
 * tanks (systems.cfg circuit.74, 79, 72, 77: L(R) INR(MID) TK AFT pb-sw, CpiomF/FuelManualTransfer)
 */
export const FORWARD_GALLERY_PUMPS: readonly ForwardGalleryPump[] = [
  { pump: 12, tank: LEFT_INNER_TANK, aftPumpCircuit: 74 },
  { pump: 13, tank: RIGHT_INNER_TANK, aftPumpCircuit: 79 },
  { pump: 10, tank: LEFT_MID_TANK, aftPumpCircuit: 72 },
  { pump: 15, tank: RIGHT_MID_TANK, aftPumpCircuit: 77 },
];

/**
 * The feed tanks with an open inlet valve of the main transfers from the inner and mid tanks (flight_model.cfg
 * Valve.11 FeedTank1FwdTransferValve2, Valve.12 / 14 FeedTank2FwdTransferValve2_1 / 2_2, Valve.13 / 15
 * FeedTank3FwdTransferValve2_1 / 2_2, Valve.16 FeedTank4FwdTransferValve2, which the triggers of CpiomF/LegacyFuel open)
 */
export const MAIN_TRANSFER_FEED_TANK_VALVES: readonly { feedTank: number; valves: readonly number[] }[] = [
  { feedTank: FEED_TANK_1, valves: [11] },
  { feedTank: FEED_TANK_2, valves: [12, 14] },
  { feedTank: FEED_TANK_3, valves: [13, 15] },
  { feedTank: FEED_TANK_4, valves: [16] },
];

/**
 * Gallery functionality swap: with FUEL L(R) INR(MID) TK FWD PMP FAULT, the main and load alleviation transfers of the
 * affected tank go through the aft gallery; all the other transfers stay normal.
 * The MSFS main transfers run the fwd pumps of both inner (mid) tanks into the forward gallery; a failed fwd pump is held
 * off (CpiomF/FuelPumpsAndValves), so the fuel of its tank would stay there. When the FQMS commands a failed fwd pump on,
 * the aft pump of its tank (pb-sw ON) takes over: the fuel moves from that tank into the feed tanks that receive the main
 * transfer, at half the main rate per feed tank (the share of one of the two tanks pumping). The MSFS tanks are moved
 * directly (the aft gallery lines are used by other transfers).
 * @param substitutedTanks the inner or mid tanks whose failed fwd pump the FQMS commands on and whose aft pump can run
 * @param receivingFeedTanks the feed tanks receiving the main transfer (open inlet valve)
 * @param levels the tank levels, updated with the moves
 * @param poundsPerGallon the fuel density
 * @param deltaTimeS the time of the update, in seconds
 */
export function galleryFunctionalitySwapMoves(
  substitutedTanks: readonly number[],
  receivingFeedTanks: readonly number[],
  levels: TankLevels,
  poundsPerGallon: number,
  deltaTimeS: number,
): FuelMove[] {
  const moves: FuelMove[] = [];
  if (receivingFeedTanks.length === 0) {
    return moves;
  }
  const gallonsPerFeedTank = ((MAIN_TRANSFER_RATE_LB_PER_H_PER_FEED_TANK / 2) * (deltaTimeS / 3600)) / poundsPerGallon;
  for (const tank of substitutedTanks) {
    if (isTankEmpty(levels, tank)) {
      continue;
    }
    for (const feedTank of receivingFeedTanks) {
      moves.push(...moveFuel(levels, tank, [[feedTank]], gallonsPerFeedTank));
    }
  }
  return moves;
}
