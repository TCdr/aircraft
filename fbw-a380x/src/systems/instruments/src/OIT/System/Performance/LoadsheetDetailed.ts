// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { formatWholeWeight } from './PerformanceEntries';
import {
  LOADSHEET_AIRCRAFT,
  LoadsheetConfiguration,
  LoadsheetLimitedBy,
  LoadsheetResults,
  LtsFlight,
  armToPercentMac,
  ltsDateTime,
  takeoffThsText,
} from './Loadsheet';

/*
 * LOADSHEET in DETAILED mode: the crew composition gives the DOW/CG, the passengers and the cargo with their
 * distribution in the cabin sections and the cargo compartments give the ZFW/CG, and the detailed loadsheet (IATA
 * layout) reports them. The weights are in kg, the arms in feet forward of the reference datum.
 */

/** A cabin section of the PAYLOAD DISTR panel: the FBW A380X passenger zones of one deck area, with their seats */
export interface CabinSection {
  readonly name: string;
  readonly seats: number;
  readonly arm: number;
}

/** The cabin sections, main deck then upper deck, with the seats and arms of the aircraft passenger stations */
export const CABIN_SECTIONS: readonly CabinSection[] = [
  { name: 'MAIN FWD', seats: 56, arm: 75.7 },
  { name: 'MAIN MID 1', seats: 132, arm: 30.6 },
  { name: 'MAIN MID 2', seats: 124, arm: -11.1 },
  { name: 'MAIN AFT', seats: 82, arm: -46.9 },
  { name: 'UPPER FWD', seats: 14, arm: 60.8 },
  { name: 'UPPER MID', seats: 58, arm: 11.7 },
  { name: 'UPPER AFT', seats: 18, arm: -29.3 },
];

/** The passenger stations of the aircraft in each cabin section, with their seats (the seat flags of the payload) */
export const CABIN_SECTION_STATIONS: readonly (readonly { readonly simVar: string; readonly seats: number }[])[] = [
  [
    { simVar: 'L:A32NX_PAX_MAIN_FWD_A', seats: 28 },
    { simVar: 'L:A32NX_PAX_MAIN_FWD_B', seats: 28 },
  ],
  [
    { simVar: 'L:A32NX_PAX_MAIN_MID_1A', seats: 39 },
    { simVar: 'L:A32NX_PAX_MAIN_MID_1B', seats: 50 },
    { simVar: 'L:A32NX_PAX_MAIN_MID_1C', seats: 43 },
  ],
  [
    { simVar: 'L:A32NX_PAX_MAIN_MID_2A', seats: 48 },
    { simVar: 'L:A32NX_PAX_MAIN_MID_2B', seats: 40 },
    { simVar: 'L:A32NX_PAX_MAIN_MID_2C', seats: 36 },
  ],
  [
    { simVar: 'L:A32NX_PAX_MAIN_AFT_A', seats: 42 },
    { simVar: 'L:A32NX_PAX_MAIN_AFT_B', seats: 40 },
  ],
  [{ simVar: 'L:A32NX_PAX_UPPER_FWD', seats: 14 }],
  [
    { simVar: 'L:A32NX_PAX_UPPER_MID_A', seats: 30 },
    { simVar: 'L:A32NX_PAX_UPPER_MID_B', seats: 28 },
  ],
  [{ simVar: 'L:A32NX_PAX_UPPER_AFT', seats: 18 }],
];

/** A cargo compartment of the PAYLOAD DISTR panel: the FBW A380X cargo stations */
export interface CargoCompartment {
  readonly name: string;
  readonly simVar: string;
  /** kg */
  readonly maxWeight: number;
  readonly arm: number;
}

export const CARGO_COMPARTMENTS: readonly CargoCompartment[] = [
  { name: 'CP1', simVar: 'L:A32NX_CARGO_FWD', maxWeight: 28_577, arm: 67.4 },
  { name: 'CP2', simVar: 'L:A32NX_CARGO_AFT', maxWeight: 20_310, arm: -18.5 },
  { name: 'CP3', simVar: 'L:A32NX_CARGO_BULK', maxWeight: 2_513, arm: -52.9 },
];

/**
 * The CREW list: the flight crew / cabin crew composition, the standard one included in the basic weight.
 * Design choice: the operator list of this aircraft has the standard crew and one or two additional flight crew members
 * on the cockpit jump seats.
 */
export const CREW_OPTIONS: readonly { readonly label: string; readonly additionalFlightCrew: number }[] = [
  { label: '2/24 (STD)', additionalFlightCrew: 0 },
  { label: '3/24', additionalFlightCrew: 1 },
  { label: '4/24', additionalFlightCrew: 2 },
];

