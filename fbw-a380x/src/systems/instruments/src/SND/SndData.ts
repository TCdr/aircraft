// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Arinc429Word } from '@flybywiresim/fbw-sdk';

/** The navigation data of the SND (A380 FCOM DSC-34-10-20-30) */
export interface SndNavigation {
  /** The ADIRU the heading comes from: 3, or 1 when ADIRU 3 has no heading; null when neither has one */
  headingAdiru: 1 | 3 | null;
  /** The ADIRU the position, track and ground speed come from: 3, or 1 when ADIRU 3 has no position */
  positionAdiru: 1 | 3;
  /** True reference (MAG / TRUE pb, or the ADIRU at an extreme latitude) */
  trueReference: boolean;
  /** Degrees, null when not available */
  heading: number | null;
  track: number | null;
  /** Knots */
  groundSpeed: number | null;
  /** Degrees, null when the aircraft coordinates are invalid */
  latitude: number | null;
  longitude: number | null;
}

const word = (adiru: 1 | 3, name: string) => Arinc429Word.fromSimVarValue(`L:A32NX_ADIRS_IR_${adiru}_${name}`);

const value = (w: Arinc429Word): number | null => (w.isNormalOperation() ? w.value : null);

/**
 * Reads the navigation data of the SND. ADIRU 3 and ADIRU 1 give the heading, track, ground speed and position (FCOM
 * DSC-34-10-20-10): ADIRU 3, or ADIRU 1 when ADIRU 3 is not available.
 */
export function readSndNavigation(): SndNavigation {
  const headingAdiru: 1 | 3 | null = word(3, 'HEADING').isNormalOperation()
    ? 3
    : word(1, 'HEADING').isNormalOperation()
      ? 1
      : null;
  const positionAdiru: 1 | 3 =
    !word(3, 'LATITUDE').isNormalOperation() && word(1, 'LATITUDE').isNormalOperation() ? 1 : 3;
  const source = positionAdiru;
  const maintenance = word(headingAdiru ?? positionAdiru, 'MAINT_WORD');
  // As the DMC: the TRUE pb or an extreme latitude (bit 15), not in ATT mode (bit 2)
  const trueReference =
    (SimVar.GetSimVarValue('L:A32NX_PUSH_TRUE_REF', 'bool') || maintenance.bitValueOr(15, false)) &&
    !maintenance.bitValueOr(2, false);
  const latitude = value(word(source, 'LATITUDE'));
  const longitude = value(word(source, 'LONGITUDE'));
  return {
    headingAdiru,
    positionAdiru,
    trueReference,
    heading: headingAdiru === null ? null : value(word(headingAdiru, trueReference ? 'TRUE_HEADING' : 'HEADING')),
    track: value(word(source, trueReference ? 'TRUE_TRACK' : 'TRACK')),
    groundSpeed: value(word(source, 'GROUND_SPEED')),
    latitude: latitude !== null && longitude !== null ? latitude : null,
    longitude: latitude !== null && longitude !== null ? longitude : null,
  };
}

/** e.g. N 48 15.5 (degrees and decimal minutes, as the SND) */
export function formatLatitude(latitude: number): string {
  return formatCoordinate(latitude, latitude >= 0 ? 'N' : 'S', 2);
}

/** e.g. E 003 32.3 */
export function formatLongitude(longitude: number): string {
  return formatCoordinate(longitude, longitude >= 0 ? 'E' : 'W', 3);
}

function formatCoordinate(coordinate: number, hemisphere: string, degreeDigits: number): string {
  const tenthsOfMinutes = Math.round(Math.abs(coordinate) * 600);
  const degrees = Math.floor(tenthsOfMinutes / 600);
  const minutes = (tenthsOfMinutes - degrees * 600) / 10;
  return `${hemisphere} ${degrees.toString().padStart(degreeDigits, '0')} ${minutes.toFixed(1).padStart(4, '0')}`;
}
