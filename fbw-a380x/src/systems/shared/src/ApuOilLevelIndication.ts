// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * OIL LVL LO INDICATION of the APU SD page (FCOM gap report 2026-10-10, A380X ATA 49 row #17). A380 FCOM DSC-49-20
 * (a380_fcom.txt l.108682-108693): "Pulses, and indicates a low quantity of APU oil. The APU can continue to operate
 * normally for at least 14 h." "Note: The OIL LVL LO indication is inhibited in flight." DSC-49-10 OIL QUANTITY
 * (l.108376-108390): "On ground, if the oil quantity is low, the APU SD page displays the pulsing OIL LVL LO
 * indication."
 * The common APU ECB detects it (L:A32NX_APU_LOW_OIL_LEVEL, systems apu/electronic_control_box.rs has_low_oil_level,
 * flyPad failure 49005 "APU oil level low"): on the ground with the APU not running, as the A320 FCOM LOW OIL LEVEL. The
 * A380 FCOM text inhibits it only in flight, so a running APU on the ground does not show it here (the shared ECB rule
 * is kept). The in-flight inhibition is the ECB's ground condition.
 * Not done yet: the automatic call of the APU page by the FWS ("When this indication appears, the APU SD page
 * automatically appears.", l.108693).
 * @param ecbDataValid the APU_LOW_OIL_LEVEL word is in normal operation (the ECB is on)
 * @param lowOilLevel the word value
 * @returns whether OIL LVL LO is shown
 */
export function apuOilLevelLowIndicationShown(ecbDataValid: boolean, lowOilLevel: boolean): boolean {
  return ecbDataValid && lowOilLevel;
}
