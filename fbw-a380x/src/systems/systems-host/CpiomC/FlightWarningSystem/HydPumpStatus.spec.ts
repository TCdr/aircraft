// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  EcamAbnormalProcedures,
  EcamDeferredProcedures,
  EcamInopSys,
} from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { DeferredProcedureType } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/EcamProcedureTypes';
import { ElecPumpRedundancyLoss, enginePumpPressLoStatus } from './HydPumpStatus';
import { createFws, runFwsCycle, procedureItemNames } from './FwsSpecFixture';

const { core, simVars } = createFws(new Set());
const alert = (id: string) => core.abnormalSensed.ewdAbnormalSensed[id];
const deferred = (id: string) => core.abnormalSensed.ewdDeferredProcs[id];
const inopSysLine = (id: string) => core.inopSys.inopSys[id];

describe('HYD G(Y) ENG PMP PRESS LO STATUS', () => {
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
      const redundCode = String(290300027 + pump);
      expect(inopSysLine(String(290300005 + pump)).simVarIsActive).toBe(core.enginePumpInopSys[pump]);
      expect(inopSysLine(redundCode).simVarIsActive).toBe(core.enginePumpRedundLoss[pump]);
      expect(inopSysLine(redundCode).redundancyLoss).toBe(true);
      expect(EcamInopSys[redundCode]).toBeDefined();
    }
  });
});

describe('HYD deferred procedures', () => {
  it.each([
    ['290700001', '290800019'],
    ['290700002', '290800020'],
    ['290700003', '290800031'],
    ['290700004', '290800032'],
  ])('%s comes from %s FOR APPROACH and is sensed', (id, fromAlert) => {
    expect(EcamDeferredProcedures[id].fromAbnormalProcs).toEqual([fromAlert]);
    expect(EcamDeferredProcedures[id].type).toBe(DeferredProcedureType.FOR_APPROACH);
    expect(deferred(id).whichItemsChecked()).toHaveLength(EcamDeferredProcedures[id].items.length);
  });

  it('SYS OVHT: not shown with the engine pumps disconnected', () => {
    expect(deferred('290700003').simVarIsActive.get()).toBe(true);
    simVars.set('L:A32NX_HYD_ENG_2AB_PUMP_DISC', true);
    runFwsCycle(core);
    expect(deferred('290700003').simVarIsActive.get()).toBe(false);
    expect(deferred('290700004').simVarIsActive.get()).toBe(true);
    simVars.set('L:A32NX_HYD_ENG_4AB_PUMP_DISC', true);
    runFwsCycle(core);
    expect(deferred('290700004').simVarIsActive.get()).toBe(false);
    simVars.set('L:A32NX_HYD_ENG_2AB_PUMP_DISC', false);
    simVars.set('L:A32NX_HYD_ENG_4AB_PUMP_DISC', false);
    runFwsCycle(core);
  });
});

describe('HYD G+Y SYS PRESS LO', () => {
  it('LDG PERF AFFECTED, not LDG DIST AFFECTED', () => {
    expect(procedureItemNames('290800039')).toContain('LDG PERF AFFECTED');
    expect(procedureItemNames('290800039')).not.toContain('LDG DIST AFFECTED');
  });

  it('STATUS INOP SYS: no STABILIZER; BTV, CAT 2 and GLS AUTOLAND in APP & LDG', () => {
    const entry = alert('290800039');
    expect(entry.inopSysAllPhases!([])).not.toContain('290100007');
    expect(entry.inopSysApprLdg!([])).toEqual(expect.arrayContaining(['320300007', '220300027', '220300010']));
  });
});

describe('HYD G(Y) ELEC PMP A(B) FAULT STATUS', () => {
  it('"MORE INFO REDUND LOSS: G (Y) ELEC PMP A or B", kept after the pump is set OFF', () => {
    const redundLoss = new ElecPumpRedundancyLoss();
    expect(redundLoss.update(false, true, false)).toBe(false);
    expect(redundLoss.update(true, true, false)).toBe(true);
    // ELEC PMP ... OFF: the low pressure of a pump that should not pressurise is gone, the pump is still failed
    expect(redundLoss.update(false, false, false)).toBe(true);
    // back to AUTO without a fault: the pump works
    expect(redundLoss.update(false, true, false)).toBe(false);
  });

  it('the G (Y) HYD SYS line replaces it when the whole system is lost', () => {
    const redundLoss = new ElecPumpRedundancyLoss();
    expect(redundLoss.update(true, true, true)).toBe(false);
  });

  it.each([
    ['290800001', '290300001', 0],
    ['290800002', '290300002', 1],
    ['290800003', '290300003', 2],
    ['290800004', '290300004', 3],
  ])('%s: no INOP SYS, REDUND LOSS %s from FwsInopSys', (id, redundCode, pump) => {
    expect(alert(id).inopSysAllPhases).toBeUndefined();
    expect(inopSysLine(redundCode).simVarIsActive).toBe(core.elecPumpRedundLoss[pump]);
    expect(inopSysLine(redundCode).redundancyLoss).toBe(true);
  });
});

describe('HYD G(Y) SYS TEMP EXCESS HI', () => {
  it.each([
    ['290800037', 'G', 1, 2],
    ['290800038', 'Y', 3, 4],
  ])('%s: %s SYS TEMP EXCESS HI with the lines', (id, system, engA, engB) => {
    const procedure = EcamAbnormalProcedures[id];
    expect(procedure.title).toBe(`\x1b<4m\x1b4mHYD\x1bm ${system} SYS TEMP EXCESS HI`);
    expect(procedure.items.map((item) => item.name)).toEqual([
      `${system} ENG ${engA} PMP A AND B`,
      `${system} ENG ${engB} PMP A AND B`,
      `${system} ENG ${engA} PMP A+B`,
      `${system} ENG ${engB} PMP A+B`,
      `${system} ELEC PMP A AND B`,
    ]);
  });
});
