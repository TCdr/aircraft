// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { EcamAbnormalSensedProcedures } from '../../../MsfsAvionicsCommon/EcamMessages';
import { defaultProcedureState, parseFwcText, procedureLines } from './OpsLibraryProcedureLines';

// The ECAM tables load in beforeAll; with the Docker slots busy that takes longer than the 10 s default
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

/*
 * The procedure tables import the enums of the EcamMessages index and the index imports the tables: loaded through the
 * index, that cycle runs the tables before the enums exist. So the index gets empty tables here and the real abnormal
 * tables are added to its procedure list afterwards.
 */
vi.mock('../../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata21-22-23', () => ({
  EcamAbnormalSensedAta212223: {},
  EcamDeferredProcAta212223: {},
}));
vi.mock('../../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata24', () => ({
  EcamAbnormalSensedAta24: {},
  EcamDeferredProcAta24: {},
}));
vi.mock('../../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata26', () => ({ EcamAbnormalSensedAta26: {} }));
vi.mock('../../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata27', () => ({
  EcamAbnormalSensedAta27: {},
  EcamDeferredProcAta27: {},
}));
vi.mock('../../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata28', () => ({ EcamAbnormalSensedAta28: {} }));
vi.mock('../../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata29-30', () => ({
  EcamAbnormalSensedAta2930: {},
  EcamDeferredProcAta2930: {},
}));
vi.mock('../../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata31-32-33', () => ({
  EcamAbnormalSensedAta313233: {},
  EcamDeferredProcAta313233: {},
}));
vi.mock('../../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata34', () => ({
  EcamAbnormalSensedAta34: {},
  EcamDeferredProcAta34: {},
}));
vi.mock('../../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata35-36-42', () => ({
  EcamAbnormalSensedAta353642: {},
}));
vi.mock('../../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata46-49-52-56', () => ({
  EcamAbnormalSensedAta46495256: {},
}));
vi.mock('../../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata70', () => ({
  EcamAbnormalSensedAta70: {},
  EcamDeferredProcAta70: {},
}));
vi.mock('../../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata80-rest', () => ({
  EcamAbnormalSensedAta80Rest: {},
  EcamDeferredProcAta80Rest: {},
}));
vi.mock('../../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/secondary-failures', () => ({
  EcamAbnormalSecondaryFailures: {},
}));

const ABNORMAL_TABLES: [() => Promise<Record<string, object>>, string][] = [
  [
    () =>
      vi.importActual<Record<string, object>>('../../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata21-22-23'),
    'EcamAbnormalSensedAta212223',
  ],
  [
    () => vi.importActual<Record<string, object>>('../../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata24'),
    'EcamAbnormalSensedAta24',
  ],
  [
    () => vi.importActual<Record<string, object>>('../../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata26'),
    'EcamAbnormalSensedAta26',
  ],
  [
    () => vi.importActual<Record<string, object>>('../../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata27'),
    'EcamAbnormalSensedAta27',
  ],
  [
    () => vi.importActual<Record<string, object>>('../../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata28'),
    'EcamAbnormalSensedAta28',
  ],
  [
    () => vi.importActual<Record<string, object>>('../../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata29-30'),
    'EcamAbnormalSensedAta2930',
  ],
  [
    () =>
      vi.importActual<Record<string, object>>('../../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata31-32-33'),
    'EcamAbnormalSensedAta313233',
  ],
  [
    () => vi.importActual<Record<string, object>>('../../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata34'),
    'EcamAbnormalSensedAta34',
  ],
  [
    () =>
      vi.importActual<Record<string, object>>('../../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata35-36-42'),
    'EcamAbnormalSensedAta353642',
  ],
  [
    () =>
      vi.importActual<Record<string, object>>('../../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata46-49-52-56'),
    'EcamAbnormalSensedAta46495256',
  ],
  [
    () => vi.importActual<Record<string, object>>('../../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata70'),
    'EcamAbnormalSensedAta70',
  ],
  [
    () => vi.importActual<Record<string, object>>('../../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata80-rest'),
    'EcamAbnormalSensedAta80Rest',
  ],
  [
    () =>
      vi.importActual<Record<string, object>>(
        '../../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/secondary-failures',
      ),
    'EcamAbnormalSecondaryFailures',
  ],
];

beforeAll(async () => {
  for (const [load, exportName] of ABNORMAL_TABLES) {
    Object.assign(EcamAbnormalSensedProcedures, (await load())[exportName]);
  }
});

describe('parseFwcText', () => {
  it('splits a text into runs with the colour and underline codes', () => {
    expect(parseFwcText('\x1b<4m\x1b4mELEC\x1bm AC BUS 1 FAULT')).toEqual([
      [
        { text: 'ELEC', colour: 'amber', underlined: true, framed: false },
        { text: ' AC BUS 1 FAULT', colour: 'amber', underlined: false, framed: false },
      ],
    ]);
  });

  it('starts a new line at a carriage return or newline', () => {
    const lines = parseFwcText('A\rB\nC');
    expect(lines.map((line) => line.map((s) => s.text))).toEqual([['A'], ['B'], ['C']]);
  });

  it('frames a run and uses the default colour before the first code', () => {
    const lines = parseFwcText("\x1b'mBOX\x1bm", 'cyan');
    expect(lines[0][0]).toEqual({ text: 'BOX', colour: 'cyan', underlined: false, framed: true });
  });

  it('keeps plain text and drops a flashing code', () => {
    expect(parseFwcText('PLAIN \x1b)mTEXT')[0].map((s) => s.text)).toEqual(['PLAIN ', 'TEXT']);
  });
});

describe('procedure lines', () => {
  const ids = () => Object.keys(EcamAbnormalSensedProcedures);

  it('the OPS LIBRARY draws the lines of the generator the EWD uses', () => {
    expect(ids().length).toBeGreaterThan(50);
    for (const id of ids().slice(0, 40)) {
      const lines = procedureLines(id, null);
      expect(lines.length).toBeGreaterThan(0);
      expect(lines[0].text).toBe(EcamAbnormalSensedProcedures[id].title);
    }
  });

  it('shows the items of the procedure, not only its title, and no ACTIVATE or CLEAR control', () => {
    const withItems = ids().filter((id) => EcamAbnormalSensedProcedures[id].items.length >= 2);
    expect(withItems.length).toBeGreaterThan(10);
    for (const id of withItems.slice(0, 40)) {
      const lines = procedureLines(id, null);
      expect(lines.length).toBeGreaterThanOrEqual(EcamAbnormalSensedProcedures[id].items.length);
      expect(lines.some((line) => line.text.indexOf('CLEAR') >= 0 && line.sensed === false)).toBe(false);
    }
  });

  it('a default state shows and activates every item and checks none', () => {
    const id = ids()[0];
    const state = defaultProcedureState(id);
    const count = EcamAbnormalSensedProcedures[id].items.length;
    expect(state.itemsChecked).toEqual(new Array(count).fill(false));
    expect(state.itemsToShow.every((v) => v)).toBe(true);
    expect(state.itemsActive.every((v) => v)).toBe(true);
    expect(state.itemsTimeStamp).toEqual(new Array(count).fill(null));
  });

  it('an unknown alert has a state without items', () => {
    expect(defaultProcedureState('nope').itemsChecked).toEqual([]);
  });
});
