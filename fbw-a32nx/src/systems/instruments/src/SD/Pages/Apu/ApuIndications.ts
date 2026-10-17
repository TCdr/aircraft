// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * SD APU page:
 * - AVAIL: green when APU N is above 95 %.
 * - APU bleed air valve: green in line when not closed, green crossline when closed, amber crossline when closed with
 *   the APU BLEED pb ON, amber XX when the valve status or the APU BLEED pb status is not available.
 *
 * Design choices:
 * - The APU N, the valve status and the bleed pressure come from the APU ECB: its data are available when the APU N
 *   word (L:A32NX_APU_N) is in normal operation (the ECB is powered and on), as for the N, EGT and bleed pressure XX of
 *   the page. The APU BLEED pb status is always available (no failure of it is modelled).
 * - "The APU bleed is ON" keeps the 10 s confirmation of the APU BLEED pb, as on the BLEED page.
 */

/**
 * LOW OIL LEVEL advisory: the ECB detects a low APU oil level on ground with the APU not running. The ECB applies the
 * ground and not running conditions (L:A32NX_APU_LOW_OIL_LEVEL, systems apu/electronic_control_box.rs). The advisory
 * pulses; Design choice: green, as the other advisory of the page (FLAP OPEN).
 * @param ecbDataValid the APU_LOW_OIL_LEVEL word is in normal operation (the ECB is on)
 * @param lowOilLevel the word value
 */
export function isApuLowOilLevelShown(ecbDataValid: boolean, lowOilLevel: boolean): boolean {
  return ecbDataValid && lowOilLevel;
}

/** The APU N above which AVAIL shows, in percent */
const APU_AVAIL_N_PERCENT = 95;

export function isApuPageAvailVisible(apuNValid: boolean, apuNPercent: number): boolean {
  return apuNValid && apuNPercent > APU_AVAIL_N_PERCENT;
}

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
