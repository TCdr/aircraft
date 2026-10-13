// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * SD APU page (A320 FCOM DSC-49-20-B ECAM APU PAGE, a320_fcom.txt l.60758-60770):
 * - (1) AVAIL, l.60758-60759: "Displayed in green when APU N is above 95 %."
 * - (2) APU bleed air valve position, l.60763-60770: "Inline-Green: The APU bleed air valve is not closed. Crossline-Green:
 *   The APU bleed air valve is closed. Crossline-Amber: The APU bleed air valve is closed and the APU bleed is ON. XX-Amber:
 *   The APU bleed air valve status information is not available, or the APU BLEED pb status is not available."
 *
 * Design choices:
 * - The APU N, the valve status and the bleed pressure come from the APU ECB: its data are available when the APU N word
 *   (L:A32NX_APU_N) is in normal operation (the ECB is powered and on), as for the N, EGT and bleed pressure XX of the page.
 *   The APU BLEED pb status is always available (no failure of it is modelled).
 * - "The APU bleed is ON" keeps the 10 s confirmation of the APU BLEED pb the page already had (the BLEED page rule,
 *   l.57807-57808).
 */

/** l.60759: the APU N above which AVAIL shows, in percent */
export const APU_AVAIL_N_PERCENT = 95;

/** l.60759: the AVAIL of the APU page */
export function isApuPageAvailVisible(apuNValid: boolean, apuNPercent: number): boolean {
  return apuNValid && apuNPercent > APU_AVAIL_N_PERCENT;
}

/** l.60763-60770: how the APU bleed air valve shows */
export type ApuBleedValveDisplay = 'inline-green' | 'crossline-green' | 'crossline-amber' | 'xx-amber';

/**
 * @param valveStatusAvailable the ECB sends the valve status (APU N word in normal operation)
 * @param valveOpen L:A32NX_APU_BLEED_AIR_VALVE_OPEN
 * @param bleedPbOnConfirmed the APU BLEED pb has been ON for 10 s
 */
export function apuBleedValveDisplay(
  valveStatusAvailable: boolean,
  valveOpen: boolean,
  bleedPbOnConfirmed: boolean,
): ApuBleedValveDisplay {
  if (!valveStatusAvailable) {
    return 'xx-amber';
  }
  if (valveOpen) {
    return 'inline-green';
  }
  return bleedPbOnConfirmed ? 'crossline-amber' : 'crossline-green';
}
