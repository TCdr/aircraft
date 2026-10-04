// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** How the SD FUEL page shows an engine LP valve. */
export interface EngineLpValveIndication {
  /** true for the inline (open) symbol, false for the crossline (closed) symbol */
  inline: boolean;
  /** true when the symbol is amber, false when it is green */
  amber: boolean;
}

/** The valve is shown open from half travel, as the other valves of the page. */
const OPEN_THRESHOLD_PERCENT = 50;

/**
 * The engine LP valve symbol of the SD FUEL page. FCOM DSC-28-20 FUEL SYSTEM DISPLAY - PMPS, VALVES, ENGINE LP VALVE:
 * - Inline - Green: "The valve is open."
 * - Inline - Amber: "The valve is abnormally open." (FUEL ENG 1(2)(3)(4) LP VLV FAULT)
 * - Crossline - Amber: "The valve is normally or abnormally closed."
 *
 * The valve is abnormally open when it is open although it is commanded closed, by its ENG MASTER lever or its
 * ENG FIRE pb (FCOM DSC-28-10 ENGINE LP VALVES).
 * @param openPercentage the LP valve position, 0 (closed) to 100 (open)
 * @param commandedOpen whether the ENG MASTER lever is ON and the ENG FIRE pb is not pushed
 * @returns the symbol and its colour
 */
export function engineLpValveIndication(openPercentage: number, commandedOpen: boolean): EngineLpValveIndication {
  const inline = openPercentage >= OPEN_THRESHOLD_PERCENT;

  return { inline, amber: !inline || !commandedOpen };
}
