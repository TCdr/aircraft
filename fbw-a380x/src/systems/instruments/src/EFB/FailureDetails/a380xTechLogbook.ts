// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FailureDetail, LogbookWriteResult, NXDataStore, plainEcamText } from '@flybywiresim/fbw-sdk';
import { canRecordData, parseTechLogbook, recordDefect } from '../../OIT/System/TechLogbook';

/**
 * Same key as TECH_LOGBOOK_STORAGE_KEY of the OIT store. Copied because that file pulls in the OIT runtime (event bus,
 * secure communication), which the flyPad must not load. The OIT picks the change up through its storage subscription.
 */
const TECH_LOGBOOK_STORAGE_KEY = 'OIS_TECH_LOGBOOK';

/**
 * Adds the failure to the OIS technical logbook as a temporary item, so the crew reviews it there.
 * @param failure the failure's name and ATA chapter
 * @param detail the failure's detail, for its first alert
 * @param procedureText the procedure lines, as shown on the EWD
 * @returns whether the entry was written, or why not
 */
export function writeLogbookEntry(
  failure: { name: string; ata: number },
  detail: FailureDetail,
  procedureText: readonly string[],
): LogbookWriteResult {
  const state = parseTechLogbook(NXDataStore.getLegacy(TECH_LOGBOOK_STORAGE_KEY, ''));
  if (!state) {
    return { written: false, reason: 'The OIS logbook has not been opened yet' };
  }
  if (!canRecordData(state)) {
    return { written: false, reason: 'The OIS logbook is not in on-board control' };
  }

  const registration = SimVar.GetSimVarValue('ATC ID', 'string');
  const next = recordDefect(
    state,
    {
      title: failure.name,
      ata: String(failure.ata),
      pilotComment: procedureText.map(plainEcamText).join(' / '),
      ecamAlertId: detail.alertIds[0] ?? null,
    },
    'temporary',
    Date.now(),
    typeof registration === 'string' ? registration.trim().toUpperCase() : '',
  );
  if (next === state) {
    return { written: false, reason: 'The OIS logbook refused the entry' };
  }

  NXDataStore.setLegacy(TECH_LOGBOOK_STORAGE_KEY, JSON.stringify(next));
  return { written: true };
}
