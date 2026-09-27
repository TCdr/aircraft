// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FmsErrorType } from '@fmgc/FmsError';
import { A380FmsError } from '../../shared/A380FmsError';
import { DataEntryFormat } from '../common/DataEntryFormats';
import { RequestFieldKind } from '../../ATCCOM/RequestFrames';

/**
 * Data entry formats of the ATC COM pages (A380 FCOM DSC-46-10-20-50). A wrong entry shows FORMAT ERROR or ENTRY OUT
 * OF RANGE, with the format or the range on the second line of the ATC COM message area (DSC-46-10-20-40 F, H).
 */
type FieldFormatTuple = [value: string | null, unitLeading: string | null, unitTrailing: string | null];

function formatError(format: string): A380FmsError {
  return new A380FmsError(FmsErrorType.FormatError, `FORMAT: ${format}`);
}

function outOfRangeError(range: string): A380FmsError {
  return new A380FmsError(FmsErrorType.EntryOutOfRange, `RNG: ${range}`);
}

/** ATC CENTER (DSC-46-10-20-50 H): XXXX, 4 letters at most */
export class AtcCenterFormat implements DataEntryFormat<string> {
  public readonly placeholder = '----';

  public readonly maxDigits = 4;

  public format(value: string | null): FieldFormatTuple {
    return [value || this.placeholder, null, null];
  }

  public async parse(input: string): Promise<string | null> {
    if (input === '' || input === this.placeholder) {
      return null;
    }
    if (!/^[A-Z]{1,4}$/.test(input)) {
      throw formatError('AAAA');
    }
    return input;
  }
}

/** MAX UPLINK DELAY (DSC-46-10-20-50 AN): NNN or NNN S, 1 to 999 s */
export class MaxUplinkDelayFormat implements DataEntryFormat<number> {
  public readonly placeholder = '---';

  public readonly maxDigits = 4;

  public format(value: number | null): FieldFormatTuple {
    return value === null ? [this.placeholder, null, null] : [`${value}S`, null, null];
  }

  public async parse(input: string): Promise<number | null> {
    if (input === '' || input === this.placeholder) {
      return null;
    }
    const match = input.match(/^(\d{1,3})S?$/);
    if (!match) {
      throw formatError('SSS');
    }
    const delay = parseInt(match[1]);
    if (delay < 1 || delay > 999) {
      throw outOfRangeError('1 TO 999 S');
    }
    return delay;
  }
}

/** The latitude / longitude entries: DDMM.MB/EEEMM.MC or BDDMM.M/CEEEMM.M, leading zeros may be omitted */
function parseLatLong(input: string): string | null {
  const suffixed = input.match(/^(\d{1,2})(\d{2}(?:\.\d)?)([NS])\/(\d{1,3})(\d{2}(?:\.\d)?)([EW])$/);
  const prefixed = input.match(/^([NS])(\d{1,2})(\d{2}(?:\.\d)?)\/([EW])(\d{1,3})(\d{2}(?:\.\d)?)$/);
  const parts = suffixed
    ? [suffixed[1], suffixed[2], suffixed[3], suffixed[4], suffixed[5], suffixed[6]]
    : prefixed
      ? [prefixed[2], prefixed[3], prefixed[1], prefixed[5], prefixed[6], prefixed[4]]
      : null;
  if (!parts) {
    return null;
  }
  const [latDeg, latMin, ns, longDeg, longMin, ew] = parts;
  const latitude = parseInt(latDeg) + parseFloat(latMin) / 60;
  const longitude = parseInt(longDeg) + parseFloat(longMin) / 60;
  if (latitude > 90 || longitude > 180 || parseFloat(latMin) >= 60 || parseFloat(longMin) >= 60) {
    throw new A380FmsError(FmsErrorType.EntryOutOfRange);
  }
  const minutes = (value: string) => parseFloat(value).toFixed(1).padStart(4, '0');
  return `${latDeg.padStart(2, '0')}${minutes(latMin)}${ns}/${longDeg.padStart(3, '0')}${minutes(longMin)}${ew}`;
}

