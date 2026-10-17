// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The battery indications of the ELEC DC SD page:
 * - BAT 1(2)(ESS): the current is abnormal below -5 A; the voltage is abnormal at or below 25 V with a current above
 *   0 A, or below 20 V.
 * - APU BAT: the voltage is abnormal at or below 25 V outside the APU start sequence; the current is abnormal below
 *   -5 A, except while the battery discharges to start the APU. The discharge arrow is amber, but green with a green
 *   current while discharging to start the APU.
 */

const BAT_CURRENT_ABNORMAL_BELOW_A = -5;
/** At or below this voltage the battery is abnormal (for BAT 1(2)(ESS) only while charging) */
const BAT_VOLTAGE_ABNORMAL_AT_OR_BELOW_V = 25;
/** The BAT 1(2)(ESS) voltage is abnormal below 20 V */
const BAT_VOLTAGE_ABNORMAL_BELOW_V = 20;

/**
 * The APU start sequence: from the APU START pb ON until the APU is available (AVAIL). Design choice: the source does
 * not define the starting sequence for this rule.
 * @param apuStartPbOn L:A32NX_OVHD_APU_START_PB_IS_ON
 * @param apuAvailable L:A32NX_OVHD_APU_START_PB_IS_AVAILABLE
 */
export function apuInStartSequence(apuStartPbOn: boolean, apuAvailable: boolean): boolean {
  return apuStartPbOn && !apuAvailable;
}

/**
 * @param isApuBattery the APU BAT (else BAT 1, BAT 2 or ESS BAT)
 * @param potentialV the battery voltage
 * @param currentA the battery current, negative when discharging
 * @param apuStarting the APU is in its start sequence (apuInStartSequence)
 * @returns whether the voltage is green
 */
export function batteryVoltageNormal(
  isApuBattery: boolean,
  potentialV: number,
  currentA: number,
  apuStarting: boolean,
): boolean {
  if (isApuBattery) {
    return potentialV > BAT_VOLTAGE_ABNORMAL_AT_OR_BELOW_V || apuStarting;
  }
  return (
    potentialV >= BAT_VOLTAGE_ABNORMAL_BELOW_V && (potentialV > BAT_VOLTAGE_ABNORMAL_AT_OR_BELOW_V || currentA <= 0)
  );
}

/**
 * @returns whether the current is green (the APU start draws a large current from the APU BAT: not abnormal)
 */
export function batteryCurrentNormal(isApuBattery: boolean, currentA: number, apuStarting: boolean): boolean {
  return currentA >= BAT_CURRENT_ABNORMAL_BELOW_A || (isApuBattery && apuStarting);
}

/**
 * The colour of the battery to busbar wire and of its charge / discharge arrow: green while charging, amber while
 * discharging. BAT 1(2)(ESS) are amber also without current; the APU BAT discharge arrow is green during the APU start.
 */
export function batteryWireColour(isApuBattery: boolean, currentA: number, apuStarting: boolean): 'Green' | 'Amber' {
  if (isApuBattery) {
    return currentA < 0 && !apuStarting ? 'Amber' : 'Green';
  }
  return currentA > 0 ? 'Green' : 'Amber';
}
