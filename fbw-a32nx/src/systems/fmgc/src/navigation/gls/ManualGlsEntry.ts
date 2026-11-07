// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Coordinates, distanceTo } from 'msfs-geo';
import {
  findGbasApproachByChannel,
  findGbasApproachByRpi,
  GbasApproach,
  isGbasChannel,
} from '../../../../../../../fbw-common/src/systems/shared/src/gbas/GbasApproachTable';

/**
 * Design choice: a channel without a destination match is looked up at the table airports this close to the aircraft,
 * the distance at which the FMS tunes the landing system of the destination on its own.
 */
const MANUAL_GLS_CHANNEL_RANGE_NM = 300;

/** A reference path identifier: a letter, two digits and a letter or digit */
export const RPI_PATTERN = /^[A-Z]\d{2}[A-Z0-9]$/;

export interface ManualGlsEntryContext {
  destinationIdent: string | null;
  originIdent: string | null;
  /** null while the position is not known */
  presentPosition: Coordinates | null;
  /** the airports of the table with their positions, for the channel that is not at the destination */
  tableAirports: readonly { ident: string; location: Coordinates }[];
}

export type ManualGlsEntryResolution =
  | { kind: 'resolved'; airportIdent: string; approach: GbasApproach }
  /** The channel is valid but no airport near has it: it is tuned and nothing is received */
  | { kind: 'unknown-channel'; channel: number }
  /** An RPI belongs to the destination or origin only, as it repeats between airports */
  | { kind: 'unknown-rpi'; rpi: string }
  | { kind: 'invalid' };

/**
 * Resolves what the crew typed into the landing system field. A channel is 5 digits (20001 to 39999) and an RPI is 4
 * characters; a channel is unique within an airport only and an RPI repeats between airports, so each needs its
 * airport: the channel looks at the destination, then at the nearest airport of the table with that channel within
 * range; the RPI looks at the destination, then at the origin.
 */
export function resolveManualGlsEntry(
  entry: string | number,
  context: ManualGlsEntryContext,
): ManualGlsEntryResolution {
  const text = String(entry).trim().toUpperCase();

  if (/^\d{5}$/.test(text)) {
    const channel = Number(text);
    return isGbasChannel(channel) ? resolveChannel(channel, context) : { kind: 'invalid' };
  }
  if (RPI_PATTERN.test(text)) {
    return resolveRpi(text, context);
  }
  return { kind: 'invalid' };
}

function resolveChannel(channel: number, context: ManualGlsEntryContext): ManualGlsEntryResolution {
  if (context.destinationIdent) {
    const atDestination = findGbasApproachByChannel(context.destinationIdent, channel);
    if (atDestination) {
      return { kind: 'resolved', airportIdent: context.destinationIdent, approach: atDestination };
    }
  }

  if (context.presentPosition) {
    let nearest: { airportIdent: string; approach: GbasApproach } | null = null;
    let nearestDistance = MANUAL_GLS_CHANNEL_RANGE_NM;
    for (const airport of context.tableAirports) {
      const approach = findGbasApproachByChannel(airport.ident, channel);
      if (!approach) {
        continue;
      }
      const distance = distanceTo(context.presentPosition, airport.location);
      if (distance <= nearestDistance) {
        nearestDistance = distance;
        nearest = { airportIdent: airport.ident, approach };
      }
    }
    if (nearest) {
      return { kind: 'resolved', ...nearest };
    }
  }

  return { kind: 'unknown-channel', channel };
}

function resolveRpi(rpi: string, context: ManualGlsEntryContext): ManualGlsEntryResolution {
  for (const airportIdent of [context.destinationIdent, context.originIdent]) {
    const approach = airportIdent ? findGbasApproachByRpi(airportIdent, rpi) : undefined;
    if (airportIdent && approach) {
      return { kind: 'resolved', airportIdent, approach };
    }
  }
  return { kind: 'unknown-rpi', rpi };
}
