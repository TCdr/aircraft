// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { enginePumpPressLoStatus } from './HydPumpStatus';

/* The wiring is read from the source text, as FwsAbnormalSensedItems.spec.ts does (EcamMessages import cycle). */
const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
const inopSys = readFileSync(resolve(__dirname, 'FwsInopSys.ts'), 'utf-8');
const messagesDir = '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
const ata29 = readFileSync(resolve(__dirname, messagesDir, 'AbnormalSensed/ata29-30.ts'), 'utf-8');
const messageIndex = readFileSync(resolve(__dirname, messagesDir, 'index.ts'), 'utf-8');

/** The source of one entry of FwsAbnormalSensed, from its id to the end of its object */
function alertBlock(id: string, from = 0): string {
  const start = abnormalSensed.indexOf(`    ${id}: {`, from);
  expect(start).toBeGreaterThan(0);
  return abnormalSensed.slice(start, abnormalSensed.indexOf('\n    },', start));
}

describe('HYD G(Y) ENG PMP PRESS LO STATUS (A380 FCOM l.155077-155091)', () => {
  it('one pump failed: REDUND LOSS of that pump, no INOP SYS', () => {
    expect(enginePumpPressLoStatus([false, true, false, false], false)).toEqual({
      inopSys: [false, false, false, false],
      redundLoss: [false, true, false, false],
    });
  });

  it('two pumps or more failed: INOP SYS of those pumps, no REDUND LOSS', () => {
    expect(enginePumpPressLoStatus([true, false, false, true], false)).toEqual({
      inopSys: [true, false, false, true],
      redundLoss: [false, false, false, false],
    });
  });

  it('the whole system lost: G (Y) HYD SYS replaces the pump lines', () => {
    expect(enginePumpPressLoStatus([true, true, true, true], true)).toEqual({
      inopSys: [false, false, false, false],
      redundLoss: [false, false, false, false],
    });
  });

  it('the 8 INOP SYS and 8 REDUND LOSS lines exist and are wired', () => {
    for (let pump = 0; pump < 8; pump++) {
      const inopCode = 290300005 + pump;
      const redundCode = 290300027 + pump;
      expect(inopSys).toContain(`${inopCode}: { simVarIsActive: this.fws.enginePumpInopSys[${pump}],`);
      expect(inopSys).toMatch(
        new RegExp(
          `${redundCode}: \\{\\s+simVarIsActive: this\\.fws\\.enginePumpRedundLoss\\[${pump}\\],[^}]*redundancyLoss: true`,
        ),
      );
      expect(messageIndex).toContain(`${redundCode}: '`);
    }
  });
});

describe('HYD deferred procedures (A380 FCOM l.155249-155253, l.155480-155487)', () => {
  it.each([
    ['290700001', '290800019'],
    ['290700002', '290800020'],
    ['290700003', '290800031'],
    ['290700004', '290800032'],
  ])('%s comes from %s FOR APPROACH and is sensed', (deferred, alert) => {
    const start = ata29.indexOf(`  ${deferred}: {`);
    expect(start).toBeGreaterThan(0);
    const procedure = ata29.slice(start, ata29.indexOf('\n  },', start));
    expect(procedure).toContain(`fromAbnormalProcs: ['${alert}'],`);
    expect(procedure).toContain('type: DeferredProcedureType.FOR_APPROACH,');
    const deferredEntries = abnormalSensed.indexOf('public ewdDeferredProcs');
    expect(alertBlock(deferred, deferredEntries)).toContain('whichItemsChecked');
    expect(messageIndex).toContain('...EcamDeferredProcAta2930,');
  });

  it('SYS OVHT: not shown with the engine pumps disconnected', () => {
    const deferredEntries = abnormalSensed.indexOf('public ewdDeferredProcs');
    expect(alertBlock('290700003', deferredEntries)).toContain('!eng1PumpDisc && !eng2PumpDisc');
    expect(alertBlock('290700004', deferredEntries)).toContain('!eng3PumpDisc && !eng4PumpDisc');
  });
});

describe('HYD G+Y SYS PRESS LO (A380 FCOM l.155840-156109)', () => {
  it('LDG PERF AFFECTED (l.155898), not LDG DIST AFFECTED', () => {
    const start = ata29.indexOf('  290800039: {');
    const procedure = ata29.slice(start, ata29.indexOf('  290800040: {'));
    expect(procedure).toContain("name: 'LDG PERF AFFECTED',");
    expect(procedure).not.toContain('LDG DIST AFFECTED');
  });

  it('STATUS INOP SYS (l.156098-156109): no STABILIZER; BTV, CAT 2 and GLS AUTOLAND in APP & LDG', () => {
    const block = alertBlock('290800039');
    const allPhases = block.split('inopSysAllPhases')[1].split('inopSysApprLdg')[0];
    const apprLdg = block.split('inopSysApprLdg')[1];
    expect(allPhases).not.toContain("'290100007'");
    for (const code of ['320300007', '220300027', '220300010']) {
      expect(apprLdg).toContain(`'${code}'`);
    }
  });
});