/** ALTITUDE, CLB TO, DES TO, BLOCK, LEVEL... (DSC-46-10-20-50): FL NNN or NNN, NNNNN FT or NNNNN, NNNNN M */
export function parseAtcAltitude(input: string): string {
  const flightLevel = input.match(/^(?:FL)?(\d{1,3})$/);
  if (flightLevel) {
    const level = parseInt(flightLevel[1]);
    if (level < 30 || level > 450) {
      throw outOfRangeError('FL30 TO FL450');
    }
    return `FL${level.toString().padStart(3, '0')}`;
  }
  const feet = input.match(/^(\d{1,5})FT$/) ?? input.match(/^(\d{4,5})$/);
  if (feet) {
    const altitude = parseInt(feet[1]);
    if (altitude > 25000) {
      throw outOfRangeError('0 TO 25000 FT');
    }
    return `${altitude}FT`;
  }
  const meters = input.match(/^(\d{1,5})M$/);
  if (meters) {
    const altitude = parseInt(meters[1]);
    if (altitude > 13700) {
      throw outOfRangeError('0 TO 13700 M');
    }
    return `${altitude}M`;
  }
  throw formatError('FOR ALT XXXXX FOR FL XXX');
}

/** DIR TO, ENTRY POINT: XXXXX, or a latitude / longitude */
export function parseAtcFix(input: string): string {
  if (/^[A-Z0-9]{1,5}$/.test(input)) {
    return input;
  }
  const latLong = parseLatLong(input);
  if (latLong) {
    return latLong;
  }
  throw formatError('WPT OR LAT/LONG');
}

/** ETA: HHMM, HHMM Z, HH H MM M, HH H MM MN, HH H MM MIN; the time as HHMMZ, null when not a time */
export function parseAtcTime(input: string): string | null {
  const match = input.match(/^(\d{2})(\d{2})Z?$/) ?? input.match(/^(\d{1,2})H(\d{1,2})(?:M|MN|MIN)$/);
  if (!match) {
    return null;
  }
  const hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  if (hours > 23) {
    throw outOfRangeError('0 TO 23 H');
  }
  if (minutes > 59) {
    throw outOfRangeError('0 TO 59 MN');
  }
  return `${hours.toString().padStart(2, '0')}${minutes.toString().padStart(2, '0')}Z`;
}

/** AT: a position (XXXXX or a latitude / longitude) or a time */
export function parseAtcPositionOrTime(input: string): string {
  const time = parseAtcTime(input);
  if (time) {
    return time;
  }
  if (/^[A-Z][A-Z0-9]{0,4}$/.test(input)) {
    return input;
  }
  const latLong = parseLatLong(input);
  if (latLong) {
    return latLong;
  }
  throw formatError('POS XXXXX OR UTC HHMMZ');
}

/**
 * OFFSET, WX DEV: NNND, DNNN, NNN NM D, DNNN NM, NNN KM D or DNNN KM; D = L, R (WX DEV: or LR) or nothing; 1 to 128 NM,
 * 1 to 256 KM. The value is the distance and the direction, e.g. "20NM L".
 */
export function parseAtcOffset(input: string, weatherDeviation: boolean): string {
  const directions = weatherDeviation ? 'LR|L|R' : 'L|R';
  const trailing = input.match(new RegExp(`^(\\d{1,3})(NM|KM)?(${directions})?$`));
  const leading = input.match(new RegExp(`^(${directions})(\\d{1,3})(NM|KM)?$`));
  const parts = trailing
    ? [trailing[1], trailing[2], trailing[3]]
    : leading
      ? [leading[2], leading[3], leading[1]]
      : null;
  if (!parts) {
    throw formatError(weatherDeviation ? 'XXXL/R/LR' : 'XXXL/R');
  }
  const [distanceText, unit = 'NM', direction = ''] = parts;
  const distance = parseInt(distanceText);
  const max = unit === 'KM' ? 256 : 128;
  if (distance < 1 || distance > max) {
    throw outOfRangeError(`1 TO ${max} ${unit}`);
  }
  return `${distance}${unit} ${direction}`.trim();
}

/** HDG, GROUND TRACK: NNN or NNN T, 1 to 360 (360 is displayed as 0) */
export function parseAtcDegree(input: string): string {
  const match = input.match(/^(\d{1,3})(T)?$/);
  if (!match) {
    throw formatError('XXX°');
  }
  const degrees = parseInt(match[1]);
  if (degrees < 1 || degrees > 360) {
    throw outOfRangeError('0 TO 360 °');
  }
  return `${(degrees % 360).toString().padStart(3, '0')}${match[2] ?? ''}`;
}

function parseMach(input: string): string | null {
  const match = input.match(/^M?\.(\d{1,2})$/);
  if (!match) {
    return null;
  }
  const mach = parseInt(match[1].padEnd(2, '0'));
  if (mach < 61 || mach > 92) {
    throw outOfRangeError('M.61 TO M.92');
  }
  return `M.${mach}`;
}

