// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/*
 * Item rules of FwsAbnormalSensed, read from the source text (as FwsCdsDuFault.spec.ts does: importing the EcamMessages
 * tables in a test fails on a circular import).
 */
const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');

/** The source of one alert entry, from its id to the end of its object */
function alertBlock(id: string): string {
  const start = abnormalSensed.indexOf(`    ${id}: {`);
  expect(start).toBeGreaterThan(0);
  return abnormalSensed.slice(start, abnormalSensed.indexOf('\n    },', start));
}

describe('FwsAbnormalSensed item rules', () => {
  it('ALTN LAW: MAX SPEED 310 KT is not shown in ALT 1A (A380 FCOM, as FwsLimitations.ts)', () => {
    expect(alertBlock('271800008')).toMatch(/whichItemsToShow: \(\) => \[!this\.fws\.altn1ALawCondition\.get\(\)\]/);
  });

  it.each([
    ['290800021', 'G RSVR LEVEL LO'],
    ['290800031', 'G SYS OVHT'],
  ])('%s %s: the G ELEC PMP A and B OFF item checks the green pumps', (id) => {
    const checked = alertBlock(id).split('whichItemsChecked')[1];
    expect(checked).toContain('!this.fws.greenAPumpAuto.get() && !this.fws.greenBPumpAuto.get()');
    expect(checked).not.toContain('yellowAPumpAuto');
  });

  /* A380 FCOM PRO-ABN HYD G (Y) SYS OVHT: "If turning off G (Y) ENG 1 (3) PMP A or B is not successful: ... DISC". */
  it.each([
    ['290800031', 'G SYS OVHT', 1, 2],
    ['290800032', 'Y SYS OVHT', 3, 4],
  ])('%s %s: the ENG PMP A+B DISC items show only when turning the pumps off failed', (id, _name, a, b) => {
    const shown = alertBlock(id).split('whichItemsToShow')[1].split('whichItemsChecked')[0];
    expect(shown).toContain(`this.fws.eng${a}PumpsOffUnsuccessful.get()`);
    expect(shown).toContain(`this.fws.eng${b}PumpsOffUnsuccessful.get()`);
    expect(shown).not.toMatch(/^\s+true,\s*$/m);
  });

  /* A380 FCOM PRO-ABN HYD G (Y) SYS PRESS LO STATUS. */
  it('Y SYS PRESS LO INFO: TAXI WITH CARE, AVOID MAX TILLER ANGLE, NO BRAKED PIVOT TURN, CAT 3 SINGLE ONLY', () => {
    expect(alertBlock('290800036')).toContain("info: () => ['800200003', '800200004', '800200005', '220200016']");
  });

  it.each(['290800035', '290800036'])('%s SYS PRESS LO: INOP SYS APPR & LDG has BTV and CAT 3 DUAL', (id) => {
    const apprLdg = alertBlock(id).split('inopSysApprLdg')[1];
    expect(apprLdg).toContain("'320300007'");
    expect(apprLdg).toContain("'220300028'");
  });

  it.each([
    ['290800035', 'prim3Healthy'],
    ['290800036', 'prim2Healthy'],
  ])('%s SYS PRESS LO: the PRIM-failed items read the PRIM state (%s), not the Subject itself', (id, prim) => {
    const shown = alertBlock(id).split('whichItemsToShow')[1].split('whichItemsChecked')[0];
    expect(shown).toContain(`!this.fws.${prim}.get()`);
    expect(shown).not.toContain(`!this.fws.${prim},`);
  });

  /* A380 FCOM PRO-ABN HYD G (Y) SYS PRESS LO: L/G GRVTY EXTN ONLY for both; "For gravity extension: MAX SPEED : 220 KT". */
  it('Y SYS PRESS LO: L/G GRVTY EXTN ONLY item and the MAX SPEED 220 KT limitation on the ECAM and the PFD', () => {
    const block = alertBlock('290800036');
    const shown = block.split('whichItemsToShow')[1].split('whichItemsChecked')[0];
    const checked = block.split('whichItemsChecked')[1].split('failure')[0];
    expect(shown).toContain('true, // L/G GRVTY EXTN ONLY');
    expect(checked.match(/false/g)).toHaveLength(6);
    expect(block).toContain("limitationsPfd: () => ['320400001']");
    expect(block).toContain("limitationsApprLdg: () => ['320400001']");
    const items = readFileSync(
      resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata29-30.ts'),
      'utf-8',
    );
    const yItems = items.slice(items.indexOf('  290800036: {'), items.indexOf('  290800037: {'));
    expect(yItems.match(/^ {6}\{/gm)).toHaveLength(6);
    expect(yItems).toContain("name: 'L/G GRVTY EXTN ONLY'");
  });

  /* A380 FCOM PRO-ABN CAB PRESS EXCESS DIFF PRESS: flight phase inhibition 2-7 and 10-12 (PDF p.4755). */
  it('EXCESS DIFF PRESS is active in flight phases 1, 8 and 9', () => {
    expect(alertBlock('213800002')).toContain('flightPhaseInhib: [2, 3, 4, 5, 6, 7, 10, 11, 12],');
  });
});

describe('ENG ALL ENG FLAME OUT (A380 FCOM PRO-ABN-ECAM-10-70, l.173768-174788)', () => {
  const ata70 = readFileSync(
    resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata70.ts'),
    'utf-8',
  );
  /** One procedure of ata70.ts, from its id to the end of its object */
  const procedure = (id: string) => {
    const start = ata70.indexOf(`  ${id}: {`);
    expect(start).toBeGreaterThan(0);
    return ata70.slice(start, ata70.indexOf('\n  },', start));
  };
  const itemNames = (id: string) => [...procedure(id).matchAll(/name: '([^']*)'/g)].map((match) => match[1]);
  const checkedEntries = (id: string) => {
    const checked = alertBlock(id).split('whichItemsChecked: () => [')[1];
    return checked
      .slice(0, checked.indexOf('\n      ],'))
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  };

  it('"This alert inhibits the ELEC EMER CONFIG alert." (l.173795), only while it is shown', () => {
    // not with notActiveWhenItemActive: that reads the alert condition without its flight phase inhibition
    expect(alertBlock('240800055')).toContain('simVarIsActive: this.fws.elecEmerConfigAlert,');
    expect(alertBlock('240800055')).toContain('notActiveWhenItemActive: [],');
    expect(alertBlock('701800151')).toContain('flightPhaseInhib: ALL_ENG_FLAME_OUT_INHIBITED_PHASES,');
  });

  it('has one checked entry per line', () => {
    expect(checkedEntries('701800151').length).toBe(itemNames('701800151').length);
  });

  it('RAT MAN ON ... PRESS (l.173832) is sensed with the RAT out, as in ELEC EMER CONFIG', () => {
    expect(procedure('701800151')).toContain("{ name: 'RAT MAN ON', sensed: true, labelNotCompleted: 'PRESS' }");
    expect(itemNames('701800151')[0]).toBe('RAT MAN ON');
    expect(checkedEntries('701800151')[0]).toContain('this.fws.ratDeployed.get() > 0');
  });

  it('both FORCED LDG parts have L/G GRVTY (EXTN 2 MIN) ... DOWN after FOR L/G GRVTY (l.173963, 174162)', () => {
    const names = itemNames('701800151');
    const gravityLines = names.flatMap((name, index) => (name === 'L/G GRVTY (EXTN 2 MIN)' ? [index] : []));
    expect(gravityLines.length).toBe(2);
    for (const index of gravityLines) {
      expect(names[index - 1]).toBe('FOR L/G GRVTY : MAX SPEED 220 KT');
      expect(checkedEntries('701800151')[index]).toMatch(/^false,/);
    }
  });
});

describe('ENG RELIGHT IN FLIGHT (A380 FCOM l.174864-175027)', () => {
  const ata70 = readFileSync(
    resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata70.ts'),
    'utf-8',
  );

  it('single engine: 30000 FT and 260 KT (l.174902-174904); multiple engines: 28000 FT and 250 KT (l.174977-174979)', () => {
    const start = ata70.indexOf('  700900001: {');
    const procedure = ata70.slice(start, ata70.indexOf('\n  },', start));
    const multiple = procedure.indexOf('FOR RELIGHT (MULTIPLE ENGINES)');
    const single = procedure.slice(0, multiple);
    expect(single).toContain("'MAX GUARANTEED ALTITUDE : 30000 FT'");
    expect(single).toContain("'MIN SPEED FOR WINDML RELIGHT : 260 KT'");
    expect(procedure.slice(multiple)).toContain("'MAX GUARANTEED ALTITUDE : 28000 FT'");
    expect(procedure.slice(multiple)).toContain("'MIN SPEED FOR WINDML RELIGHT : 250 KT'");
    expect(procedure).not.toContain('MAX SPEED FOR WINDML RELIGHT');
  });
});
