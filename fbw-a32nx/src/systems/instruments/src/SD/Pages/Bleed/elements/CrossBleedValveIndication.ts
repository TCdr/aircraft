// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** X BLEED selector positions (L:A32NX_KNOB_OVHD_AIRCOND_XBLEED_Position) */
export enum CrossBleedSelectorPosition {
  Shut = 0,
  Auto = 1,
  Open = 2,
}

/**
 * Whether the BMC commands the crossbleed valve open: SHUT and OPEN are manual, AUTO opens it while the APU bleed valve
 * is open (A320 FCOM DSC-36-20 X BLEED selector; the same derivation as the FWC X BLEED FAULT caution,
 * systems-host FWC/Logic/BleedAlerts.ts isCrossBleedValveCommandedOpen). Simplification: the automatic closure on a
 * wing, pylon or APU leak (pneumatic.rs) is not seen here; a leak also closes the APU bleed valve.
 * @param selector the X BLEED selector position
 * @param apuBleedValveOpen whether the APU bleed valve is open
 * @returns true when the valve is commanded open
 */
export function isCrossBleedValveCommandedOpen(selector: number, apuBleedValveOpen: boolean): boolean {
  switch (selector) {
    case CrossBleedSelectorPosition.Open:
      return true;
    case CrossBleedSelectorPosition.Shut:
      return false;
    default:
      return apuBleedValveOpen;
  }
}

/**
 * Whether the crossbleed valve symbol is amber. A320 FCOM DSC-36-20 BLEED page, CROSSBLEED VALVE (a320_fcom.txt
 * l.57810-57831): green crossline/in line when normally closed/open; "Crossline - Amber: The crossbleed valve is not
 * in the commanded (closed) position", "In line - Amber: The crossbleed valve is not in the commanded (open)
 * position", "Transit - Amber: The crossbleed valve is in transit."
 * @param commandedOpen whether the valve is commanded open (isCrossBleedValveCommandedOpen)
 * @param fullyOpen L:A32NX_PNEU_XBLEED_VALVE_FULLY_OPEN
 * @param fullyClosed L:A32NX_PNEU_XBLEED_VALVE_FULLY_CLOSED
 * @returns true when the symbol is amber
 */
export function isCrossBleedValveAmber(commandedOpen: boolean, fullyOpen: boolean, fullyClosed: boolean): boolean {
  const inTransit = !fullyOpen && !fullyClosed;
  if (inTransit) {
    return true;
  }
  return commandedOpen ? !fullyOpen : !fullyClosed;
}