/** SPD, SPEED: NNN or NNN KT (70 to 350 KT), M .NN or .NN (M.61 to M.92) */
export function parseAtcSpeed(input: string): string {
  const mach = parseMach(input);
  if (mach) {
    return mach;
  }
  const knots = input.match(/^(\d{1,3})(?:KT)?$/);
  if (!knots) {
    throw formatError('FOR CAS XXX FOR MACH .XX');
  }
  const speed = parseInt(knots[1]);
  if (speed < 70 || speed > 350) {
    throw outOfRangeError('70 TO 350 KT');
  }
  return `${speed}KT`;
}

/** MACH: M .NN or .NN, M.61 to M.92 */
export function parseAtcMach(input: string): string {
  const mach = parseMach(input);
  if (!mach) {
    throw formatError('.XX');
  }
  return mach;
}

/** VOICE CONTACT: NNNNN (HF, 2850 to 28000 kHz), NNNNNNNNNNNN (SATCOM), NNN.NNN (VHF, 117 to 138 MHz) */
export function parseAtcFrequency(input: string): string {
  const vhf = input.match(/^(\d{3})\.(\d{1,3})$/);
  if (vhf) {
    const frequency = parseFloat(input);
    if (frequency < 117 || frequency > 138) {
      throw outOfRangeError('117.000 TO 138.000');
    }
    return `${vhf[1]}.${vhf[2].padEnd(3, '0')}`;
  }
  if (/^\d{12}$/.test(input)) {
    return input;
  }
  const hf = input.match(/^(\d{1,5})$/);
  if (hf) {
    const frequency = parseInt(hf[1]);
    if (frequency < 2850 || frequency > 28000) {
      throw outOfRangeError('2850 TO 28000');
    }
    return `${frequency}`;
  }
  throw formatError('XXXXXX');
}

/** FREETEXT: A..Z, 0..9, space, /, +, -, . (96 characters over the three lines of a frame) */
export function parseAtcFreetext(input: string): string {
  if (!/^[A-Z0-9 /+\-.]+$/.test(input)) {
    throw new A380FmsError(FmsErrorType.FormatError);
  }
  return input.replace(/\s+/g, ' ').trim();
}

/** GROUND SPEED: NNN or NNN KT, 70 to 700 KT */
export function parseAtcGroundSpeed(input: string): string {
  const match = input.match(/^(\d{1,3})(?:KT)?$/);
  if (!match) {
    throw formatError('XXXKT');
  }
  const speed = parseInt(match[1]);
  if (speed < 70 || speed > 700) {
    throw outOfRangeError('70 TO 700 KT');
  }
  return `${speed}KT`;
}

/**
 * VERTICAL SPEED: ±NNNN, ±NNNN FT, ±NNNN FT/MIN or ±NNNN FTM (0 to 6000); ±NNNN M, ±NNNN M/MIN or ±NNNN MM (0 to 2000);
 * "-" may be entered as M, "+" by default
 */
export function parseAtcVerticalSpeed(input: string): string {
  const match = input.match(/^([+\-M]?)(\d{1,4})(FT\/MIN|FTM|FT|M\/MIN|MM|M)?$/);
  if (!match) {
    throw formatError('+/-XXXXFT/MIN OR M/MIN');
  }
  const sign = match[1] === '-' || match[1] === 'M' ? '-' : '';
  const value = parseInt(match[2]);
  const meters = match[3] !== undefined && match[3].startsWith('M');
  if (value > (meters ? 2000 : 6000)) {
    throw outOfRangeError(meters ? '-2000 TO 2000 M/MIN' : '-6000 TO 6000 FT/MIN');
  }
  return `${value === 0 ? '' : sign}${value}${meters ? 'M/MIN' : 'FT/MIN'}`;
}

/** WIND: DDD/NNN KT, DDD°/NNN KT, DDD/NNN, DDD/NNN KM, DDD/NNN KM/H; 1 to 360 °, 0 to 255 KT or 0 to 511 KM/H */
export function parseAtcWind(input: string): string {
  const match = input.match(/^(\d{1,3})°?\/(\d{1,3})(KT|KM\/H|KM)?$/);
  if (!match) {
    throw formatError('XXX°/XXXKT');
  }
  const direction = parseInt(match[1]);
  const speed = parseInt(match[2]);
  const km = match[3] !== undefined && match[3].startsWith('KM');
  if (direction < 1 || direction > 360) {
    throw outOfRangeError('1 TO 360 °');
  }
  if (speed > (km ? 511 : 255)) {
    throw outOfRangeError(km ? '0 TO 511 KM' : '0 TO 255 KT');
  }
  return `${direction.toString().padStart(3, '0')}/${speed}${km ? 'KM/H' : 'KT'}`;
}