/** Design choice: the standard mass of a flight crew member, kg */
const FLIGHT_CREW_MASS = 85;

/** The arm of the cockpit seats, feet */
const COCKPIT_ARM = 105.3;

/** CATERING and MISC: the operator defines no galley code and no additional item for this aircraft */
export const CATERING_OPTIONS: readonly string[] = ['NONE (STD)'];

export const MISC_OPTIONS: readonly string[] = ['NONE (STD)'];

/**
 * Design choice: the weights of a child and an infant, in the ratio of typical operator standard weights to the adult
 * weight (185 / 77 / 22 lb), kg. The adult weight is the passenger weight of the aircraft.
 */
const CHILD_WEIGHT = 35;

const INFANT_WEIGHT = 10;

/** The passengers by type: adults, children and infants (the infants have no seat) */
export interface PaxByType {
  readonly adults: number;
  readonly children: number;
  readonly infants: number;
}

/**
 * The PAX entry of the LOADING panel: adults, children and infants separated by slashes, e.g. 400/32/4 or 400.
 * @param text the entry
 * @returns the passengers, or null for an invalid entry or more seated passengers than seats
 */
export function parsePaxEntry(text: string): PaxByType | null {
  const match = text.trim().match(/^(\d{1,3})(?:\/(\d{1,3}))?(?:\/(\d{1,3}))?$/);
  if (!match) {
    return null;
  }
  const pax = {
    adults: parseInt(match[1], 10),
    children: match[2] !== undefined ? parseInt(match[2], 10) : 0,
    infants: match[3] !== undefined ? parseInt(match[3], 10) : 0,
  };
  return seatedPax(pax) <= totalSeats() ? pax : null;
}

/**
 * @param pax the passengers
 * @returns the entry as the LOADING panel shows it, e.g. 400/32/4
 */
export function formatPaxEntry(pax: PaxByType): string {
  return `${pax.adults}/${pax.children}/${pax.infants}`;
}

/** @returns the seats of the cabin */
function totalSeats(): number {
  return CABIN_SECTIONS.reduce((sum, section) => sum + section.seats, 0);
}

/**
 * @param pax the passengers
 * @returns the passengers that occupy a seat
 */
export function seatedPax(pax: PaxByType): number {
  return pax.adults + pax.children;
}

/**
 * @param pax the passengers
 * @param adultWeight the passenger weight of the aircraft, kg
 * @returns the passenger weight, kg
 */
function paxWeight(pax: PaxByType, adultWeight: number): number {
  return pax.adults * adultWeight + pax.children * CHILD_WEIGHT + pax.infants * INFANT_WEIGHT;
}

/**
 * PAX DISTRIBUTION STANDARD: the seated passengers spread over the cabin sections in proportion to their seats (the
 * largest remainders take the rounded passengers).
 * @param seated the seated passengers
 * @returns the passengers of each cabin section
 */
export function standardPaxDistribution(seated: number): number[] {
  const seats = totalSeats();
  const exact = CABIN_SECTIONS.map((section) => (seated * section.seats) / seats);
  const distribution = exact.map((pax) => Math.floor(pax));
  let left = seated - distribution.reduce((sum, pax) => sum + pax, 0);
  const byRemainder = exact
    .map((pax, i) => ({ i, remainder: pax - Math.floor(pax) }))
    .sort((a, b) => b.remainder - a.remainder);
  for (const { i } of byRemainder) {
    if (left <= 0) {
      break;
    }
    distribution[i]++;
    left--;
  }
  return distribution;
}

/** The DETAILED entries: crew composition, loading and its distribution */
export interface DetailedLoading {
  /** Index in CREW_OPTIONS */
  readonly crew: number;
  readonly pax: PaxByType | null;
  /** The cargo of the LOADING panel, kg */
  readonly cargo: number | null;
  /** The passengers of each cabin section */
  readonly paxPerSection: readonly number[];
  /** The cargo of each compartment, kg (0 for an empty field) */
  readonly cargoPerCompartment: readonly number[];
}

/** The dry operating weight and the zero fuel weight of the DETAILED entries */
export interface DetailedZeroFuel {
  readonly dow: number;
  readonly docg: number;
  readonly payload: number;
  readonly zfw: number;
  readonly zfcg: number;
}

/**
 * @param crew the index in CREW_OPTIONS
 * @returns the DOW and its arm: the basic weight of the aircraft with the additional flight crew
 */
export function detailedDryOperatingWeight(crew: number): { readonly dow: number; readonly arm: number } {
  const crewWeight = CREW_OPTIONS[crew].additionalFlightCrew * FLIGHT_CREW_MASS;
  const dow = LOADSHEET_AIRCRAFT.dow + crewWeight;
  return { dow, arm: (LOADSHEET_AIRCRAFT.dow * LOADSHEET_AIRCRAFT.dowArm + crewWeight * COCKPIT_ARM) / dow };
}

