// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The APU BLEED VALVE symbol of the SD BLEED page. A380 FCOM DSC-36-20 (a380_fcom.txt l.94372-94390):
 * "Appears only if APU pb-sw is ON." Green closed, green open, "abnormally open, and the APU BLEED pb-sw is ON",
 * "abnormally closed, and the APU BLEED pb-sw is ON", "in transit".
 * APU BLEED pb-sw (l.94304-94310): "The APU bleed valve is open, provided that: The APU is running, The aircraft altitude
 * is below 22 500 ft, No APU leak is detected."
 * Simplifications: the valve should be open when the APU BLEED pb-sw is ON and the APU is AVAIL. The 22 500 ft limit and
 * the APU leak are not modelled by the APU ECB (the valve stays open above 22 500 ft), so they are left out here, else
 * the valve would show amber in every climb with the APU bleed on. The valve moves instantly: no transit state.
 */

/**
 * @param valveOpen the APU bleed valve is open (L:A32NX_APU_BLEED_AIR_VALVE_OPEN)
 * @param apuBleedPbOn the APU BLEED pb-sw is ON (L:A32NX_OVHD_APU_BLEED_PB_IS_ON)
 * @param apuAvailable the APU is AVAIL (L:A32NX_OVHD_APU_START_PB_IS_AVAILABLE)
 * @returns the valve is abnormally open or abnormally closed (amber)
 */
export function isApuBleedValveAbnormal(valveOpen: boolean, apuBleedPbOn: boolean, apuAvailable: boolean): boolean {
  if (!apuBleedPbOn) {
    return false;
  }
  const shouldBeOpen = apuAvailable;
  return valveOpen !== shouldBeOpen;
}
