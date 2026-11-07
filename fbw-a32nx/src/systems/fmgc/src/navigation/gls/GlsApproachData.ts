// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Approach } from '@flybywiresim/fbw-sdk';
import {
  GbasApproach,
  gbasApproachesOfRunway,
} from '../../../../../../../fbw-common/src/systems/shared/src/gbas/GbasApproachTable';
import { defineGbasApproach, GbasApproachDefinition, GbasRunwayRecord } from './GbasApproachDefinition';

/** What the MMR needs to know about the GLS procedure it is set to */
export interface GlsApproachData {
  channel: number;
  /** the reference path identifier, null for a channel that no table row has */
  rpi: string | null;
  /** degrees magnetic */
  course: number | null;
  /** degrees, negative for a descent like the glide slope of an ILS */
  slope: number | null;
  /** null when nothing can be received: unknown channel, or a sim runway that disagrees with the chart */
  definition: GbasApproachDefinition | null;
}

export function createGlsApproachData(approach: GbasApproach, runway: GbasRunwayRecord | null): GlsApproachData {
  return {
    channel: approach.channel,
    rpi: approach.rpi,
    course: approach.course,
    slope: -approach.gpa,
    definition: defineGbasApproach(approach, runway).definition,
  };
}

/** A channel that is tuned although no airport has it: the receiver gets nothing, like an ILS on a wrong frequency */
export function createUnknownGlsChannelData(channel: number): GlsApproachData {
  return { channel, rpi: null, course: null, slope: null, definition: null };
}

/** The table row of the GLS approach of a flight plan, undefined when the approach is not one of the table */
export function findGbasApproachOfApproach(
  airportIdent: string,
  approach: Pick<Approach, 'runwayIdent' | 'multipleIndicator'>,
): GbasApproach | undefined {
  return gbasApproachesOfRunway(airportIdent, approach.runwayIdent).find(
    (row) => row.suffix === approach.multipleIndicator,
  );
}