/**
 * The ΔPAX and ΔCARGO of the PAYLOAD DISTR panel: what the LOADING panel has that is not distributed yet (negative:
 * distributed in excess).
 * @param loading the DETAILED entries
 * @returns the passengers and the cargo weight (kg) left to distribute
 */
export function undistributedPayload(loading: DetailedLoading): { readonly pax: number; readonly cargo: number } {
  const distributedPax = loading.paxPerSection.reduce((sum, pax) => sum + pax, 0);
  const distributedCargo = loading.cargoPerCompartment.reduce((sum, kg) => sum + kg, 0);
  return {
    pax: (loading.pax !== null ? seatedPax(loading.pax) : 0) - distributedPax,
    cargo: (loading.cargo ?? 0) - distributedCargo,
  };
}

/**
 * @param loading the DETAILED entries
 * @returns the names of the missing parameters of the ERROR list
 */
export function missingDetailedParameters(loading: DetailedLoading): string[] {
  const missing: string[] = [];
  if (loading.pax === null) {
    missing.push('PAX');
  }
  if (loading.cargo === null) {
    missing.push('CARGO');
  }
  return missing;
}

/**
 * The DOW/CG, the payload and the ZFW/CG of the DETAILED entries. The passengers of a section weigh the average
 * passenger weight of the LOADING panel (the infants travel with the seated passengers).
 * @param loading the DETAILED entries, without missing parameters
 * @param adultWeight the passenger weight of the aircraft, kg
 * @returns the weights, or the errors of the ERROR list
 */
export function computeDetailedZeroFuel(
  loading: DetailedLoading,
  adultWeight: number,
): { readonly zeroFuel: DetailedZeroFuel | null; readonly errors: string[] } {
  const pax = loading.pax!;
  const errors: string[] = [];
  const left = undistributedPayload(loading);
  if (left.pax > 0) {
    errors.push(`PAX DISTRIBUTION: ${left.pax} PAX not distributed`);
  } else if (left.pax < 0) {
    errors.push(`PAX DISTRIBUTION: ${-left.pax} PAX in excess`);
  }
  if (Math.round(left.cargo) !== 0) {
    errors.push(left.cargo > 0 ? 'CARGO DISTRIBUTION: cargo not distributed' : 'CARGO DISTRIBUTION: cargo in excess');
  }
  loading.paxPerSection.forEach((sectionPax, i) => {
    if (sectionPax > CABIN_SECTIONS[i].seats) {
      errors.push(`${CABIN_SECTIONS[i].name}: more PAX than seats`);
    }
  });
  loading.cargoPerCompartment.forEach((kg, i) => {
    if (kg > CARGO_COMPARTMENTS[i].maxWeight) {
      errors.push(`${CARGO_COMPARTMENTS[i].name}: above the maximum compartment load`);
    }
  });
  if (errors.length > 0) {
    return { zeroFuel: null, errors };
  }

  const dryOperating = detailedDryOperatingWeight(loading.crew);
  const seated = seatedPax(pax);
  const averagePaxWeight = seated > 0 ? paxWeight(pax, adultWeight) / seated : 0;
  let payload = 0;
  let payloadMoment = 0;
  loading.paxPerSection.forEach((sectionPax, i) => {
    payload += sectionPax * averagePaxWeight;
    payloadMoment += sectionPax * averagePaxWeight * CABIN_SECTIONS[i].arm;
  });
  loading.cargoPerCompartment.forEach((kg, i) => {
    payload += kg;
    payloadMoment += kg * CARGO_COMPARTMENTS[i].arm;
  });
  const zfw = dryOperating.dow + payload;
  return {
    zeroFuel: {
      dow: dryOperating.dow,
      docg: armToPercentMac(dryOperating.arm),
      payload,
      zfw,
      zfcg: armToPercentMac((dryOperating.dow * dryOperating.arm + payloadMoment) / zfw),
    },
    errors: [],
  };
}

/** The LTS EDITION entries of a detailed loadsheet */
export interface DetailedLtsEdition {
  readonly checkedBy: string;
  readonly approvedBy: string;
  readonly captInfoNotes: readonly string[];
  readonly paxPerClass: string;
  /** The edition number, 1 to 99 */
  readonly edition: number;
}

/**
 * The detailed loadsheet (IATA layout): the edition number, the load in each compartment and the passengers with the
 * cabin sections, the weights with their limits, the CGs, the T.O THS and the notes of the captain.
 * @param edition the LTS EDITION entries
 * @param flight the flight of FLT OPS STS
 * @param configuration the CONFIGURATION panel
 * @param loading the DETAILED entries
 * @param results the loadsheet results
 * @param date the date of the report (UTC)
 * @param metric whether the weights are in kg (else lb)
 * @returns the report lines
 */
