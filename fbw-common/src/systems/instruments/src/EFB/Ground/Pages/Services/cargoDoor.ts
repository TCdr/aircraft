// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { M3Tone } from '../../../UtilComponents/Material/Material';

/** Position of the hydraulic forward cargo door from the systems (Rust CargoDoor), in percent: 0 closed, 100 open */
export const FWD_CARGO_DOOR_POSITION_VAR = 'L:A32NX_FWD_DOOR_CARGO_POSITION';

/** Whether the forward cargo door is closed and locked (Rust CargoDoor) */
export const FWD_CARGO_DOOR_LOCKED_VAR = 'L:A32NX_FWD_DOOR_CARGO_LOCKED';

/** The same for the aft cargo door (A380) */
export const AFT_CARGO_DOOR_POSITION_VAR = 'L:A32NX_AFT_DOOR_CARGO_POSITION';
export const AFT_CARGO_DOOR_LOCKED_VAR = 'L:A32NX_AFT_DOOR_CARGO_LOCKED';

/**
 * A380 only: the cargo door actuation has no hydraulic power (A380 Rust hydraulics). The green electric pumps, the only
 * power of the cargo door actuation, are inhibited as soon as engine 1 or 2 runs.
 */
export const CARGO_DOOR_OPERATION_INHIBITED_VAR = 'L:A32NX_HYD_CARGO_DOOR_OPERATION_INHIBITED';

/** From this position the hydraulic door controller up-locks the door (Rust HydraulicDoorController, 98 %) */
const FULLY_OPEN_PERCENT = 98;

/** What the page knows about a hydraulic cargo door */
export interface CargoDoorState {
  /** The door position from the systems, in percent */
  positionPercent: number;
  /** The door is closed and locked */
  locked: boolean;
  /** The door actuation has no hydraulic power: the door cannot move */
  operationInhibited: boolean;
  /** The ground crew request (the sim interactive point of the door), which the systems follow when they can */
  requestedOpen: boolean;
}

/**
 * How open the door is for the page: 0 only when closed and locked, 1 from the up-lock position, the position in
 * between (at least a little above 0: an unlocked door is not closed, even if it has barely moved).
 */
export function cargoDoorOpening(door: CargoDoorState): number {
  if (door.locked) {
    return 0;
  }
  if (door.positionPercent >= FULLY_OPEN_PERCENT) {
    return 1;
  }
  return Math.min(Math.max(door.positionPercent / 100, 0.01), 0.99);
}

/** The localisation key of the status line of the door row */
export function cargoDoorStatusKey(door: CargoDoorState): string {
  if (door.locked) {
    if (!door.operationInhibited) {
      // a requested door unlocks in the next seconds: the row shows it as moving from then on
      return 'Ground.Services.Closed';
    }
    return door.requestedOpen ? 'Ground.Services.CargoDoorOpenPendingNoHyd' : 'Ground.Services.CargoDoorClosedNoHyd';
  }
  if (door.operationInhibited) {
    return 'Ground.Services.CargoDoorStoppedNoHyd';
  }
  return door.requestedOpen && door.positionPercent >= FULLY_OPEN_PERCENT
    ? 'Ground.Services.Open'
    : 'Ground.Services.Moving';
}

/** The tone of the door row: a door stuck unlocked without hydraulic power is a warning */
export function cargoDoorTone(door: CargoDoorState): M3Tone {
  if (!door.locked && door.operationInhibited) {
    return 'warn';
  }
  const opening = cargoDoorOpening(door);
  return opening >= 1 ? 'active' : opening > 0 ? 'busy' : 'idle';
}

/**
 * One row for two doors moved by the same request (the A380 forward and aft cargo doors): the row is closed only when
 * both are locked and open only when both are open, so the position is the one of the door the furthest from the
 * request.
 */
export function combineCargoDoors(a: CargoDoorState, b: CargoDoorState): CargoDoorState {
  const requestedOpen = a.requestedOpen || b.requestedOpen;
  return {
    positionPercent: requestedOpen
      ? Math.min(a.positionPercent, b.positionPercent)
      : Math.max(a.positionPercent, b.positionPercent),
    locked: a.locked && b.locked,
    operationInhibited: a.operationInhibited || b.operationInhibited,
    requestedOpen,
  };
}

/**
 * Whether the door switch can be used. Without hydraulic power a locked door cannot be opened, but an open request
 * can be cancelled and an unlocked door can be asked to close: the door follows once the power is back.
 */
export function cargoDoorCanToggle(door: CargoDoorState): boolean {
  return !door.operationInhibited || !door.locked || door.requestedOpen;
}
