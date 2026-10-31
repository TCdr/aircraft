// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { EcamAbnormalProcedures } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { ALL_ENG_FLAME_OUT_INHIBITED_PHASES } from './EngineFailAlerts';
import { createFws, procedureItemNames } from './FwsSpecFixture';

/* Item rules of FwsAbnormalSensed, checked on the alert tables of the real FwsCore */
const { core } = createFws();
const alert = (id: string) => core.abnormalSensed.ewdAbnormalSensed[Number(id)];
describe('FwsAbnormalSensed item rules', () => {
  it('ALTN LAW: MAX SPEED 310 KT is not shown in ALT 1A (as FwsLimitations.ts)', () => {
    core.altn1ALawCondition.set(true);
    expect(alert('271800008').whichItemsToShow()).toEqual([false]);
    core.altn1ALawCondition.set(false);
    expect(alert('271800008').whichItemsToShow()).toEqual([true]);
  });

  it.each([
    ['290800021', 'G RSVR LEVEL LO'],
    ['290800031', 'G SYS OVHT'],
  ])('%s %s: the G ELEC PMP A and B OFF item checks the green pumps', (id) => {
    const greenPumpsOffItem = 4;
    for (const [greenA, greenB, yellowA, yellowB, expected] of [
      [false, false, true, true, true],
      [true, false, false, false, false],
      [false, true, false, false, false],
    ] as [boolean, boolean, boolean, boolean, boolean][]) {
      core.greenAPumpAuto.set(greenA);
      core.greenBPumpAuto.set(greenB);
      core.yellowAPumpAuto.set(yellowA);
      core.yellowBPumpAuto.set(yellowB);
      expect(alert(id).whichItemsChecked()[greenPumpsOffItem]).toBe(expected);
    }
  });

  /* HYD G (Y) SYS OVHT: the pumps are disconnected only when turning off G (Y) ENG 1 (3) PMP A or B failed */
  it.each([
    ['290800031', 'G SYS OVHT', core.eng1PumpsOffUnsuccessful, core.eng2PumpsOffUnsuccessful],
    ['290800032', 'Y SYS OVHT', core.eng3PumpsOffUnsuccessful, core.eng4PumpsOffUnsuccessful],
  ])('%s %s: the ENG PMP A+B DISC items show only when turning the pumps off failed', (id, _name, first, second) => {
    first.set(false);
    second.set(false);
    expect(alert(id).whichItemsToShow().slice(2, 4)).toEqual([false, false]);
    first.set(true);
    expect(alert(id).whichItemsToShow().slice(2, 4)).toEqual([true, false]);
    second.set(true);
    expect(alert(id).whichItemsToShow().slice(2, 4)).toEqual([true, true]);
  });

  it('Y SYS PRESS LO INFO: TAXI WITH CARE, AVOID MAX TILLER ANGLE, NO BRAKED PIVOT TURN, CAT 3 SINGLE ONLY', () => {
    expect(alert('290800036').info?.([])).toEqual(['800200003', '800200004', '800200005', '220200016']);
  });

  it.each(['290800035', '290800036'])('%s SYS PRESS LO: INOP SYS APPR & LDG has BTV and CAT 3 DUAL', (id) => {
    const apprLdg = alert(id).inopSysApprLdg?.([]);
    expect(apprLdg).toContain('320300007');
    expect(apprLdg).toContain('220300028');
  });

  it.each([
    ['290800035', core.prim3Healthy, [4, 5]],
    ['290800036', core.prim2Healthy, [3, 4]],
  ] as [string, typeof core.prim3Healthy, number[]][])(
    '%s SYS PRESS LO: the PRIM-failed items read the PRIM state, not the Subject itself',
    (id, prim, lines) => {
      const primFailedLines = () => lines.map((line) => alert(id).whichItemsToShow()[line]);
      prim.set(true);
      expect(primFailedLines()).toEqual([false, false]);
      prim.set(false);
      expect(primFailedLines()).toEqual([true, true]);
    },
  );

  /* HYD G (Y) SYS PRESS LO: L/G GRVTY EXTN ONLY for both, and a 220 kt max speed for the gravity extension */
  it('Y SYS PRESS LO: L/G GRVTY EXTN ONLY item and the MAX SPEED 220 KT limitation on the ECAM and the PFD', () => {
    const entry = alert('290800036');
    expect(entry.whichItemsToShow()[2]).toBe(true);
    expect(entry.whichItemsChecked()).toEqual([false, false, false, false, false, false]);
    expect(entry.limitationsPfd?.([])).toEqual(['320400001']);
    expect(entry.limitationsApprLdg?.([])).toEqual(['320400001']);
    expect(procedureItemNames('290800036')).toHaveLength(6);
    expect(procedureItemNames('290800036')).toContain('L/G GRVTY EXTN ONLY');
  });

  it('EXCESS DIFF PRESS is active in flight phases 1, 8 and 9', () => {
    expect(alert('213800002').flightPhaseInhib).toEqual([2, 3, 4, 5, 6, 7, 10, 11, 12]);
  });
});

