// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { ElecAlertFlags, ElecAlertLogic, ElecNetworkInputs } from './FwsElecAlerts';
import {
  AC_BUS_12_DC_1_FAULT_STATUS,
  AC_BUS_23_DC_12_FAULT_STATUS,
  AC_BUS_24_FAULT_STATUS,
  AC_BUS_34_DC_2_FAULT_STATUS,
  acBus12Dc1FaultLines,
  acBus23Dc12FaultLines,
  acBus24FaultLines,
  acBus34Dc2FaultLines,
  combineElecBusFaults,
  DC_BUS_12_FAULT_STATUS,
  DC_BUS_1_ESS_FAULT_STATUS,
  dcBus12FaultLines,
  dcBus1EssFaultLines,
  ElecProcedureInputs,
  FlightTimeAboveFl300,
  isStaticInverterFault,
  ProcedureLines,
  ELEC_COMBINED_BUS_PHASE_INHIBITION,
} from './FwsElecCombinedBusAlerts';

/* The source texts (importing the EcamMessages tables in a test fails on a circular import, see FwsCdsDuFault.spec) */
const messagesDir = resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages');
const ata24 = readFileSync(resolve(messagesDir, 'AbnormalSensed/ata24.ts'), 'utf-8');
const ecamIndex = readFileSync(resolve(messagesDir, 'index.ts'), 'utf-8');
const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
const fwsCore = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');

