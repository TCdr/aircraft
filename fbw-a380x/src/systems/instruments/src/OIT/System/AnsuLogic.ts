// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The two sides of the A380 network server system (NSS): NSS AVNCS and FLT OPS (A380 FCOM DSC-46-20-10-20). */
export type AnsuType = 'nss-avncs' | 'flt-ops';

export type AnsuIndex = 1 | 2;

/** The busbars that can supply an aircraft network server unit (ANSU). */
export interface AnsuSupplies {
  ac1: boolean;
  ac2: boolean;
  /** The A380 AC ESS busbar (400XP), the AC_ESS_SHED variable. */
  acEss: boolean;
  /** The A380 AC EMER busbar (491XP), the AC_ESS variable. */
  acEmer: boolean;
  /** The hot busbar of battery 1 (BAT 1). */
  dcHot1: boolean;
  /** The hot busbar of battery 2 (BAT 2). */
  dcHot2: boolean;
}

/**
 * Whether an ANSU is powered. A380 FCOM DSC-46-20-70 (a380_fcom.txt:107796-107806):
 * - NSS AVNCS ANSU 1: AC 2 and BAT 2,
 * - NSS AVNCS ANSU 2: AC 1 or AC EMER and BAT 1,
 * - FLT OPS ANSU: AC ESS and BAT 1.
 * The battery is the backup supply of each unit (as modelled before this change): any of its supplies powers it.
 * @param type the NSS side of the unit
 * @param index the unit index (the FLT OPS side has one ANSU)
 * @param supplies the state of the busbars
 * @returns whether the unit is powered
 */
export function isAnsuPowered(type: AnsuType, index: AnsuIndex, supplies: AnsuSupplies): boolean {
  if (type === 'flt-ops') {
    return supplies.acEss || supplies.dcHot1;
  }
  return index === 1 ? supplies.ac2 || supplies.dcHot2 : supplies.ac1 || supplies.acEmer || supplies.dcHot1;
}

/**
 * Whether the NSS AVNCS applications (AOC, eLogbook, maintenance) are available.
 * A380 FCOM DSC-46-20-30 (a380_fcom.txt:107931-107932): the AOC function is hosted by both ANSU 1 and ANSU 2; in the
 * case of an ANSU 1 failure, ANSU 2 provides it. Both ANSUs failed: the NSS AVNCS applications are lost.
 * @param ansu1Healthy whether NSS AVNCS ANSU 1 is healthy (powered, not failed, not reset, NSS master on)
 * @param ansu2Healthy whether NSS AVNCS ANSU 2 is healthy
 * @returns whether at least one NSS AVNCS ANSU hosts the applications
 */
export function isNssAvncsAvailable(ansu1Healthy: boolean, ansu2Healthy: boolean): boolean {
  return ansu1Healthy || ansu2Healthy;
}
