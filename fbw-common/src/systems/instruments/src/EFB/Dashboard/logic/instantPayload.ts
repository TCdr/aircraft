// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * Boarding is a service of a parked aircraft. Anywhere else (engines running, or not on the ground) nobody can board
 * it, so the imported OFP load goes into the aircraft at once.
 */
export const loadsPayloadAtOnce = (onGround: boolean, anyEngineRunning: boolean): boolean =>
  !onGround || anyEngineRunning;