/** The number of items of an alert in an ata*.ts text: the lines that open an item, 6 spaces then "{" */
function itemCount(source: string, id: string): number {
  const start = source.indexOf(`  ${id}: {`);
  expect(start).toBeGreaterThan(0);
  const end = source.indexOf('\n  },', start);
  return (source.slice(start, end).match(/^ {6}\{/gm) ?? []).length;
}

/** The source of one FwsAbnormalSensed entry, from its id to the end of its object */
function alertBlock(id: string): string {
  const start = abnormalSensed.indexOf(`    ${id}: {`);
  expect(start).toBeGreaterThan(0);
  return abnormalSensed.slice(start, abnormalSensed.indexOf('\n    },', start));
}

/** A healthy network in flight */
function normalFlight(): ElecNetworkInputs {
  return {
    acBusPowered: [true, true, true, true],
    acEssBusPowered: true,
    dcBusPowered: [true, true],
    dcEssBusPowered: true,
    acEssFedByAc4: false,
    tr2FedByExtPwr: false,
    trPotentialNormal: [true, true, true, true],
    engGenPbOn: [true, true, true, true],
    engGenPotentialNormal: [true, true, true, true],
    driveConnected: [true, true, true, true],
    engineRunning: [true, true, true, true],
    engineFirePbReleased: [false, false, false, false],
    apuAvailable: false,
    apuGenPotentialNormal: [false, false],
    busTiePbAuto: true,
  };
}

type Bus = 'ac1' | 'ac2' | 'ac3' | 'ac4' | 'dc1' | 'dc2' | 'dcEss';

/** The ElecAlertLogic flags with the given busbars lost (the TRs of a lost AC busbar give no output either) */
function flagsWithLost(...lost: Bus[]): ElecAlertFlags {
  const i = normalFlight();
  (['ac1', 'ac2', 'ac3', 'ac4'] as const).forEach((bus, n) => (i.acBusPowered[n] = !lost.includes(bus)));
  i.dcBusPowered = [!lost.includes('dc1'), !lost.includes('dc2')];
  i.dcEssBusPowered = !lost.includes('dcEss');
  i.trPotentialNormal = [i.acBusPowered[1], i.acBusPowered[2], true, i.acBusPowered[3]];
  return new ElecAlertLogic().update(i);
}

function procedureInputs(overrides: Partial<ElecProcedureInputs> = {}): ElecProcedureInputs {
  return {
    onGround: false,
    moreThan30MinAboveFl300: false,
    feedTanks1And4Low: false,
    gearDownLocked: false,
    crossFeedPbOn: [false, false, false, false],
    wxrTawsSys: 1,
    xpdrTcasSys: 1,
    attHdgFoOn3: false,
    airDataFoOn3: false,
    outerTankPumpPbOn: [true, true],
    emerOutrTkXfrOn: false,
    autoThrustEngaged: true,
    ...overrides,
  };
}

/** The names of the shown items of a procedure, from its ata24.ts text */
function shownNames(id: string, lines: ProcedureLines): string[] {
  const start = ata24.indexOf(`  ${id}: {`);
  const block = ata24.slice(start, ata24.indexOf('\n  },', start));
  const names = block
    .split(/^ {6}\{/m)
    .slice(1)
    .map((item) => (item.match(/name: (['"])(.*?)\1/) ?? [])[2] ?? 'FMS_PRED_UNRELIABLE');
  return names.filter((_, n) => lines.show[n]);
}

describe('combineElecBusFaults (combined busbar alerts)', () => {
  it.each([
    ['AC BUS 1+2 & DC BUS 1 FAULT', ['ac1', 'ac2', 'dc1'] as Bus[], 'ac12Dc1'],
    ['AC BUS 2+3 & DC BUS 1+2 FAULT', ['ac2', 'ac3', 'dc1', 'dc2'] as Bus[], 'ac23Dc12'],
    ['AC BUS 2+4 FAULT', ['ac2', 'ac4'] as Bus[], 'ac24'],
    ['AC BUS 3+4 & DC BUS 2 FAULT', ['ac3', 'ac4', 'dc2'] as Bus[], 'ac34Dc2'],
    ['DC BUS 1+2 FAULT', ['dc1', 'dc2'] as Bus[], 'dc12'],
    ['DC BUS 1+ESS FAULT', ['dc1', 'dcEss'] as Bus[], 'dc1Ess'],
  ])('%s triggers when its busbars are lost, and replaces their single alerts', (_name, lost, combined) => {
    const flags = combineElecBusFaults(flagsWithLost(...lost));
    expect(flags.combined).toEqual({
      ac12Dc1: combined === 'ac12Dc1',
      ac23Dc12: combined === 'ac23Dc12',
      ac24: combined === 'ac24',
      ac34Dc2: combined === 'ac34Dc2',
      dc12: combined === 'dc12',
      dc1Ess: combined === 'dc1Ess',
    });
    expect(flags.acBusFault).toEqual([false, false, false, false]);
    expect(flags.dcBusFault).toEqual([false, false]);
    expect(flags.dcEssBusFault).toBe(false);
  });

  it('keeps the single alerts when only one busbar of a combination is lost', () => {
    const flags = combineElecBusFaults(flagsWithLost('ac2', 'dc1'));
    expect(Object.values(flags.combined).some((c) => c)).toBe(false);
    expect(flags.acBusFault).toEqual([false, true, false, false]);
    expect(flags.dcBusFault).toEqual([true, false]);
  });

  it('keeps the single alert of a busbar that no active combination covers', () => {
    const flags = combineElecBusFaults(flagsWithLost('ac2', 'ac4', 'dc2'));
    expect(flags.combined.ac24).toBe(true);
    expect(flags.dcBusFault).toEqual([false, true]);
  });

  it('DC BUS 1+2 FAULT is part of AC BUS 2+3 & DC BUS 1+2 FAULT and is not shown with it', () => {
    const flags = combineElecBusFaults(flagsWithLost('ac2', 'ac3', 'dc1', 'dc2'));
    expect(flags.combined.ac23Dc12).toBe(true);
    expect(flags.combined.dc12).toBe(false);
  });

  it('overlapping combinations are both shown (AC BUS 1+2 & DC BUS 1 with AC BUS 2+4)', () => {
    const flags = combineElecBusFaults(flagsWithLost('ac1', 'ac2', 'ac4', 'dc1'));
    expect(flags.combined.ac12Dc1).toBe(true);
    expect(flags.combined.ac24).toBe(true);
  });

  it('does not show AC ESS BUS ALTN with AC BUS 1+2 & DC BUS 1 FAULT (as with AC BUS 1 FAULT)', () => {
    const base = flagsWithLost('ac1', 'ac2', 'dc1');
    const flags = combineElecBusFaults({ ...base, acEssBusAltn: true });
    expect(flags.acEssBusAltn).toBe(false);
    expect(combineElecBusFaults({ ...flagsWithLost(), acEssBusAltn: true }).acEssBusAltn).toBe(true);
  });

  it('raises no combined alert in ELEC EMER CONFIG (all AC busbars lost)', () => {
    const flags = combineElecBusFaults(flagsWithLost('ac1', 'ac2', 'ac3', 'ac4', 'dc1', 'dc2'));
    expect(flags.emerConfig).toBe(true);
    expect(Object.values(flags.combined).some((c) => c)).toBe(false);
  });

  it('FwsCore feeds the single busbar subjects from the combined flags', () => {
    expect(fwsCore).toContain('const elecFlags = combineElecBusFaults(this.elecAlertLogic.update(elecInputs));');
  });
});

describe('ELEC STATIC INV FAULT', () => {
  it('is raised when the static inverter is switched in (contactor 7XB closed) and gives no normal output', () => {
    expect(isStaticInverterFault(true, false)).toBe(true);
    expect(isStaticInverterFault(true, true)).toBe(false);
    expect(isStaticInverterFault(false, false)).toBe(false);
  });

  it('is crew awareness, no master light, on the ELEC AC page, inhibited in phases 3 to 10', () => {
    const block = alertBlock('240800080');
    expect(block).toContain('failure: 1');
    expect(block).toContain('SdPages.ElecAc');
    expect(block).toContain('simVarIsActive: this.fws.elecStaticInvFault');
    expect(ELEC_COMBINED_BUS_PHASE_INHIBITION.staticInvFault).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('FlightTimeAboveFl300', () => {
  it('counts the time above FL 300 since lift-off and resets on the ground', () => {
    const time = new FlightTimeAboveFl300();
    time.update(false, 35_000, 29 * 60_000);
    expect(time.moreThan30Min).toBe(false);
    time.update(false, 29_000, 10 * 60_000); // below FL 300: not counted
    expect(time.moreThan30Min).toBe(false);
    time.update(false, null, 10 * 60_000); // invalid altitude: not counted
    expect(time.moreThan30Min).toBe(false);
    time.update(false, 31_000, 2 * 60_000);
    expect(time.moreThan30Min).toBe(true);
    time.update(true, 31_000, 1000);
    expect(time.moreThan30Min).toBe(false);
  });
});

describe('Combined busbar alert procedures match their ata24.ts items', () => {
  const inputs = procedureInputs();
  it.each([
    ['240800003', acBus12Dc1FaultLines()],
    ['240800005', acBus23Dc12FaultLines(inputs)],
    ['240800006', acBus24FaultLines(inputs)],
    ['240800008', acBus34Dc2FaultLines(inputs)],
    ['240800027', dcBus12FaultLines(inputs)],
    ['240800028', dcBus1EssFaultLines(inputs)],
  ])('%s: one shown and one checked flag per item', (id, lines) => {
    expect(lines.show).toHaveLength(itemCount(ata24, id));
    expect(lines.checked).toHaveLength(itemCount(ata24, id));
  });

  it.each([
    ['240800003', 'elecAc12Dc1Fault', 'acBus12Dc1FaultLines', 'ElecAc'],
    ['240800005', 'elecAc23Dc12Fault', 'acBus23Dc12FaultLines', 'ElecAc'],
    ['240800006', 'elecAc24Fault', 'acBus24FaultLines', 'ElecAc'],
    ['240800008', 'elecAc34Dc2Fault', 'acBus34Dc2FaultLines', 'ElecDc'],
    ['240800027', 'elecDc12Fault', 'dcBus12FaultLines', 'ElecDc'],
    ['240800028', 'elecDc1EssFault', 'dcBus1EssFaultLines', 'ElecDc'],
  ])('%s is a master caution on its SD page, inhibited in phases 4, 5, 10', (id, subject, lines, page) => {
    const block = alertBlock(id);
    expect(block).toContain(`simVarIsActive: this.fws.${subject}`);
    expect(block).toContain(`whichItemsToShow: () => ${lines}(`);
    expect(block).toContain('failure: 2');
    expect(block).toContain(`sysPage: SdPages.${page}`);
    expect(block).toContain('ELEC_COMBINED_BUS_PHASE_INHIBITION.combinedBusFault');
  });

  it('the combined alerts are inhibited in phases 4, 5 and 10', () => {
    expect(ELEC_COMBINED_BUS_PHASE_INHIBITION.combinedBusFault).toEqual([4, 5, 10]);
  });

  it('AC BUS 1+2 & DC BUS 1 FAULT: ATC COM VOICE ONLY, AP SIDESTICK..., LDG DIST AFFECTED', () => {
    expect(shownNames('240800003', acBus12Dc1FaultLines())).toEqual([
      'ATC COM VOICE ONLY',
      'AP: SIDESTICK LOCKING DEVICE NOT AVAIL',
      'LDG DIST: AFFECTED',
    ]);
  });

  it('AC BUS 2+3 & DC BUS 1+2 FAULT in flight, less than 30 min above FL 300: the FL 50/MEA branch', () => {
    const names = shownNames('240800005', acBus23Dc12FaultLines(procedureInputs()));
    expect(names).toContain('DESCENT TO FL 50/MEA');
    expect(names).not.toContain('DESCENT TO FL 280');
    expect(names).toContain('L/G GRVTY EXTN ONLY');
    expect(names).not.toContain('NO L/G RETRACTION');
    expect(names).not.toContain('BEFORE OPENING ANY CABIN DOOR:');
    expect(names).not.toContain('OUTR TKs PMPs');
  });

  it('AC BUS 2+3 & DC BUS 1+2 FAULT after 30 min above FL 300, low feed tanks: the FL 280 branch, OUTR TKs PMPs OFF', () => {
    const lines = acBus23Dc12FaultLines(
      procedureInputs({ moreThan30MinAboveFl300: true, feedTanks1And4Low: true, outerTankPumpPbOn: [false, false] }),
    );
    const names = shownNames('240800005', lines);
    expect(names).toContain('DESCENT TO FL 280');
    expect(names).not.toContain('DESCENT TO FL 50/MEA');
    expect(names).toContain('OUTR TKs PMPs');
    // OUTR TKs PMPs OFF is the 31st item (index 30), checked with both outer pumps OFF
    expect(lines.checked[30]).toBe(true);
  });

  it('AC BUS 2+3 & DC BUS 1+2 FAULT on the ground: no descent lines, the cabin door lines, NO L/G RETRACTION', () => {
    const names = shownNames(
      '240800005',
      acBus23Dc12FaultLines(procedureInputs({ onGround: true, gearDownLocked: true })),
    );
    expect(names).not.toContain('DESCENT TO FL 50/MEA');
    expect(names).not.toContain('DESCENT TO FL 280');
    expect(names).toContain('BEFORE OPENING ANY CABIN DOOR:');
    expect(names).toContain('NO L/G RETRACTION');
  });

  it('AC BUS 2+3 & DC BUS 1+2 FAULT: CROSSFEED 3/4 ON and the SURV SYS 1 lines are sensed', () => {
    const lines = acBus23Dc12FaultLines(
      procedureInputs({ crossFeedPbOn: [false, false, true, true], wxrTawsSys: 1, xpdrTcasSys: 1 }),
    );
    expect(lines.checked.slice(0, 5)).toEqual([true, true, false, true, true]);
  });

  it('AC BUS 2+4 FAULT: ALL CROSSFEEDS ON and A/THR DISCONNECT are sensed; KEEP ENG 1 LAST only on the ground', () => {
    const lines = acBus24FaultLines(
      procedureInputs({ crossFeedPbOn: [true, true, true, true], autoThrustEngaged: false }),
    );
    expect(lines.checked[1]).toBe(true);
    expect(lines.checked[2]).toBe(true);
    expect(shownNames('240800006', lines)).not.toContain('FOR ENG STOP : KEEP ENG 1 LAST');
    expect(shownNames('240800006', acBus24FaultLines(procedureInputs({ onGround: true })))).toContain(
      'FOR ENG STOP : KEEP ENG 1 LAST',
    );
  });

  it('AC BUS 3+4 & DC BUS 2 FAULT: ATT HDG and AIR DATA F/O ON 3 sensed, no FUEL CONSUMPT line', () => {
    const lines = acBus34Dc2FaultLines(procedureInputs({ attHdgFoOn3: true, airDataFoOn3: true }));
    expect(lines.checked[1]).toBe(true);
    expect(lines.checked[2]).toBe(true);
    expect(shownNames('240800008', lines)).not.toContain('FUEL CONSUMPT INCRSD');
    expect(ata24).toMatch(/name: 'VENT AVNCS EXTRACT',\r?\n\s+sensed: true,\r?\n\s+labelNotCompleted: 'OVRD'/);
  });

  it('DC BUS 1+2 FAULT: EMER OUTR TK XFR lines only with low feed tanks 1 and 4', () => {
    expect(shownNames('240800027', dcBus12FaultLines(procedureInputs()))).not.toContain('EMER OUTR TK XFR');
    const lines = dcBus12FaultLines(procedureInputs({ feedTanks1And4Low: true, emerOutrTkXfrOn: true }));
    expect(shownNames('240800027', lines)).toContain('EMER OUTR TK XFR');
    expect(lines.checked[19]).toBe(true);
  });

  it('DC BUS 1+ESS FAULT: CROSSFEED 1+2 ON, SURV SYS 2', () => {
    const lines = dcBus1EssFaultLines(
      procedureInputs({ crossFeedPbOn: [true, true, false, false], wxrTawsSys: 2, xpdrTcasSys: 2 }),
    );
    expect(lines.checked.slice(0, 4)).toEqual([true, true, true, true]);
    expect(shownNames('240800028', lines).slice(0, 5)).toEqual([
      'CROSSFEED 1',
      'CROSSFEED 2',
      'WXR & TAWS',
      'XPDR & TCAS',
      'NO COM AVAILABLE',
    ]);
  });
});

describe('STATUS of the combined busbar alerts', () => {
  const keys = (table: string): Set<string> => {
    const start = ecamIndex.indexOf(`export const ${table}`);
    const end = ecamIndex.indexOf('\n};', start);
    return new Set(
      ecamIndex
        .slice(start, end)
        .match(/^ {2}(\d+):/gm)
        ?.map((k) => k.trim().slice(0, -1)),
    );
  };
  const limitations = keys('EcamLimitations');
  const inopSys = keys('EcamInopSys');
  const infos = keys('EcamInfos');

  it.each([
    ['AC BUS 1+2 & DC BUS 1', AC_BUS_12_DC_1_FAULT_STATUS],
    ['AC BUS 2+3 & DC BUS 1+2', AC_BUS_23_DC_12_FAULT_STATUS],
    ['AC BUS 2+4', AC_BUS_24_FAULT_STATUS],
    ['AC BUS 3+4 & DC BUS 2', AC_BUS_34_DC_2_FAULT_STATUS],
    ['DC BUS 1+2', DC_BUS_12_FAULT_STATUS],
    ['DC BUS 1+ESS', DC_BUS_1_ESS_FAULT_STATUS],
  ])('%s: every key exists in EcamMessages', (_name, status) => {
    [...status.limitationsAllPhases, ...status.limitationsApprLdg, ...status.limitationsPfd].forEach((key) =>
      expect(limitations.has(key), key).toBe(true),
    );
    [...status.inopSysAllPhases, ...status.inopSysApprLdg].forEach((key) => expect(inopSys.has(key), key).toBe(true));
    status.info.forEach((key) => expect(infos.has(key), key).toBe(true));
  });

  it('DC BUS 1+ESS FAULT INOP SYS has the three X BLEED AUTO CTL and FEED TK 2 PMPs', () => {
    expect(DC_BUS_1_ESS_FAULT_STATUS.inopSysAllPhases).toEqual(
      expect.arrayContaining(['280300012', '260300007', '260300008', '260300009']),
    );
  });
});