/** SAT: ±NN or ±NN C (-80 to +47 C), ±NNN F (-105 to +150 F); "-" may be entered as M, "+" by default */
export function parseAtcSat(input: string): string {
  const match = input.match(/^([+\-M]?)(\d{1,3})(C|F)?$/);
  if (!match) {
    throw formatError('+/-XXC/F');
  }
  const value = (match[1] === '-' || match[1] === 'M' ? -1 : 1) * parseInt(match[2]);
  const fahrenheit = match[3] === 'F';
  if (fahrenheit ? value < -105 || value > 150 : value < -80 || value > 47) {
    throw outOfRangeError(fahrenheit ? '-105 TO 150 F' : '-80 TO 47 C');
  }
  return `${value}${fahrenheit ? 'F' : 'C'}`;
}

/** ENDURANCE: HHMM, HH H MM M, HH H MM MN, HH H MM MIN; the value as e.g. 4H30 */
export function parseAtcEndurance(input: string): string {
  const match = input.match(/^(\d{2})(\d{2})$/) ?? input.match(/^(\d{1,2})H(\d{1,2})(?:M|MN|MIN)$/);
  if (!match) {
    throw formatError('HHMM');
  }
  const hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  if (hours > 23) {
    throw outOfRangeError('0 TO 23 H');
  }
  if (minutes > 59) {
    throw outOfRangeError('0 TO 59 MN');
  }
  return `${hours}H${minutes.toString().padStart(2, '0')}`;
}

/** SQUAWKING: NNNN, 0000 to 7777 */
export function parseAtcSquawk(input: string): string {
  if (!/^\d{4}$/.test(input)) {
    throw formatError('XXXX');
  }
  if (/[89]/.test(input)) {
    throw outOfRangeError('0000 TO 7777');
  }
  return input;
}

/** SOULS ON BOARD: NNNN, 1 to 1024 */
export function parseAtcSouls(input: string): string {
  if (!/^\d{1,4}$/.test(input)) {
    throw formatError('XXX');
  }
  const souls = parseInt(input);
  if (souls < 1 || souls > 1024) {
    throw outOfRangeError('1 TO 1024');
  }
  return `${souls}`;
}

/** DISTANCE: NNN.N NM or NNN.N, 1 to 999.9 NM */
export function parseAtcDistance(input: string): string {
  const match = input.match(/^(\d{1,3}(?:\.\d)?)(NM)?$/);
  if (!match) {
    throw formatError('XXXXNM/KM');
  }
  const distance = parseFloat(match[1]);
  if (distance < 1 || distance > 999.9) {
    throw outOfRangeError('1 TO 999.9 NM');
  }
  return `${distance}NM`;
}

function pattern(regex: RegExp, help: string): (input: string) => string {
  return (input) => {
    if (!regex.test(input)) {
      throw formatError(help);
    }
    return input;
  };
}

/** A text entry of the ATC COM pages: the value is the normalized entry */
export class AtccomTextFormat implements DataEntryFormat<string> {
  constructor(
    public readonly maxDigits: number,
    private readonly parser: (input: string) => string,
    private readonly keepSpaces = false,
    public readonly placeholder = '',
    private readonly splitUnit: (value: string) => [string, string] | null = () => null,
  ) {}

  public format(value: string | null): FieldFormatTuple {
    if (value === null) {
      return [this.placeholder, null, null];
    }
    // The unit is displayed apart from the value (FCOM figures: 32000 FT, 310 KT, 1133 Z)
    const split = this.splitUnit(value);
    return split ? [split[0], null, split[1]] : [value, null, null];
  }

  public async parse(input: string): Promise<string | null> {
    const entry = this.keepSpaces ? input.trim() : input.replace(/\s+/g, '');
    if (entry === '' || entry === this.placeholder) {
      return null;
    }
    return this.parser(entry);
  }
}

/** The entry format of a REQUEST field (FCOM DSC-46-10-20-50) */
export function requestFieldFormat(kind: RequestFieldKind): AtccomTextFormat {
  const format = requestFieldParser(kind);
  // An empty mandatory field shows amber boxes in place of the dashes
  return new AtccomTextFormat(
    format.maxDigits,
    format.parser,
    kind === 'freetext',
    '-'.repeat(PLACEHOLDER_LENGTHS[kind]),
    (value) => displayUnit(kind, value),
  );
}

