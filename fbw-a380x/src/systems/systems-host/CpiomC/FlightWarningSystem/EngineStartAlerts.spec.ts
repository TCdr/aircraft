// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  EngineStartFault,
  EngineStartPhase,
  IGN_A_AND_B_FAULT_LEVEL,
  IGN_A_OR_B_FAULT_LEVEL,
  isIgnitionMemoShown,
  START_FAULT_ITEM_COUNT,
  START_FAULT_LEVEL,
  START_VALVE_NOT_CLOSED_ITEM_COUNT,
  START_VALVE_NOT_OPEN_ITEM_COUNT,
  StartFaultInputs,
  startFaultItems,
  StartValveFaultInputs,
  startValveNotClosedItems,
  startValveNotClosedStatus,
  startValveNotOpenItems,
} from './EngineStartAlerts';

/*
 * The ECAM items of the procedures, read from the source text of ata70.ts (importing the EcamMessages tables in a test fails on
 * a circular import, see FwsAbnormalSensedItems.spec.ts).
 */
const ata70 = readFileSync(
  resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata70.ts'),
  'utf-8',
);
function itemCount(key: number): number {
  const start = ata70.indexOf(`  ${key}: {`);
  expect(start).toBeGreaterThan(0);
  const block = ata70.slice(start, ata70.indexOf('\n  },', start));
  return block.split('{ name:').length - 1;
}

const shown = (show: boolean[]) => show.flatMap((value, index) => (value ? [index] : []));

const groundAutoStart: StartFaultInputs = {
  fault: EngineStartFault.NoLightUp,
  phase: EngineStartPhase.AutomaticCrank,
  attempt: 1,
  manualStart: false,
  onGround: true,
  masterOn: true,
  manualStartPbOn: false,
  engStartSelector: 2,
  apuBleedPbOn: true,
  allThrustLeversIdle: true,
};

