// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * Colour of the PTU symbol on the SD HYD page: green with the PTU pb-sw in AUTO and the PTU not transferring, amber
 * with the PTU pb-sw OFF. Not the PTU control valve: it also closes for the automatic inhibitions
 * (first engine start with the parking brake set or the NWS pin in, cargo door operation) with the pb-sw at AUTO.
 * @param ptuPbIsAuto the PTU pb-sw is at AUTO
 * @returns 'Green' or 'Amber'
 */
export function ptuSymbolColor(ptuPbIsAuto: boolean): 'Green' | 'Amber' {
  return ptuPbIsAuto ? 'Green' : 'Amber';
}
