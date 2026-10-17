// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * Pulsing OIL LVL LO indication of the APU SD page: low APU oil quantity on the ground, inhibited in flight (the APU
 * can still run normally for at least 14 h).
 * The common APU ECB detects it (L:A32NX_APU_LOW_OIL_LEVEL, apu/electronic_control_box.rs has_low_oil_level, flyPad
 * failure 49005) only on the ground with the APU not running, as on the A320. The A380 inhibits it only in flight, so a
 * running APU on the ground does not show it here (the shared ECB rule is kept).
 * Not done yet: the FWS should call the APU SD page automatically when the indication appears.
 * @param ecbDataValid the APU_LOW_OIL_LEVEL word is in normal operation (the ECB is on)
 * @param lowOilLevel the word value
 * @returns whether OIL LVL LO is shown
 */
export function apuOilLevelLowIndicationShown(ecbDataValid: boolean, lowOilLevel: boolean): boolean {
  return ecbDataValid && lowOilLevel;
}
