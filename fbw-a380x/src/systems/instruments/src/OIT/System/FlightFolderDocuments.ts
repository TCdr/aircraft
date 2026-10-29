// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { IOfpNotam, ISimbriefData } from '@flybywiresim/fbw-sdk';
import { buildFlightPlan, weightText } from './FlightFolderFlightPlan';

/*
 * The documents of an electronic flight folder built from the OFP. Design choice: the operator defines the folders in
 * real life; these are the ones the OFP can fill.
 */

export type EffDocKind = 'text' | 'flight-plan';

/** What the crew must do to a document: sign it, check it, or nothing */
export type EffConstraint = 'none' | 'sign' | 'check';

export interface EffDocument {
  readonly kind: EffDocKind;
  readonly text: string;
  readonly constraint: EffConstraint;
  /** Part of the export before push back */
  readonly exportBeforePushBack: boolean;
}

export interface EffNode {
  /** Unique in the folder: the path of the node */
  readonly id: string;
  readonly name: string;
  readonly children?: readonly EffNode[];
  readonly doc?: EffDocument;
}

export const PERFORMANCE_FOLDER_ID = 'performance';
export const RECYCLE_BIN_ID = 'recycle-bin';
export const FLIGHT_PLAN_DOC_ID = 'ops-plans/flight-plan';

/**
 * @param html the OFP as the airline system writes it: preformatted text with tags
 * @returns the plain text, the lines kept
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\r\n/g, '\n')
    .replace(/^\n+/, '');
}

/**
 * A text document of the folder.
 * @param id the id of the node
 * @param name the name in the tree
 * @param text the text shown
 * @param constraint what the crew must do to the document
 * @param exportBeforePushBack whether the export before push back holds it
 * @returns the node
 */
function textDocument(
  id: string,
  name: string,
  text: string,
  constraint: EffConstraint,
  exportBeforePushBack = true,
): EffNode {
  return { id, name, doc: { kind: 'text', text, constraint, exportBeforePushBack } };
}

/**
 * A folder of the tree.
 * @param id the id of the node
 * @param name the name in the tree
 * @param children the nodes inside
 * @returns the node
 */
function folder(id: string, name: string, children: readonly EffNode[]): EffNode {
  return { id, name, children };
}

/**
 * @param notams the NOTAMs of one place
 * @returns them as one text
 */
function notamText(notams: readonly IOfpNotam[]): string {
  return notams.map((notam) => notam.text).join('\n\n');
}

/**
 * @param ofp the OFP
 * @param icao the airport
 * @returns the METAR and TAF of the airport as the document shows them
 */
function weatherText(ofp: ISimbriefData, icao: string): string {
  const metar = ofp.weather?.metars?.[icao];
  const taf = ofp.weather?.tafs?.[icao];
  return [`${icao}`, '', 'METAR', metar ?? 'NOT AVAILABLE', '', 'TAF', taf ?? 'NOT AVAILABLE'].join('\n');
}

/**
 * @param ms unix ms, null for none
 * @returns the UTC date and time
 */
function dateTimeText(ms: number | null): string {
  if (ms === null) {
    return '-';
  }
  return new Date(ms).toISOString().replace('T', ' ').substring(0, 16) + 'Z';
}

/**
 * @param icao the ICAO code
 * @param iata the IATA code, empty for none
 * @returns the airport as the flight information shows it
 */
function airportText(icao: string, iata: string): string {
  return iata ? `${icao} ${iata}` : icao;
}

/**
 * @param ofp the OFP
 * @returns the flight information document
 */
