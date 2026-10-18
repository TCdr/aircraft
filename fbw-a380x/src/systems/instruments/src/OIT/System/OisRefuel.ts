// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { UnitType } from '@microsoft/msfs-sdk';
import { maxZfw, maxZfwCg, minZfw, minZfwCg } from '@shared/PerformanceConstants';

/*
 * The REFUEL application of the OIS (NSS AVNCS): it sets the preselected fuel quantity (PFQ), the targeted fuel on
 * board of an automatic refuel. The FQMS refuels to it (L:A32NX_FUEL_DESIRED, the same value as the PRESELECT of the
 * refuel panel and the flyPad fuel page); the refuel itself starts from the refuel panel, the cockpit or the flyPad.
 *
 * It also sends the FQMS a ZFW and ZFCG of its own for the CG targeting of the refuel (refuel ZF data,
 * L:A32NX_FUEL_REFUEL_ZFW in kg and L:A32NX_FUEL_REFUEL_ZFCG in % MAC). The FQMS takes the pair only when both are above
 * 0, so writing 0 to both gives the FQMS its default data back. Without an entry the FQMS uses the payload targets of the
 * airframe model.
 */

export type RefuelWeightUnit = 'KG' | 'LB';

/** The FQMS stops the automatic refuel once the fuel on board is this close to the PFQ, kg */
const PFQ_REACHED_TOLERANCE_KG = 400;

export enum RefuelState {
  /** No refuel in progress, the PFQ not reached */
  Standby = 'STANDBY',
  Refuelling = 'REFUEL IN PROGRESS',
  Defuelling = 'DEFUEL IN PROGRESS',
  PfqReached = 'PFQ REACHED',
}

/**
 * @param kg a weight, kg
 * @param unit the weight unit of the aircraft
 * @returns the weight in that unit
 */
function toUnit(kg: number, unit: RefuelWeightUnit): number {
  return unit === 'KG' ? kg : UnitType.POUND.convertFrom(kg, UnitType.KILOGRAM);
}

/**
 * The PFQ entry: a whole number in the weight unit of the aircraft, as the PRESELECT indicator of the refuel panel
 * @param entry the entry
 * @param unit the weight unit of the aircraft
 * @param capacityKg the fuel capacity of the tanks, kg
 * @returns the PFQ, kg, or null when the entry is not a weight within the tank capacity
 */
export function parsePreselectedFuel(entry: string | null, unit: RefuelWeightUnit, capacityKg: number): number | null {
  const text = entry?.trim() ?? '';
  if (!/^\d+$/.test(text)) {
    return null;
  }
  const value = Number(text);
  const kg = unit === 'KG' ? value : UnitType.POUND.convertTo(value, UnitType.KILOGRAM);
  // the capacity shown in the unit of the aircraft is rounded: an entry of that number is within the capacity
  return value <= Math.round(toUnit(capacityKg, unit)) ? Math.min(kg, capacityKg) : null;
}

/**
 * @param kg a weight, kg, null when unknown
 * @param unit the weight unit of the aircraft
 * @returns the weight shown on the page, whole kg or lb
 */
export function formatRefuelWeight(kg: number | null, unit: RefuelWeightUnit): string {
  if (kg === null || !Number.isFinite(kg)) {
    return `------ ${unit}`;
  }
  return `${Math.round(toUnit(Math.max(kg, 0), unit))} ${unit}`;
}

/**
 * @param zfcgPercentMac the ZFCG, % MAC, null when unknown
 * @returns the ZFCG shown on the page
 */
export function formatZfcg(zfcgPercentMac: number | null): string {
  if (zfcgPercentMac === null || !Number.isFinite(zfcgPercentMac) || zfcgPercentMac <= 0) {
    return '--.- %';
  }
  return `${zfcgPercentMac.toFixed(1)} %`;
}

/**
 * @param refuelStarted whether a refuel or defuel runs
 * @param fuelOnBoardKg the fuel on board, kg, null when unknown
 * @param preselectedFuelKg the PFQ, kg, null when unknown
 * @returns the state shown on the page
 */
export function refuelState(
  refuelStarted: boolean,
  fuelOnBoardKg: number | null,
  preselectedFuelKg: number | null,
): RefuelState {
  if (fuelOnBoardKg === null || preselectedFuelKg === null) {
    return RefuelState.Standby;
  }
  if (Math.abs(preselectedFuelKg - fuelOnBoardKg) <= PFQ_REACHED_TOLERANCE_KG) {
    return RefuelState.PfqReached;
  }
  if (refuelStarted) {
    return preselectedFuelKg > fuelOnBoardKg ? RefuelState.Refuelling : RefuelState.Defuelling;
  }
  return RefuelState.Standby;
}

/** A ZFW and ZFCG of the REFUEL application for the CG targeting of the FQMS */
export interface RefuelZfData {
  readonly zfwKg: number;
  readonly zfcgPercentMac: number;
}

/** What the page writes to give the FQMS its default data back: zeros are no entry */
export const REFUEL_ZF_DATA_CLEARED: RefuelZfData = { zfwKg: 0, zfcgPercentMac: 0 };

/**
 * The ZF data entry, with the A380 ZFW and ZFCG limits of the FMS FUEL & LOAD page.
 * @param zfwEntry the ZFW, a whole number in the weight unit of the aircraft
 * @param zfcgEntry the ZFCG, % MAC with one decimal at most
 * @param unit the weight unit of the aircraft
 * @returns the ZF data, or null and what to correct
 */
export function parseRefuelZfData(
  zfwEntry: string | null,
  zfcgEntry: string | null,
  unit: RefuelWeightUnit,
): { readonly data: RefuelZfData | null; readonly error: string | null } {
  const zfwText = zfwEntry?.trim() ?? '';
  const zfcgText = zfcgEntry?.trim() ?? '';
  if (zfwText === '' || zfcgText === '') {
    return { data: null, error: 'ENTER ZFW AND ZFCG' };
  }
  // The limits shown in the unit of the aircraft are rounded: an entry of those numbers is within the limits
  const minShown = Math.round(toUnit(minZfw, unit));
  const maxShown = Math.round(toUnit(maxZfw, unit));
  const zfw = Number(zfwText);
  if (!/^\d+$/.test(zfwText) || zfw < minShown || zfw > maxShown) {
    return { data: null, error: `ZFW OUT OF RANGE (${minShown} - ${maxShown} ${unit})` };
  }
  const zfcg = Number(zfcgText);
  if (!/^\d{1,2}(\.\d)?$/.test(zfcgText) || zfcg < minZfwCg || zfcg > maxZfwCg) {
    return { data: null, error: `ZFCG OUT OF RANGE (${minZfwCg.toFixed(1)} - ${maxZfwCg.toFixed(1)} %)` };
  }
  const zfwKg = unit === 'KG' ? zfw : UnitType.POUND.convertTo(zfw, UnitType.KILOGRAM);
  return { data: { zfwKg: Math.min(Math.max(zfwKg, minZfw), maxZfw), zfcgPercentMac: zfcg }, error: null };
}

/**
 * @param zfwKg the ZFW of the REFUEL application, kg, 0 when none
 * @param zfcgPercentMac its ZFCG, % MAC, 0 when none
 * @returns the entry the FQMS takes, null when one of the values is missing
 */
export function enteredRefuelZfData(zfwKg: number, zfcgPercentMac: number): RefuelZfData | null {
  return zfwKg > 0 && zfcgPercentMac > 0 ? { zfwKg, zfcgPercentMac } : null;
}
