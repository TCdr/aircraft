// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The drift down altitude as the whole flight level the PERF page shows, null when there is none */
export function driftDownFlightLevel(driftDownAltitude: Feet | undefined): number | null {
  return driftDownAltitude !== undefined && Number.isFinite(driftDownAltitude)
    ? Math.round(driftDownAltitude / 100)
    : null;
}