describe('A380X ENG START FAULT', () => {
  it('has as many items as its ECAM procedures', () => {
    for (let key = 701800117; key <= 701800120; key++) {
      expect(itemCount(key)).toBe(START_FAULT_ITEM_COUNT);
    }
    for (let key = 701800121; key <= 701800124; key++) {
      expect(itemCount(key)).toBe(START_VALVE_NOT_CLOSED_ITEM_COUNT);
    }
    for (let key = 701800125; key <= 701800128; key++) {
      expect(itemCount(key)).toBe(START_VALVE_NOT_OPEN_ITEM_COUNT);
    }
  });

  it('shows NEW START IN PROGRESS during the automatic retries, then ENG MASTER OFF', () => {
    expect(shown(startFaultItems(groundAutoStart).show)).toEqual([4, 11]);
    expect(shown(startFaultItems({ ...groundAutoStart, phase: EngineStartPhase.Starting, attempt: 2 }).show)).toEqual([
      4, 11,
    ]);
    expect(shown(startFaultItems({ ...groundAutoStart, phase: EngineStartPhase.Aborted }).show)).toEqual([4, 12]);
  });

  it('has the dry crank lines of a manual start on the ground', () => {
    const manual = {
      ...groundAutoStart,
      fault: EngineStartFault.EgtOverlimit,
      manualStart: true,
      manualStartPbOn: true,
    };
    expect(shown(startFaultItems(manual).show)).toEqual([3, 12, 13, 14, 15, 16]);
    const checked = startFaultItems({ ...manual, masterOn: false, engStartSelector: 0 }).checked;
    expect(checked[12]).toBe(true);
    expect(checked[13]).toBe(true);
  });

  /* l.172917-172928: XBLEED OPEN, APU BLEED ON; in flight MIN SPEED FOR WINDML RELIGHT : 260 KT, WINDMILL START
   * INITIATED, ENG PARAMETERS MONITOR, IF ABNORMAL: ENG MAN START OFF, ENG MASTER OFF */
  it('asks for air for NO STARTER AIR PRESSURE, with the windmill start lines in flight', () => {
    expect(shown(startFaultItems({ ...groundAutoStart, fault: EngineStartFault.LowStartAirPressure }).show)).toEqual([
      0, 8, 9,
    ]);
    const inFlight = { ...groundAutoStart, fault: EngineStartFault.LowStartAirPressure, onGround: false };
    expect(shown(startFaultItems(inFlight).show)).toEqual([0, 8, 9, 10, 18, 19, 20, 21, 22]);
    const done = startFaultItems({ ...inFlight, masterOn: false, manualStartPbOn: false }).checked;
    expect(done[21]).toBe(true);
    expect(done[22]).toBe(true);
    expect(startFaultItems({ ...inFlight, manualStartPbOn: true }).checked[21]).toBe(false);
  });

  /* FCOM PDF p.5810 (l.172889): no aural, no MASTER light, no SD page. IGN A(B) FAULT p.5791: crew awareness; IGN A+B
   * FAULT l.172275: Audio + Master Light */
  it('has the warning levels of the FCOM figures', () => {
    expect(START_FAULT_LEVEL).toBe(1);
    expect(IGN_A_OR_B_FAULT_LEVEL).toBe(1);
    expect(IGN_A_AND_B_FAULT_LEVEL).toBe(2);
    const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
    const startAlerts = abnormalSensed.slice(
      abnormalSensed.indexOf('private engineStartAlerts()'),
      abnormalSensed.indexOf('public ewdAbnormalSensed'),
    );
    const startFault = startAlerts.slice(startAlerts.indexOf('alerts[701800117 + index]'));
    expect(startFault.slice(0, startFault.indexOf('};'))).toContain('failure: START_FAULT_LEVEL,');
    expect(startFault.slice(0, startFault.indexOf('};'))).toContain('sysPage: SdPages.None,');
    expect(startAlerts).toMatch(
      /engineIgnAFault\[index\],\s+IGN_FAULT_FLIGHT_PHASE_INHIBITION,\s+IGN_A_OR_B_FAULT_LEVEL/,
    );
    expect(startAlerts).toMatch(
      /engineIgnBFault\[index\],\s+IGN_FAULT_FLIGHT_PHASE_INHIBITION,\s+IGN_A_OR_B_FAULT_LEVEL/,
    );
    expect(startAlerts).toMatch(
      /engineIgnAPlusBFault\[index\],\s+START_ALERTS_FLIGHT_PHASE_INHIBITION,\s+IGN_A_AND_B_FAULT_LEVEL/,
    );
    expect(startAlerts).toContain('failure: level,');
  });

  it('has the other faults', () => {
    expect(shown(startFaultItems({ ...groundAutoStart, fault: EngineStartFault.StarterTimeExceeded }).show)).toEqual([
      6, 12,
    ]);
    expect(shown(startFaultItems({ ...groundAutoStart, fault: EngineStartFault.ThrustLeverNotAtIdle }).show)).toEqual([
      7, 17,
    ]);
    expect(shown(startFaultItems({ ...groundAutoStart, fault: EngineStartFault.StarterFault }).show)).toEqual([1, 12]);
    expect(shown(startFaultItems({ ...groundAutoStart, onGround: false }).show)).toEqual([4, 12]);
  });
});

const valveOnGround: StartValveFaultInputs = {
  engineNumber: 1,
  onGround: true,
  masterOn: true,
  manualStartPbOn: false,
  apuBleedPbOn: true,
};