export function detailedLoadsheetReportLines(
  edition: DetailedLtsEdition,
  flight: LtsFlight,
  configuration: LoadsheetConfiguration,
  loading: DetailedLoading,
  results: LoadsheetResults,
  date: Date,
  metric: boolean,
): string[] {
  const weight = (kg: number) => formatWholeWeight(kg, metric);
  const column = (label: string, value: string) => `${label.padEnd(24)}${value.padStart(8)}`;
  const limit = (by: LoadsheetLimitedBy) => (results.limitedBy === by ? '  L' : '');
  const pax = loading.pax!;
  const editionText = edition.edition.toFixed(0).padStart(2, '0');
  const { date: dateText, time } = ltsDateTime(date);
  const crew = CREW_OPTIONS[loading.crew].label.replace(' (STD)', '');
  const cargo = loading.cargoPerCompartment.reduce((sum, kg) => sum + kg, 0);
  const seated = seatedPax(pax);

  const lines = [
    `${'L O A D S H E E T'.padEnd(28)}${'CHECKED'.padEnd(17)}${'APPROVED'.padEnd(15)}EDNO`,
    `${`ALL WEIGHTS IN ${metric ? 'KILOGRAMS' : 'POUNDS'}`.padEnd(28)}${edition.checkedBy.padEnd(17)}${edition.approvedBy.padEnd(15)}${editionText}`,
    '',
    'FROM/TO   FLIGHT   A/C REG  CREW   DATE     TIME',
    `${flight.from.padEnd(4)} ${flight.to.padEnd(4)} ${flight.flightNumber.padEnd(8)} ${flight.registration.padEnd(8)} ${crew.padEnd(6)} ${dateText}  ${time}`,
    '',
    `${''.padEnd(24)}${'WEIGHT'.padStart(8)}  D I S T R I B U T I O N`,
    `${column('LOAD IN COMPARTMENTS', weight(cargo))}  ${CARGO_COMPARTMENTS.map((c, i) => `${c.name}/${weight(loading.cargoPerCompartment[i])}`).join(' ')}`,
    `${column('PASSENGER/CABIN BAG', weight(results.payload - cargo))}  ${formatPaxEntry(pax)}  TTL ${seated + pax.infants}`,
  ];
  if (edition.paxPerClass !== '') {
    lines.push(`${''.padEnd(34)}${edition.paxPerClass}`);
  }
  lines.push(
    ...['MAIN', 'UPPER'].map((deck) => {
      const sections = CABIN_SECTIONS.map((section, i) => ({ section, pax: loading.paxPerSection[i] })).filter(
        ({ section }) => section.name.startsWith(deck),
      );
      const text = sections.map(({ section, pax }) => `${section.name.substring(deck.length + 1)}/${pax}`).join(' ');
      return `${''.padEnd(34)}${deck.padEnd(6)}${text}`;
    }),
    '*'.repeat(60),
    column('TOTAL TRAFFIC LOAD', weight(results.payload)),
    column('DRY OPERATING WEIGHT', weight(results.dow)),
    `${column('ZERO FUEL WEIGHT ACTUAL', weight(results.zfw))} MAX ${weight(LOADSHEET_AIRCRAFT.mzfw)}${limit('ZFW')}`,
    column('TAKE OFF FUEL', weight(results.takeoffFuel)),
    `${column('TAKE OFF WEIGHT ACTUAL', weight(results.tow))} MAX ${weight(configuration.mtow)}${limit('TOW')}`,
    column('TRIP FUEL', weight(results.tripFuel)),
    `${column('LANDING WEIGHT ACTUAL', weight(results.lw))} MAX ${weight(configuration.mlw)}${limit('LW')}`,
    '',
    `${results.underload >= 0 ? 'UNDERLOAD' : 'OVERLOAD'} ${weight(Math.abs(results.underload))} LIMITED BY ${results.limitedBy}`,
    '',
    'BALANCE AND SEATING CONDITIONS',
    `DOCG ${results.docg.toFixed(1)}  ZFCG ${results.zfcg.toFixed(1)}  TOCG ${results.towCg.toFixed(1)}  LWCG ${results.lwCg.toFixed(1)}`,
    takeoffThsText(results),
  );
  const notes = edition.captInfoNotes.filter((line) => line.trim() !== '');
  if (notes.length > 0) {
    lines.push('', 'CAPT INFO NOTES', ...notes);
  }
  lines.push('', 'END');
  return lines;
}
