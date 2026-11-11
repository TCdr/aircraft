// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

export interface FlsReceiverHealth {
  /** the FMS computes a valid FLS beam for this axis */
  beamValid: boolean;
  /** the MMR of this display's side is failed, which takes its FLS away */
  flsFailed: boolean;
  /** the MMR of this display's side has power */
  mmrPowered: boolean;
}

/**
 * Whether this display's side can show the FLS deviation. The FMS computes one beam for both sides, but each side
 * receives it through its own MMR, as the flight guidance does: a dead MMR loses the FLS on its side only.
 */
export function isOwnSideFlsDeviationValid(health: FlsReceiverHealth): boolean {
  return health.beamValid && !health.flsFailed && health.mmrPowered;
}

const OWN_SIDE_FLS_FAILED_TOPICS = ['fls1Failed', 'fls2Failed'] as const;

/** The simvar topic of the FLS failure of the MMR a PFD reads: PFD 1 the MMR 1, PFD 2 the MMR 2 */
export function ownSideFlsFailedTopic(displayIndex: number) {
  return OWN_SIDE_FLS_FAILED_TOPICS[displayIndex === 2 ? 1 : 0];
}