describe('A380X ENG START VLV FAULT', () => {
  it('removes the bleed sources of a start valve not closed', () => {
    expect(shown(startValveNotClosedItems(valveOnGround).show)).toEqual([1, 2, 4, 5, 6]);
    expect(shown(startValveNotClosedItems({ ...valveOnGround, engineNumber: 2, onGround: false }).show)).toEqual([
      0, 2,
    ]);
  });

  /* l.173248-173257: in flight ... ENG PARAMETERS MONITOR WITH CARE, IF ABNORMAL: During manual start: MAN START OFF;
   * MASTER OFF */
  it('asks for ENG MASTER OFF on the ground for a start valve stuck closed, a windmill start in flight', () => {
    expect(shown(startValveNotOpenItems({ ...valveOnGround, manualStartPbOn: true }).show)).toEqual([0, 1, 2]);
    expect(shown(startValveNotOpenItems({ ...valveOnGround, onGround: false }).show)).toEqual([0, 3, 4, 5, 6, 8]);
    const manualInFlight = startValveNotOpenItems({ ...valveOnGround, onGround: false, manualStartPbOn: true });
    expect(shown(manualInFlight.show)).toEqual([0, 3, 4, 5, 6, 7, 8]);
    expect(startValveNotOpenItems({ ...valveOnGround, onGround: false, masterOn: false }).checked[8]).toBe(true);
  });

  /* l.173136-173158: LIMITATIONS AVOID ICING CONDs (engine 1 or 4) on ECAM and PFD; INOP SYS ENG n BLEED, APU BLEED
   * (engine 1), WING A-ICE (engine 1 or 4) */
  it('has the LIMITATIONS and INOP SYS of START VLV FAULT (NOT CLOSED)', () => {
    expect(startValveNotClosedStatus(1)).toEqual({
      limitations: ['300400001'],
      inopSys: ['260300002', '260300006', '300300001'],
    });
    expect(startValveNotClosedStatus(2)).toEqual({ limitations: [], inopSys: ['260300003'] });
    expect(startValveNotClosedStatus(3)).toEqual({ limitations: [], inopSys: ['260300004'] });
    expect(startValveNotClosedStatus(4)).toEqual({ limitations: ['300400001'], inopSys: ['260300005', '300300001'] });
    const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
    const notClosed = abnormalSensed.slice(abnormalSensed.indexOf('alerts[701800121 + index]'));
    const entry = notClosed.slice(0, notClosed.indexOf('};'));
    expect(entry).toContain('limitationsAllPhases: () => valveNotClosedStatus.limitations,');
    expect(entry).toContain('limitationsPfd: () => valveNotClosedStatus.limitations,');
    expect(entry).toContain('inopSysAllPhases: () => valveNotClosedStatus.inopSys,');
  });

  it('has the deferred procedure FOR APPROACH of an outer start valve not closed (l.173149-173153)', () => {
    const deferred = ata70.slice(ata70.indexOf('  700700001: {'), ata70.indexOf('  700700002: {'));
    expect(deferred).toContain("fromAbnormalProcs: ['701800121', '701800124'],");
    expect(deferred).toContain('type: DeferredProcedureType.FOR_APPROACH,');
    expect(deferred).toContain("{ name: 'IF SEVERE ICE ACCRETION', sensed: false, condition: true },");
    expect(deferred).toContain("{ name: 'FOR LDG : FLAP LVR 3', sensed: false, level: 1 },");
  });
});

/* FCOM DSC-70-90 MEMO l.113497-113498: "Automatic continuous ignition is in progress, or manual continuous ignition is
 * selected." */
describe('A380X IGNITION memo', () => {
  it('shows with the ENG START selector at IGN START', () => {
    expect(isIgnitionMemoShown(2, [false, false, false, false])).toBe(true);
    expect(isIgnitionMemoShown(1, [false, false, false, false])).toBe(false);
    expect(isIgnitionMemoShown(0, [false, false, false, false])).toBe(false);
  });

  it('shows while the FADEC energizes both igniters of an engine at NORM (auto relight, quick relight)', () => {
    expect(isIgnitionMemoShown(1, [false, false, true, false])).toBe(true);
  });

  it('FwsMemos shows the memo from the FwsCore ignition state, not from the selector alone', () => {
    const memos = readFileSync(resolve(__dirname, 'FwsMemos.ts'), 'utf-8');
    const ignition = memos.slice(memos.indexOf("'709000001': {"));
    expect(ignition.slice(0, ignition.indexOf('},'))).toContain('simVarIsActive: this.fws.ignitionMemo,');
    const core = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');
    expect(core).toContain(
      'this.ignitionMemo.set(isIgnitionMemoShown(this.engSelectorPosition.get(), bothIgnitersActive));',
    );
  });
});
