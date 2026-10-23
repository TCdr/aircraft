// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { VdSymbol, VerticalPathCheckpoint } from '@flybywiresim/fbw-sdk';

/** A holding pattern the vertical display unfolds along its horizontal axis. */
export interface VdHold {
  /** Ident of the hold fix, shown again where the pattern ends */
  ident: string;
  /** Distance from the aircraft to the hold fix, NM */
  distanceFromAircraft: number;
  /** Length of one full pattern, NM */
  orbitLength: number;
  /** Altitude predicted at the hold fix, flown level through the pattern */
  altitude: number;
}

export interface VdHoldCandidate extends VdHold {
  legIndex: number;
}

/** Points closer than this to the hold fix still belong to the fix itself */
const HOLD_FIX_TOLERANCE_NM = 0.01;

/**
 * Whether the FMS predictions include the pattern: the deceleration point is flown in managed speed, or the entry fix
 * has been sequenced in a selected speed mode.
 */
export function isHoldInPredictions(speedManaged: boolean, holdLegIndex: number, activeLegIndex: number): boolean {
  return speedManaged || activeLegIndex >= holdLegIndex;
}

/**
 * Holds ahead of the aircraft that the vertical display unfolds, nearest first.
 * Design choice: one pattern per hold, because the FMS cannot know how many circuits ATC will request. A hold the
 * aircraft is already flying is drawn in full from its present position.
 */
export function selectUnfoldedHolds(
  candidates: readonly VdHoldCandidate[],
  activeLegIndex: number,
  speedManaged: boolean,
): VdHold[] {
  return candidates
    .filter(
      (hold) => hold.legIndex >= activeLegIndex && isHoldInPredictions(speedManaged, hold.legIndex, activeLegIndex),
    )
    .map((hold) => ({
      ident: hold.ident,
      distanceFromAircraft: Math.max(0, hold.distanceFromAircraft),
      orbitLength: hold.orbitLength,
      altitude: hold.altitude,
    }))
    .sort((a, b) => a.distanceFromAircraft - b.distanceFromAircraft);
}

/** Moves a distance along the vertical display axis past every pattern that lies before it. */
export function shiftDistanceForHolds(distance: number, holds: readonly VdHold[]): number {
  let shifted = distance;
  for (const hold of holds) {
    if (distance > hold.distanceFromAircraft + HOLD_FIX_TOLERANCE_NM) {
      shifted += hold.orbitLength;
    }
  }
  return shifted;
}

/**
 * Pushes the checkpoints behind each hold fix back by the pattern length and draws the pattern itself as a level line
 * at the altitude of the fix.
 */
export function unfoldHoldsInProfile(
  checkpoints: readonly VerticalPathCheckpoint[],
  holds: readonly VdHold[],
): VerticalPathCheckpoint[] {
  let result = checkpoints.slice();

  for (const hold of holds) {
    const unfolded: VerticalPathCheckpoint[] = [];
    let patternInserted = false;
    const patternEnd = hold.distanceFromAircraft + hold.orbitLength;

    for (const checkpoint of result) {
      const isBeyondFix = checkpoint.distanceFromAircraft > hold.distanceFromAircraft + HOLD_FIX_TOLERANCE_NM;
      if (isBeyondFix && !patternInserted) {
        unfolded.push(
          { ...checkpoint, distanceFromAircraft: hold.distanceFromAircraft, altitude: hold.altitude },
          { ...checkpoint, distanceFromAircraft: patternEnd, altitude: hold.altitude },
        );
        patternInserted = true;
      }
      unfolded.push(
        isBeyondFix
          ? { ...checkpoint, distanceFromAircraft: checkpoint.distanceFromAircraft + hold.orbitLength }
          : checkpoint,
      );
    }
    result = unfolded;
  }

  return result;
}

/**
 * Moves the symbols behind each hold fix back by the pattern length and shows the hold fix a second time where the
 * pattern ends.
 */
export function unfoldHoldsInSymbols(symbols: readonly VdSymbol[], holds: readonly VdHold[]): VdSymbol[] {
  const shifted = symbols.map((symbol) =>
    symbol.distanceFromAirplane === undefined
      ? symbol
      : { ...symbol, distanceFromAirplane: shiftDistanceForHolds(symbol.distanceFromAirplane, holds) },
  );

  for (const hold of holds) {
    const fixSymbol = symbols.find((symbol) => symbol.ident === hold.ident && !symbol.typePwp);
    if (fixSymbol) {
      shifted.push({
        ...fixSymbol,
        databaseId: `${fixSymbol.databaseId}HOLD`,
        distanceFromAirplane: hold.distanceFromAircraft + hold.orbitLength,
        predictedAltitude: hold.altitude,
      });
    }
  }

  return shifted;
}
