// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { allAlertIds, failuresWithoutDetail, resolveFailureDetail } from '@flybywiresim/fbw-sdk';
import type { FailureDetail } from '@flybywiresim/fbw-sdk';
import { EcamAbnormalProcedures } from '../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { A380FailureDefinitions } from './a380';
import { A380_DETAIL_CHAPTERS_DONE, A380FailureDetails } from './a380-details';

/*
 * The procedure tables import the enums of the EcamMessages index and the index imports the tables, so a test that
 * loads the index runs the tables before the enums exist. The index gets empty tables here, and the real one this spec
 * needs is put in afterwards.
 */
vi.mock('../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata21-22-23', () => ({
  EcamAbnormalSensedAta212223: {},
  EcamDeferredProcAta212223: {},
}));
vi.mock('../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata24', () => ({
  EcamAbnormalSensedAta24: {},
  EcamDeferredProcAta24: {},
}));
vi.mock('../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata26', () => ({
  EcamAbnormalSensedAta26: {},
}));
vi.mock('../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata27', () => ({
  EcamAbnormalSensedAta27: {},
  EcamDeferredProcAta27: {},
}));
vi.mock('../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata28', () => ({
  EcamAbnormalSensedAta28: {},
}));
vi.mock('../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata29-30', () => ({
  EcamAbnormalSensedAta2930: {},
  EcamDeferredProcAta2930: {},
}));
vi.mock('../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata31-32-33', () => ({
  EcamAbnormalSensedAta313233: {},
  EcamDeferredProcAta313233: {},
}));
vi.mock('../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata34', () => ({
  EcamAbnormalSensedAta34: {},
  EcamDeferredProcAta34: {},
}));
vi.mock('../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata35-36-42', () => ({
  EcamAbnormalSensedAta353642: {},
}));
vi.mock('../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata46-49-52-56', () => ({
  EcamAbnormalSensedAta46495256: {},
}));
vi.mock('../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata70', () => ({
  EcamAbnormalSensedAta70: {},
  EcamDeferredProcAta70: {},
}));
vi.mock('../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata80-rest', () => ({
  EcamAbnormalSensedAta80Rest: {},
  EcamDeferredProcAta80Rest: {},
}));
vi.mock('../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/secondary-failures', () => ({
  EcamAbnormalSecondaryFailures: {},
}));

const ALERT_TABLES: [string, string][] = [
  ['ata21-22-23', 'EcamAbnormalSensedAta212223'],
  ['ata24', 'EcamAbnormalSensedAta24'],
  ['ata26', 'EcamAbnormalSensedAta26'],
  ['ata27', 'EcamAbnormalSensedAta27'],
  ['ata28', 'EcamAbnormalSensedAta28'],
  ['ata29-30', 'EcamAbnormalSensedAta2930'],
  ['ata31-32-33', 'EcamAbnormalSensedAta313233'],
  ['ata34', 'EcamAbnormalSensedAta34'],
  ['ata35-36-42', 'EcamAbnormalSensedAta353642'],
  ['ata46-49-52-56', 'EcamAbnormalSensedAta46495256'],
  ['ata70', 'EcamAbnormalSensedAta70'],
  ['ata80-rest', 'EcamAbnormalSensedAta80Rest'],
  ['secondary-failures', 'EcamAbnormalSecondaryFailures'],
];

beforeAll(async () => {
  for (const [file, exportName] of ALERT_TABLES) {
    const actual = await vi.importActual<Record<string, typeof EcamAbnormalProcedures>>(
      `../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/${file}`,
    );
    Object.assign(EcamAbnormalProcedures, actual[exportName]);
  }
});

const DOCUMENT_REFERENCE = /FCOM|DSC-|QRH|\.ts\b|line \d/i;

function textFields(detail: FailureDetail): string[] {
  return [
    detail.whatItIs,
    ...detail.impact,
    ...detail.effects.map((effect) => `${effect.where} ${effect.text}`),
    detail.logbook.reason,
    detail.clearing,
    ...(detail.notSimulated ?? []),
  ];
}

function allDetails(): FailureDetail[] {
  const details: FailureDetail[] = Object.values(A380FailureDetails.entries);
  for (const family of A380FailureDetails.families) {
    family.ids.forEach((_, index) => details.push(family.detail(index + 1)));
  }
  return details;
}

describe('A380 failure details', () => {
  it('has a detail for every failure of the finished chapters', () => {
    const missing = failuresWithoutDetail(A380FailureDetails, A380FailureDefinitions, A380_DETAIL_CHAPTERS_DONE);
    expect(missing, `failures without a detail: ${missing.join(', ')}`).toEqual([]);
  });

  it('only names alerts that have an ECAM procedure', () => {
    const unknown = allAlertIds(A380FailureDetails, A380FailureDefinitions).filter(
      (alertId) => !(alertId in EcamAbnormalProcedures),
    );
    expect(unknown, `alerts without a procedure: ${unknown.join(', ')}`).toEqual([]);
  });

  it('contains no document references in any text', () => {
    const offending = allDetails()
      .flatMap(textFields)
      .filter((text) => DOCUMENT_REFERENCE.test(text));
    expect(offending).toEqual([]);
  });

  it('only describes failures that exist', () => {
    const known = new Set(A380FailureDefinitions.map(([, id]) => id));
    const ids = [
      ...Object.keys(A380FailureDetails.entries).map(Number),
      ...A380FailureDetails.families.flatMap((family) => family.ids),
    ];
    const unknown = ids.filter((id) => !known.has(id));
    expect(unknown, `ids not in the failure list: ${unknown.join(', ')}`).toEqual([]);
  });

  it('describes the hot air valve 1 failure', () => {
    const detail = resolveFailureDetail(A380FailureDetails, 21005);
    expect(detail?.alertIds).toEqual(['211800032', '211800048']);
    expect(detail?.whatItIs.length).toBeGreaterThan(0);
    expect(detail?.impact.length).toBeGreaterThan(0);
    expect(detail?.effects.length).toBeGreaterThan(0);
  });

  it('names where each effect is seen, and why the logbook is or is not written', () => {
    for (const detail of allDetails()) {
      expect(detail.whatItIs.trim()).not.toBe('');
      expect(detail.logbook.reason.trim()).not.toBe('');
      for (const effect of detail.effects) {
        expect(effect.where.trim()).not.toBe('');
        expect(effect.text.trim()).not.toBe('');
      }
    }
  });
});
