// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { NXDataStore } from '@flybywiresim/fbw-sdk';
import { TECH_LOGBOOK_STORAGE_KEY, TechLogbookState, parseTechLogbook } from './TechLogbook';

/**
 * The eLogbook belongs to the NSS AVNCS domain: the FLT OPS domain only reads what the NSS pushes to it.
 * @returns the eLogbook, null when there is none
 */
export function readLogbook(): TechLogbookState | null {
  return parseTechLogbook(NXDataStore.getLegacy(TECH_LOGBOOK_STORAGE_KEY, ''));
}
