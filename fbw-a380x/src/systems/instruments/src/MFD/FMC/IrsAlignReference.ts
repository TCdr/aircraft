// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Coordinates } from 'msfs-geo';
import { FmgcFlightPhase } from '@shared/flightphase';

/**
 * The Align On Other Reference function of the POSITION / IRS page (A380 FCOM DSC-22-FMS-20-30 P 279-281,
 * a380_fcom.txt l.39395-39452; DSC-22-FMS-10-30-10 l.22645-22655 "The flight crew can change this reference point
 * manually, by entering the coordinates in the Align On Other Reference window on the POSITION / IRS page").
 *
 * Simplified: the FMS keeps the reference position and shows the alignment on it; the ADIRS of the sim always align on
 * the aircraft position (there is no IRS position error to take from a wrong reference, and no fast realignment).
 */

/**
 * "The flight crew can only define an other reference position in the PREFLIGHT, or DONE flight phase." (l.39418-39419)
 * @param phase the FMS flight phase
 * @returns true when the ALIGN ON OTHER REF button is available
 */
export function isAlignOnOtherReferenceAvailable(phase: FmgcFlightPhase): boolean {
  return phase === FmgcFlightPhase.Preflight || phase === FmgcFlightPhase.Done;
}

/**
 * IRS ALIGNMENT LABEL (l.39397-39413): aligning or aligned, on the GPS position or on the other reference position.
 * @param aligned all the IRS are aligned
 * @param onReferencePosition the IRS align on the reference position of the Align On Other Reference panel
 * @returns the label
 */
export function irsAlignmentLabel(aligned: boolean, onReferencePosition: boolean): string {
  const state = aligned ? 'ALIGNED' : 'ALIGNING';
  return `IRS ${state} ON ${onReferencePosition ? 'REF' : 'GPS'} POS:`;
}

/** The reference position fields of the panel, null while nothing is entered */
export interface AlignReferenceEntry {
  lat: number | null;
  long: number | null;
}

/** The precision of the panel fields: a tenth of an arc minute */
const TENTH_OF_MINUTE_DEGREES = 1 / 600;

/**
 * ORIGIN AIRPORT IDENT (l.39438-39443): "This label is only displayed when the values in the entry fields are the
 * latitude and longitude of the origin airport reference point."
 * @param entry the values of the entry fields
 * @param origin the origin airport of the active flight plan
 * @returns the origin ident, or null when the label is not displayed
 */
export function alignReferenceOriginIdent(
  entry: AlignReferenceEntry,
  origin: { ident: string; location: Coordinates } | undefined,
): string | null {
  if (!origin || entry.lat === null || entry.long === null) {
    return null;
  }
  const same = (a: number, b: number) => Math.abs(a - b) < TENTH_OF_MINUTE_DEGREES / 2;
  return same(entry.lat, origin.location.lat) && same(entry.long, origin.location.long) ? origin.ident : null;
}

/**
 * REFERENCE POSITION ENTRY FIELDS (l.39444-39446): "The default position is the origin airport of the active flight
 * plan, if any."
 * @param origin the location of the origin airport of the active flight plan
 * @returns the default values of the entry fields
 */
export function defaultAlignReference(origin: Coordinates | undefined): AlignReferenceEntry {
  return origin ? { lat: origin.lat, long: origin.long } : { lat: null, long: null };
}

/**
 * ALIGN IRS BUTTON (l.39451-39452): "sends the new reference position to the ADIRS, for IRS alignment".
 * @param entry the values of the entry fields
 * @returns the reference position to send, or null when a field is empty (nothing is sent)
 */
export function alignReferenceToSend(entry: AlignReferenceEntry): Coordinates | null {
  return entry.lat !== null && entry.long !== null ? { lat: entry.lat, long: entry.long } : null;
}

/**
 * The reference position is kept until the next alignment: with all three IRS mode selectors OFF the IRS lose their
 * alignment, and the next one is on the GPS position again (l.22645-22650: the IRS take the GPS position as the
 * alignment reference point unless the crew changes it).
 * @param irModeSelectorKnobs L:A32NX_OVHD_ADIRS_IR_n_MODE_SELECTOR_KNOB of the three IRS (0 = OFF)
 * @returns true when the reference position no longer applies
 */
export function isAlignReferenceLost(irModeSelectorKnobs: readonly number[]): boolean {
  return irModeSelectorKnobs.every((knob) => knob === 0);
}