/** The value and its unit, as the FCOM figures display them (e.g. 32000 FT, 310 KT, 1133 Z, 135 °T) */
function displayUnit(kind: RequestFieldKind, value: string): [string, string] | null {
  let match: RegExpMatchArray | null;
  switch (kind) {
    case 'altitude':
      match = value.match(/^(\d+)(FT|M)$/);
      return match ? [match[1], match[2]] : null;
    case 'time':
      match = value.match(/^(\d{4})Z$/);
      return match ? [match[1], 'Z'] : null;
    case 'speed':
    case 'groundSpeed':
      match = value.match(/^(\d+)KT$/);
      return match ? [match[1], 'KT'] : null;
    case 'verticalSpeed':
      match = value.match(/^(-?\d+)(FT\/MIN|M\/MIN)$/);
      return match ? [match[1], match[2]] : null;
    case 'degree':
      match = value.match(/^(\d{3})(T?)$/);
      return match ? [match[1], match[2] ? '°T' : '°'] : null;
    case 'sat':
      match = value.match(/^(-?\d+)(C|F)$/);
      return match ? [match[1], match[2]] : null;
    case 'endurance':
      match = value.match(/^(\d+)H(\d{2})$/);
      return match ? [`${match[1]} H${match[2]}`, 'MIN'] : null;
    case 'wind':
      match = value.match(/^(\d{3}\/\d+)(KT|KM\/H)$/);
      return match ? [match[1], match[2]] : null;
    default:
      return null;
  }
}

/** The number of characters of an empty field */
const PLACEHOLDER_LENGTHS: Record<RequestFieldKind, number> = {
  acType: 4,
  airport: 4,
  altitude: 5,
  atisCode: 1,
  center: 4,
  degree: 3,
  fix: 5,
  freetext: 10,
  frequency: 6,
  gate: 5,
  mach: 3,
  offset: 4,
  positionOrTime: 5,
  procedure: 6,
  speed: 3,
  time: 4,
  wxDeviation: 4,
  groundSpeed: 3,
  verticalSpeed: 4,
  wind: 7,
  sat: 3,
  endurance: 4,
  squawk: 4,
  souls: 3,
  distance: 4,
};

function requestFieldParser(kind: RequestFieldKind): { maxDigits: number; parser: (input: string) => string } {
  switch (kind) {
    case 'acType':
      return parserOf(4, pattern(/^[A-Z0-9]{2,4}$/, 'XXXX'));
    case 'airport':
      return parserOf(4, pattern(/^[A-Z0-9]{4}$/, 'AAAA'));
    case 'altitude':
      return parserOf(7, parseAtcAltitude);
    case 'atisCode':
      return parserOf(1, pattern(/^[A-Z]$/, 'A'));
    case 'center':
      return parserOf(4, pattern(/^[A-Z]{1,4}$/, 'AAAA'));
    case 'degree':
      return parserOf(4, parseAtcDegree);
    case 'fix':
      return parserOf(16, parseAtcFix);
    case 'freetext':
      return parserOf(32, parseAtcFreetext);
    case 'frequency':
      return parserOf(12, parseAtcFrequency);
    case 'gate':
      return parserOf(5, pattern(/^[A-Z0-9]{1,5}$/, 'XXXXX'));
    case 'mach':
      return parserOf(4, parseAtcMach);
    case 'offset':
      return parserOf(7, (input) => parseAtcOffset(input, false));
    case 'positionOrTime':
      return parserOf(16, parseAtcPositionOrTime);
    case 'procedure':
      return parserOf(6, pattern(/^[A-Z0-9]{1,6}$/, 'XXXXXX'));
    case 'speed':
      return parserOf(5, parseAtcSpeed);
    case 'time':
      return parserOf(9, (input) => {
        const time = parseAtcTime(input);
        if (!time) {
          throw formatError('HHMMZ');
        }
        return time;
      });
    case 'wxDeviation':
      return parserOf(8, (input) => parseAtcOffset(input, true));
    case 'groundSpeed':
      return parserOf(5, parseAtcGroundSpeed);
    case 'verticalSpeed':
      return parserOf(10, parseAtcVerticalSpeed);
    case 'wind':
      return parserOf(11, parseAtcWind);
    case 'sat':
      return parserOf(5, parseAtcSat);
    case 'endurance':
      return parserOf(9, parseAtcEndurance);
    case 'squawk':
      return parserOf(4, parseAtcSquawk);
    case 'souls':
      return parserOf(4, parseAtcSouls);
    case 'distance':
      return parserOf(7, parseAtcDistance);
  }
}

function parserOf(maxDigits: number, parser: (input: string) => string) {
  return { maxDigits, parser };
}