describe('ENG ALL ENG FLAME OUT', () => {
  it('"This alert inhibits the ELEC EMER CONFIG alert.", only while it is shown', () => {
    // not with notActiveWhenItemActive: that reads the alert condition without its flight phase inhibition
    expect(alert('240800055').simVarIsActive).toBe(core.elecEmerConfigAlert);
    expect(alert('240800055').notActiveWhenItemActive).toEqual([]);
    expect(alert('701800151').flightPhaseInhib).toEqual(ALL_ENG_FLAME_OUT_INHIBITED_PHASES);
  });

  it('has one checked entry per line', () => {
    expect(alert('701800151').whichItemsChecked().length).toBe(procedureItemNames('701800151').length);
  });

  it('RAT MAN ON ... PRESS is sensed with the RAT out, as in ELEC EMER CONFIG', () => {
    expect(EcamAbnormalProcedures[701800151].items[0]).toEqual({
      name: 'RAT MAN ON',
      sensed: true,
      labelNotCompleted: 'PRESS',
    });
    core.ratDeployed.set(1);
    expect(alert('701800151').whichItemsChecked()[0]).toBe(true);
    core.ratDeployed.set(0);
    expect(alert('701800151').whichItemsChecked()[0]).toBe(false);
  });

  it('both FORCED LDG parts have L/G GRVTY (EXTN 2 MIN) ... DOWN after FOR L/G GRVTY', () => {
    const names = procedureItemNames('701800151');
    const gravityLines = names.reduce<number[]>(
      (lines, name, index) => (name === 'L/G GRVTY (EXTN 2 MIN)' ? lines.concat(index) : lines),
      [],
    );
    expect(gravityLines.length).toBe(2);
    for (const index of gravityLines) {
      expect(names[index - 1]).toBe('FOR L/G GRVTY : MAX SPEED 220 KT');
      expect(alert('701800151').whichItemsChecked()[index]).toBe(false);
    }
  });
});

describe('ENG RELIGHT IN FLIGHT', () => {
  it('single engine: 30000 FT and 260 KT; multiple engines: 28000 FT and 250 KT', () => {
    const names = procedureItemNames('700900001');
    const multiple = names.indexOf('FOR RELIGHT (MULTIPLE ENGINES)');
    expect(multiple).toBeGreaterThan(0);
    const single = names.slice(0, multiple);
    expect(single).toContain('MAX GUARANTEED ALTITUDE : 30000 FT');
    expect(single).toContain('MIN SPEED FOR WINDML RELIGHT : 260 KT');
    expect(names.slice(multiple)).toContain('MAX GUARANTEED ALTITUDE : 28000 FT');
    expect(names.slice(multiple)).toContain('MIN SPEED FOR WINDML RELIGHT : 250 KT');
    expect(names.some((name) => name.includes('MAX SPEED FOR WINDML RELIGHT'))).toBe(false);
  });
});

describe('ENG 1(2)(3)(4) SHUT DOWN', () => {
  it.each([
    ['701800109', 1, false],
    ['701800110', 2, true],
    ['701800111', 3, true],
    ['701800112', 4, false],
  ])('%s ENG %i: the lines, ABNORM BLEED CONFIG PROC APPLY, no FOR GA: TOGA ONLY', (id, engine, inner) => {
    expect(procedureItemNames(id)).toEqual([
      'TCAS MODE',
      'L/G LEVER',
      'NO FUEL LEAK',
      `CROSSFEED ${engine}`,
      'ABNORM BLEED CONFIG PROC',
      'MAX THR RQRD',
      'AIR FLOW',
      'FWD CARGO TEMP REGUL',
      ...(inner ? ['LDG DIST IMPACT ON WET/CONTAM RWY ONLY'] : []),
    ]);
  });

  it.each(['701800109', '701800110', '701800111', '701800112'])(
    '%s: one shown and one checked entry per line, the ABNORM BLEED CONFIG line with the AIR ABNORM BLEED CONFIG alert',
    (id) => {
      const count = procedureItemNames(id).length;
      expect(alert(id).whichItemsToShow().length).toBe(count);
      expect(alert(id).whichItemsChecked().length).toBe(count);
      // ABNORM BLEED CONFIG procedure APPLY: only with an abnormal bleed configuration
      core.abnormBleedConfig.set(false);
      expect(alert(id).whichItemsToShow()[4]).toBe(false);
      core.abnormBleedConfig.set(true);
      expect(alert(id).whichItemsToShow()[4]).toBe(true);
      // the AIR FLOW LO and FWD CARGO TEMP REGUL OFF lines keep their sensed checks
      core.flowSelectorKnob.set(1);
      core.fwdCargoTempRegulatorOff.set(false);
      expect(alert(id).whichItemsChecked().slice(6, 8)).toEqual([true, false]);
      core.flowSelectorKnob.set(0);
      core.fwdCargoTempRegulatorOff.set(true);
      expect(alert(id).whichItemsChecked().slice(6, 8)).toEqual([false, true]);
    },
  );
});
