// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FmsError, FmsErrorType } from '@fmgc/FmsError';

/**
 * What an entry in the INIT ALTN field does: NONE or CLR delete the alternate, an ident sets it if it is an airport of
 * the navigation database, else NOT IN DATABASE and nothing changes (the field keeps the alternate it showed).
 * @param entry the entry, null for CLR
 * @param searchAirport looks the ident up in the navigation database
 * @returns the ident of the new alternate, undefined to delete the alternate
 */
export async function alternateEntryTarget(
  entry: string | null,
  searchAirport: (ident: string) => Promise<unknown>,
): Promise<string | undefined> {
  if (!entry || entry === 'NONE') {
    return undefined;
  }
  const airport = await searchAirport(entry);
  if (!airport) {
    throw new FmsError(FmsErrorType.NotInDatabase);
  }
  return entry;
}
