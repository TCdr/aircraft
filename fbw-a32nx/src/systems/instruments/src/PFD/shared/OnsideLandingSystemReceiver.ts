// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { SimVarDefinition, SimVarValueType } from '@microsoft/msfs-sdk';
import type { PFDSimvars } from './PFDSimvarPublisher';

/** The PFD simvars that come from the landing system (ILS) receiver */
export type LandingSystemReceiverKey =
  | 'hasLoc'
  | 'hasDme'
  | 'navIdent'
  | 'navFreq'
  | 'dme'
  | 'navRadialError'
  | 'hasGlideslope'
  | 'glideSlopeError';

/** The publisher whose simvar sources can be changed (UpdatableSimVarPublisher) */
export interface LandingSystemReceiverSourceTarget {
  updateSimVarSource(key: keyof PFDSimvars & string, value: SimVarDefinition): void;
}

/**
 * The ILS data of MMR 2, for PFD 2. The aircraft has two ILS receivers (ILS1 in MMR1, ILS2 in MMR2): PFD1 and ND2
 * display ILS1, PFD2 and ND1 display ILS2.
 * In the sim MMR 2 is NAV 4 (systems.cfg [RADIOS]); the deviations and valid flags are written by the MMR 2 shim of
 * the systems (fbw-common navigation/ils.rs) with the same contract as the A32NX_RADIO_RECEIVER_* variables of MMR 1.
 */
const MMR_2_SIMVARS: readonly [LandingSystemReceiverKey, SimVarDefinition][] = [
  ['hasLoc', { name: 'L:A32NX_MMR_2_LOC_IS_VALID', type: SimVarValueType.Bool }],
  ['hasDme', { name: 'NAV HAS DME:4', type: SimVarValueType.Bool }],
  ['navIdent', { name: 'NAV IDENT:4', type: SimVarValueType.String }],
  ['navFreq', { name: 'NAV ACTIVE FREQUENCY:4', type: SimVarValueType.MHz }],
  ['dme', { name: 'NAV DME:4', type: SimVarValueType.NM }],
  ['navRadialError', { name: 'L:A32NX_MMR_2_LOC_DEVIATION', type: SimVarValueType.Degree }],
  ['hasGlideslope', { name: 'L:A32NX_MMR_2_GS_IS_VALID', type: SimVarValueType.Bool }],
  ['glideSlopeError', { name: 'L:A32NX_MMR_2_GS_DEVIATION', type: SimVarValueType.Degree }],
];

/**
 * The landing system simvars a PFD reads instead of the publisher's defaults. The defaults are MMR 1 (NAV 3 and the
 * A32NX_RADIO_RECEIVER_* variables of the FBW module, with its calculated ILS signals option), right for PFD 1.
 * @param displayIndex 1 for the CAPT PFD, 2 for the F/O PFD (0 when unknown: MMR 1)
 * @returns the simvars to use for PFD 2, none for PFD 1
 */
export function onsideLandingSystemReceiverSimVars(
  displayIndex: number,
): readonly [LandingSystemReceiverKey, SimVarDefinition][] {
  return displayIndex === 2 ? MMR_2_SIMVARS : [];
}

/**
 * Makes the PFD read the ILS receiver of its own side (MMR 1 for PFD 1, MMR 2 for PFD 2).
 * @param publisher the PFD simvar publisher
 * @param displayIndex 1 for the CAPT PFD, 2 for the F/O PFD
 */
export function selectOnsideLandingSystemReceiver(
  publisher: LandingSystemReceiverSourceTarget,
  displayIndex: number,
): void {
  for (const [key, definition] of onsideLandingSystemReceiverSimVars(displayIndex)) {
    publisher.updateSimVarSource(key, definition);
  }
}
