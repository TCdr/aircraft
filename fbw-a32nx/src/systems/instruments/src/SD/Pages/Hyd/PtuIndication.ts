// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * Colour of the PTU symbol on the SD HYD page. A320 FCOM DSC-29-20 HYD page item (9) PTU control (a320_fcom.txt
 * l.44009-44016): "Green: The power transfer unit (PTU) pushbutton switch is in AUTO and the PTU is not transferring
 * pressure. Amber: The PTU pb-sw is OFF." The page used the PTU control valve, which also closes for the automatic
 * inhibitions (first engine start with the parking brake set or the NWS pin in, cargo door operation), so the symbol
 * turned amber with the pb-sw at AUTO.
 * @param ptuPbIsAuto the PTU pb-sw is at AUTO
 * @returns 'Green' or 'Amber'
 */
export function ptuSymbolColor(ptuPbIsAuto: boolean): 'Green' | 'Amber' {
  return ptuPbIsAuto ? 'Green' : 'Amber';
}
