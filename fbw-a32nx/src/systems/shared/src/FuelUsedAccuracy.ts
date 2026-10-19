// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The fuel flow must be invalid in flight for more than this before the fuel used is of degraded accuracy, in seconds */
const FUEL_FLOW_INVALID_SECONDS_BEFORE_DEGRADED = 60;

/** Two amber dashes in place of a fuel used of degraded accuracy */
export const FUEL_USED_DEGRADED_TEXT = '--';

/** FBW engine states (L:A32NX_ENGINE_STATE:n) of a start: the FADEC resets the fuel used of an engine started on ground */
const ENGINE_STATE_STARTING = 2;
const ENGINE_STATE_RESTARTING = 3;

/**
 * The accuracy of the fuel used of one engine (SD ENG and FUEL pages: two amber dashes in place of the value when degraded).
 * The fuel used is integrated from the fuel flow, so it is of degraded accuracy once the fuel flow was not valid in flight for
 * more than 1 min. Design choice: it stays degraded until the fuel used is reset at the next engine start on ground, as the
 * fuel not counted is missing from it until then.
 */
export class FuelUsedAccuracy {
  private secondsFuelFlowInvalidInFlight = 0;

  private degraded = false;

  /**
   * @param deltaSeconds the time since the previous update
   * @param fuelFlowValid the FADEC sends the fuel flow (L:A32NX_FADEC_POWERED_ENGn)
   * @param onGround the aircraft is on the ground
   * @param engineState L:A32NX_ENGINE_STATE:n
   * @returns the fuel used is of degraded accuracy
   */
  update(deltaSeconds: number, fuelFlowValid: boolean, onGround: boolean, engineState: number): boolean {
    if (onGround && (engineState === ENGINE_STATE_STARTING || engineState === ENGINE_STATE_RESTARTING)) {
      this.degraded = false;
      this.secondsFuelFlowInvalidInFlight = 0;
    } else if (!onGround && !fuelFlowValid) {
      this.secondsFuelFlowInvalidInFlight += deltaSeconds;
      if (this.secondsFuelFlowInvalidInFlight > FUEL_FLOW_INVALID_SECONDS_BEFORE_DEGRADED) {
        this.degraded = true;
      }
    } else {
      this.secondsFuelFlowInvalidInFlight = 0;
    }
    return this.degraded;
  }
}