function flightInformationText(ofp: ISimbriefData): string {
  const plan = buildFlightPlan(ofp);
  return [
    `FLIGHT      ${plan.flightNumber}`,
    `CALLSIGN    ${ofp.callsign ?? ''}`,
    `REGISTRATION ${plan.registration}`,
    `AIRCRAFT    ${plan.aircraftType}`,
    `FROM        ${airportText(plan.fromIcao, plan.fromIata)}`,
    `TO          ${airportText(plan.toIcao, plan.toIata)}`,
    `ALTERNATE   ${airportText(plan.altnIcao, plan.altnIata)}`,
    `SCHED OUT   ${dateTimeText(plan.etdMs)}`,
    `PASSENGERS  ${ofp.weights?.passengerCount ?? ''}`,
    `ROUTE       ${plan.route}`,
  ].join('\n');
}

/**
 * @param ofp the OFP
 * @param metric whether the aircraft shows tonnes
 * @returns the weights of the OFP as a loadsheet text
 */
function loadsheetText(ofp: ISimbriefData, metric: boolean): string {
  const plan = buildFlightPlan(ofp);
  const unit = metric ? 'T' : 'KLB';
  const line = (label: string, kg: number | null, max: number | null): string =>
    `${label.padEnd(18)}${weightText(kg, metric).padStart(8)} ${unit}${max !== null ? `   MAX ${weightText(max, metric)}` : ''}`;
  return [
    'LOADSHEET (OFP FIGURES)',
    '',
    line('DRY OPERATING W.', plan.load.dow, null),
    line('PAYLOAD', plan.load.pld, null),
    line('ZERO FUEL WEIGHT', plan.load.zfw, plan.maxStruct.zfw),
    line('TAKE-OFF FUEL', plan.load.tof, null),
    line('TAKE-OFF WEIGHT', plan.load.tow, plan.maxStruct.tow),
    line('TRIP FUEL', plan.load.ebo, null),
    line('LANDING WEIGHT', plan.load.lw, plan.maxStruct.lw),
  ].join('\n');
}

/**
 * @param ofp the airline OFP
 * @param metric whether the aircraft shows tonnes
 * @returns the folders and documents of its electronic flight folder
 */
export function buildFlightFolderTree(ofp: ISimbriefData, metric: boolean): EffNode[] {
  const plan = buildFlightPlan(ofp);
  const weatherDocs = [
    textDocument('weather/departure', 'Departure', weatherText(ofp, plan.fromIcao), 'check'),
    textDocument('weather/destination', 'Destination', weatherText(ofp, plan.toIcao), 'check'),
  ];
  if (plan.altnIcao) {
    weatherDocs.push(textDocument('weather/alternate', 'Alternate', weatherText(ofp, plan.altnIcao), 'check'));
  }

  const notamDocs: EffNode[] = [];
  const notams = ofp.notams;
  if (notams) {
    const lists: [string, string, readonly IOfpNotam[]][] = [
      ['departure', 'Departure', notams.departure],
      ['destination', 'Destination', notams.destination],
      ['alternate', 'Alternate', notams.alternate],
      ['enroute', 'En-route', notams.enroute],
    ];
    for (const [id, name, list] of lists) {
      if (list.length > 0) {
        notamDocs.push(textDocument(`notams/${id}`, name, notamText(list), 'check'));
      }
    }
  }

  const tree: EffNode[] = [
    textDocument('flight-information', 'Flight Information', flightInformationText(ofp), 'check'),
    folder('weather', 'WEATHER DATA', weatherDocs),
  ];
  if (notamDocs.length > 0) {
    tree.push(folder('notams', 'NOTAMS', notamDocs));
  }
  tree.push(
    folder('loadsheet', 'LOAD SHEET', [
      textDocument('loadsheet/loadsheet', 'Loadsheet', loadsheetText(ofp, metric), 'sign'),
    ]),
    folder('ops-plans', 'OPS FLT PLANS', [
      {
        id: FLIGHT_PLAN_DOC_ID,
        name: 'Flight Plan',
        doc: { kind: 'flight-plan', text: '', constraint: 'sign', exportBeforePushBack: true },
      },
    ]),
    folder('ofp', 'OFP (BACK-UP)', [textDocument('ofp/ofp', 'OFP', stripHtml(ofp.text ?? ''), 'none', false)]),
  );
  return tree;
}
