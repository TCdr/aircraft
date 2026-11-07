// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Coordinates } from 'msfs-geo';
import { findRunwayOfGbasApproach } from '../../../../../../../fbw-common/src/systems/shared/src/gbas/GbasApproachTable';
import { GlsManualEntryField } from '@fmgc/navigation/LandingSystemTuning';
import { createGlsApproachData, createUnknownGlsChannelData, GlsApproachData } from './GlsApproachData';
import { GbasRunwayRecord } from './GbasApproachDefinition';
import { resolveManualGlsEntry } from './ManualGlsEntry';

export interface ManualGlsTuningContext {
  destinationIdent: string | null;
  originIdent: string | null;
  /** null while the position is not known */
  presentPosition: Coordinates | null;
  /** the airports of the table with their positions */
  loadTableAirports: () => Promise<{ ident: string; location: Coordinates }[]>;
  loadRunways: (airportIdent: string) => Promise<(GbasRunwayRecord & { ident: string })[]>;
  /** read again after every wait: the first entry waits for the airport facilities, and the lock may engage meanwhile */
  isTuningLocked: () => boolean;
  setManualGls: (gls: GlsApproachData, entry: GlsManualEntryField) => void;
}

export type ManualGlsTuningResult =
  /** an MMR was set to the GLS */
  | 'tuned'
  /** the MMR tuning locked while the entry was being resolved, nothing was set */
  | 'locked'
  /** a reference path identifier that no GLS of the destination or origin has: the caller may look it up as an ILS ident */
  | 'unknown-rpi'
  /** neither a channel nor a reference path identifier */
  | 'invalid';

/**
 * Tunes the GLS that the crew typed as a channel or a reference path identifier.
 * @param entry what the crew typed
 * @param field the field it was typed into, which decides what the pages show as a crew entry
 */
export async function tuneManualGls(
  entry: string | number,
  field: GlsManualEntryField,
  context: ManualGlsTuningContext,
): Promise<ManualGlsTuningResult> {
  const resolution = resolveManualGlsEntry(entry, {
    destinationIdent: context.destinationIdent,
    originIdent: context.originIdent,
    presentPosition: context.presentPosition,
    tableAirports: await context.loadTableAirports(),
  });

  const tune = (gls: GlsApproachData): ManualGlsTuningResult => {
    if (context.isTuningLocked()) {
      return 'locked';
    }
    context.setManualGls(gls, field);
    return 'tuned';
  };

  switch (resolution.kind) {
    case 'resolved': {
      const runways = await context.loadRunways(resolution.airportIdent);
      const runway = findRunwayOfGbasApproach(runways, resolution.approach);
      return tune(createGlsApproachData(resolution.approach, runway ?? null));
    }
    case 'unknown-channel':
      return tune(createUnknownGlsChannelData(resolution.channel));
    case 'unknown-rpi':
      return 'unknown-rpi';
    default:
      return 'invalid';
  }
}
