// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { SearchHit } from '../../Pages/FltOps/Shared/DocumentSearch';
import {
  ECAM_MANUAL_ID,
  MMEL_MANUAL_ID,
  OpsLibraryCatalog,
  OpsNode,
  ecamUnitId,
  mmelUnitId,
} from './OpsLibraryContent';

/** The titles of the manuals the ECAM and functional code searches list their hits under */
const ECAM_GROUP = 'ECAM PROCEDURES';
const MMEL_GROUP = 'MMEL';

/**
 * ECAM SEARCH: the procedure of an alert and its MMEL entry.
 * @param catalog the documents
 * @param alertId the ECAM alert id
 * @returns the hits, none for an alert without a unit
 */
export function ecamSearchHits(catalog: OpsLibraryCatalog, alertId: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const procedure = catalog.find(ecamUnitId(alertId));
  if (procedure !== undefined) {
    hits.push({ id: procedure.unit.id, group: ECAM_GROUP, title: procedure.unit.title });
  }
  const entry = catalog.find(mmelUnitId(alertId));
  if (entry !== undefined) {
    hits.push({ id: entry.unit.id, group: MMEL_GROUP, title: entry.unit.title });
  }
  return hits;
}

/**
 * Design choice: a functional code is an ATA chapter (21) or chapter and section (21-51, 2151), which finds the ECAM
 * procedures of the chapter and the MMEL entries whose reference starts with it.
 * @param input the text of the field
 * @returns the digits of the code, null when the text is not a code
 */
export function parseFunctionalCode(input: string): string | null {
  const match = /^(\d{2})-?(\d{2})?$/.exec(input.trim());
  return match === null ? null : `${match[1]}${match[2] ?? ''}`;
}

/**
 * FUNCTIONAL CODE SEARCH.
 * @param catalog the documents
 * @param code the digits of a functional code, from parseFunctionalCode
 * @returns the hits in the ECAM PROCEDURES and MMEL manuals
 */
export function functionalCodeHits(catalog: OpsLibraryCatalog, code: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const addMatching = (manualId: string, group: string, keyOf: (unit: OpsNode) => string | undefined) => {
    for (const unit of catalog.index(manualId)?.units() ?? []) {
      const node = unit as OpsNode;
      const key = (keyOf(node) ?? '').replace(/-/g, '');
      if (key.startsWith(code)) {
        hits.push({ id: node.id, group, title: node.title });
      }
    }
  };
  addMatching(ECAM_MANUAL_ID, ECAM_GROUP, (node) => node.ecamId);
  addMatching(MMEL_MANUAL_ID, MMEL_GROUP, (node) => node.mmelReference);
  return hits;
}

/**
 * ECAM SEARCH by the words of an alert title. Design choice: a title field instead of a list of all the alerts, which
 * would be several hundred lines long.
 * @param catalog the documents
 * @param text the words of the field
 * @returns the hits of every alert whose title holds all the words
 */
export function ecamTitleSearchHits(catalog: OpsLibraryCatalog, text: string): SearchHit[] {
  const words = text
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== '');
  if (words.length === 0) {
    return [];
  }
  const hits: SearchHit[] = [];
  for (const unit of catalog.index(ECAM_MANUAL_ID)?.units() ?? []) {
    const node = unit as OpsNode;
    const title = node.title.toLowerCase();
    if (node.ecamId !== undefined && words.every((word) => title.indexOf(word) >= 0)) {
      hits.push(...ecamSearchHits(catalog, node.ecamId));
    }
  }
  return hits;
}
