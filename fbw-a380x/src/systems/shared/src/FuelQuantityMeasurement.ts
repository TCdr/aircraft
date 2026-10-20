// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The state of the A380 fuel quantity measurement, written by the Rust fuel system (a380_systems fuel) and read by the
 * FQMS simulation (CpiomF), the FWS and the FUEL SD page:
 * - L:A32NX_FUEL_QUANTITY_SYSTEM_FAULTS: bit 0-1 FQMS 1-2, bit 2-3 FQDC 1-2, bit 4-5 the Alternate Gauging
 *   Processor (AGP) of FQDC 1-2 (a failed FQDC also loses its AGP).
 * - L:A32NX_FUEL_FQI_LOST_TANKS, L:A32NX_FUEL_GAUGING_DEGRADED_TANKS: one bit per tank, in the order of
 *   FUEL_QUANTITY_TANK_ORDER.
 */

import { A380FuelTankName } from './FuelTankIndications';

export const FUEL_QUANTITY_SYSTEM_FAULTS_VAR = 'L:A32NX_FUEL_QUANTITY_SYSTEM_FAULTS';
export const FUEL_FQI_LOST_TANKS_VAR = 'L:A32NX_FUEL_FQI_LOST_TANKS';
export const FUEL_GAUGING_DEGRADED_TANKS_VAR = 'L:A32NX_FUEL_GAUGING_DEGRADED_TANKS';

/** The tanks in the bit order of the tank words (the A380FuelTankType order of the Rust fuel system) */
export const FUEL_QUANTITY_TANK_ORDER: readonly A380FuelTankName[] = [
  'LEFT_OUTER',
  'FEED_1',
  'LEFT_MID',
  'LEFT_INNER',
  'FEED_2',
  'FEED_3',
  'RIGHT_INNER',
  'RIGHT_MID',
  'FEED_4',
  'RIGHT_OUTER',
  'TRIM',
];

export const FEED_TANK_NAMES: readonly A380FuelTankName[] = ['FEED_1', 'FEED_2', 'FEED_3', 'FEED_4'];

/** The faults of FQMS 1-2, FQDC 1-2 and their AGPs */
export interface FuelQuantitySystemFaults {
  fqms: [boolean, boolean];
  fqdc: [boolean, boolean];
  alternateGauging: [boolean, boolean];
}

function bit(word: number, index: number): boolean {
  return (Math.round(word) & (1 << index)) !== 0;
}

/** Decodes L:A32NX_FUEL_QUANTITY_SYSTEM_FAULTS */
export function fuelQuantitySystemFaults(word: number): FuelQuantitySystemFaults {
  return {
    fqms: [bit(word, 0), bit(word, 1)],
    fqdc: [bit(word, 2), bit(word, 3)],
    alternateGauging: [bit(word, 4), bit(word, 5)],
  };
}

/** Whether the bit of a tank is set in a tank word */
export function isTankBitSet(word: number, tank: A380FuelTankName): boolean {
  return bit(word, FUEL_QUANTITY_TANK_ORDER.indexOf(tank));
}

/**
 * The FQMS can no longer measure or monitor the fuel quantities: both FQMS failed, both FQDCs failed (no tank sensor
 * data), or both AGPs failed (no alternate gauging to check the FQMS quantities against). FUEL FQMS 1+2 FAULT.
 */
export function isFqmsMonitoringLost(faults: FuelQuantitySystemFaults): boolean {
  return (
    (faults.fqms[0] && faults.fqms[1]) ||
    (faults.fqdc[0] && faults.fqdc[1]) ||
    (faults.alternateGauging[0] && faults.alternateGauging[1])
  );
}

/**
 * The digits of a degraded fuel quantity that the FUEL SD page still shows: all but the last two, which are replaced by
 * amber dashes (a quantity from the alternate gauging, or from a tank with a degraded gauging accuracy).
 * @param displayedValue the quantity in the display unit, already rounded as displayed
 */
export function degradedQuantityLeadingDigits(displayedValue: number): string {
  return Math.max(0, Math.round(displayedValue)).toString().slice(0, -2);
}
