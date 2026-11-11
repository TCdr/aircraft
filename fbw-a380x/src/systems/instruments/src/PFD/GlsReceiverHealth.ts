// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

export interface GlsReceiverHealth {
  /** the GLS function, or the whole MMR, of this display's side is failed */
  glsFailed: boolean;
  /** the ground station of the GLS is failed */
  stationFailed: boolean;
  /** the MMR of this display's side has power */
  mmrPowered: boolean;
}

/**
 * Whether the GLS of this display's side can send nothing at all. An MMR without power counts: it will not receive the
 * station however long the crew waits, so it must not look like a receiver that is still waiting for the signal.
 */
export function isGlsReceiverInoperative(health: GlsReceiverHealth): boolean {
  return health.glsFailed || health.stationFailed || !health.mmrPowered;
}
