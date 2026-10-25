// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

export interface NewFlightInput {
  /** The OFP that is loaded now is the one the aircraft has already flown */
  flownOfp: boolean;
  onGround: boolean;
  atDepartureAirport: boolean;
}

/**
 * A flown OFP that is loaded again on the ground at its own departure airport is a new flight of the same OFP (the
 * flight was reloaded in the sim): what was recorded for it describes the previous flight. At the destination the same
 * OFP is the finished flight, so only the position tells the two apart.
 */
export const isNewFlightOfFlownOfp = ({ flownOfp, onGround, atDepartureAirport }: NewFlightInput): boolean =>
  flownOfp && onGround && atDepartureAirport;
