// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { SdPages } from '@shared/EcamSystemPages';
import { describe, expect, it } from 'vitest';
import {
  EngineStartFault,
  EngineStartPhase,
  IGN_A_AND_B_FAULT_LEVEL,
  IGN_FAULT_FLIGHT_PHASE_INHIBITION,
  IGN_A_OR_B_FAULT_LEVEL,
  isIgnitionMemoShown,
  START_ALERTS_FLIGHT_PHASE_INHIBITION,
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
import {
  DeferredProcedureType,
  EcamAbnormalProcedures,
  EcamDeferredProcedures,
} from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { createFws, runFwsCycle, procedureItemNames } from './FwsSpecFixture';

const itemCount = (key: number) => EcamAbnormalProcedures[key].items.length;
const { core, simVars } = createFws();
const sensed = (key: number) => core.abnormalSensed.ewdAbnormalSensed[key];

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
  thrustLeverIdle: true,
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
    expect(shown(startFaultItems(groundAutoStart).show)).toEqual([5, 12]);
    expect(shown(startFaultItems({ ...groundAutoStart, phase: EngineStartPhase.Starting, attempt: 2 }).show)).toEqual([
      5, 12,
    ]);
    expect(shown(startFaultItems({ ...groundAutoStart, phase: EngineStartPhase.Aborted }).show)).toEqual([5, 15]);
  });

  it('has the dry crank lines of a manual start on the ground', () => {
    const manual = {
      ...groundAutoStart,
      fault: EngineStartFault.EgtOverlimit,
      manualStart: true,
      manualStartPbOn: true,
    };
    expect(shown(startFaultItems(manual).show)).toEqual([4, 15, 16, 17, 18, 19]);
    const checked = startFaultItems({ ...manual, masterOn: false, engStartSelector: 0 }).checked;
    expect(checked[15]).toBe(true);
    expect(checked[16]).toBe(true);
  });

  it('asks for air for NO STARTER AIR PRESSURE, with the windmill start lines in flight', () => {
    expect(shown(startFaultItems({ ...groundAutoStart, fault: EngineStartFault.LowStartAirPressure }).show)).toEqual([
      0, 9, 10, 26, 27, 28,
    ]);
    const inFlight = { ...groundAutoStart, fault: EngineStartFault.LowStartAirPressure, onGround: false };
    expect(shown(startFaultItems(inFlight).show)).toEqual([0, 9, 10, 11, 21, 22, 23, 24, 25, 26, 27, 28]);
    const done = startFaultItems({ ...inFlight, masterOn: false, manualStartPbOn: false }).checked;
    expect(done[24]).toBe(true);
    expect(done[25]).toBe(true);
    expect(startFaultItems({ ...inFlight, manualStartPbOn: true }).checked[24]).toBe(false);
  });

  /* IF NOT SUCCESSFUL: ENG MAN START OFF, ENG MASTER OFF comes after the XBLEED / APU BLEED lines on ground, and after
   * the windmill start lines in flight */
  it('closes NO STARTER AIR PRESSURE with IF NOT SUCCESSFUL: ENG MAN START OFF, ENG MASTER OFF', () => {
    const ground = { ...groundAutoStart, fault: EngineStartFault.LowStartAirPressure, manualStartPbOn: true };
    const notDone = startFaultItems(ground).checked;
    expect(notDone[27]).toBe(false);
    expect(notDone[28]).toBe(false);
    const done = startFaultItems({ ...ground, masterOn: false, manualStartPbOn: false }).checked;
    expect(done[27]).toBe(true);
    expect(done[28]).toBe(true);
    // only for NO STARTER AIR PRESSURE
    expect(startFaultItems({ ...groundAutoStart, fault: EngineStartFault.StarterFault }).show.slice(26)).toEqual([
      false,
      false,
      false,
    ]);
    for (let engine = 1; engine <= 4; engine++) {
      const names = procedureItemNames(701800116 + engine);
      expect(names.slice(26)).toEqual(['IF NOT SUCCESSFUL', `ENG ${engine} MAN START`, `ENG ${engine} MASTER`]);
    }
  });

  /* START FAULT: no aural, no MASTER light, no SD page. IGN A(B) FAULT: crew awareness; IGN A+B FAULT: aural and MASTER
   * light */
  it('has the warning levels of the aircraft', () => {
    expect(START_FAULT_LEVEL).toBe(1);
    expect(IGN_A_OR_B_FAULT_LEVEL).toBe(1);
    expect(IGN_A_AND_B_FAULT_LEVEL).toBe(2);
    for (let index = 0; index < 4; index++) {
      const startFault = sensed(701800117 + index);
      expect(startFault.simVarIsActive).toBe(core.engineStartFaultActive[index]);
      expect(startFault.failure).toBe(START_FAULT_LEVEL);
      expect(startFault.sysPage).toBe(SdPages.None);
      const ignA = sensed(701800057 + index);
      expect(ignA.simVarIsActive).toBe(core.engineIgnAFault[index]);
      expect(ignA.flightPhaseInhib).toEqual(IGN_FAULT_FLIGHT_PHASE_INHIBITION);
      expect(ignA.failure).toBe(IGN_A_OR_B_FAULT_LEVEL);
      const ignB = sensed(701800061 + index);
      expect(ignB.simVarIsActive).toBe(core.engineIgnBFault[index]);
      expect(ignB.flightPhaseInhib).toEqual(IGN_FAULT_FLIGHT_PHASE_INHIBITION);
      expect(ignB.failure).toBe(IGN_A_OR_B_FAULT_LEVEL);
      const ignAPlusB = sensed(701800065 + index);
      expect(ignAPlusB.simVarIsActive).toBe(core.engineIgnAPlusBFault[index]);
      expect(ignAPlusB.flightPhaseInhib).toEqual(START_ALERTS_FLIGHT_PHASE_INHIBITION);
      expect(ignAPlusB.failure).toBe(IGN_A_AND_B_FAULT_LEVEL);
      for (const entry of [ignA, ignB, ignAPlusB]) {
        expect(entry.sysPage).toBe(SdPages.None);
      }
    }
  });

  /* LOW N1 (the N1 rotor jam): on the ground THR LEVER n IDLE, CRANK IN PROGRESS, ENG MASTER OFF; a manual start adds the dry
   * crank lines. */
  it('has the LOW N1 procedure of the N1 rotor jam, on the ground', () => {
    const jam = { ...groundAutoStart, fault: EngineStartFault.N1RotorJam, phase: EngineStartPhase.Aborted };
    expect(shown(startFaultItems(jam).show)).toEqual([2, 13, 14, 15]);
    const manual = { ...jam, manualStart: true, manualStartPbOn: true };
    expect(shown(startFaultItems(manual).show)).toEqual([2, 13, 14, 15, 16, 17, 18, 19]);
    expect(shown(startFaultItems({ ...jam, onGround: false }).show)).toEqual([2, 15]);
  });

  it('checks the thrust lever of the affected engine and the master of LOW N1', () => {
    const jam = { ...groundAutoStart, fault: EngineStartFault.N1RotorJam, thrustLeverIdle: false, masterOn: true };
    expect(startFaultItems(jam).checked[13]).toBe(false);
    expect(startFaultItems({ ...jam, thrustLeverIdle: true }).checked[13]).toBe(true);
    expect(startFaultItems({ ...jam, masterOn: false }).checked[15]).toBe(true);
  });

  it('has the LOW N1 lines in the ECAM procedure of each engine, in the order of the procedure', () => {
    for (let engine = 1; engine <= 4; engine++) {
      const names = procedureItemNames(701800116 + engine);
      expect(names[2]).toBe('LOW N1');
      expect(names.slice(12, 16)).toEqual([
        'NEW START IN PROGRESS',
        `THR LEVER ${engine}`,
        'CRANK IN PROGRESS',
        `ENG ${engine} MASTER`,
      ]);
    }
  });

  it('has the other faults', () => {
    expect(shown(startFaultItems({ ...groundAutoStart, fault: EngineStartFault.StarterTimeExceeded }).show)).toEqual([
      7, 15,
    ]);
    expect(shown(startFaultItems({ ...groundAutoStart, fault: EngineStartFault.ThrustLeverNotAtIdle }).show)).toEqual([
      8, 20,
    ]);
    expect(shown(startFaultItems({ ...groundAutoStart, fault: EngineStartFault.StarterFault }).show)).toEqual([1, 15]);
    expect(shown(startFaultItems({ ...groundAutoStart, onGround: false }).show)).toEqual([5, 15]);
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

  it('asks for ENG MASTER OFF on the ground for a start valve stuck closed, a windmill start in flight', () => {
    expect(shown(startValveNotOpenItems({ ...valveOnGround, manualStartPbOn: true }).show)).toEqual([0, 1, 2]);
    expect(shown(startValveNotOpenItems({ ...valveOnGround, onGround: false }).show)).toEqual([0, 3, 4, 5, 6, 8]);
    const manualInFlight = startValveNotOpenItems({ ...valveOnGround, onGround: false, manualStartPbOn: true });
    expect(shown(manualInFlight.show)).toEqual([0, 3, 4, 5, 6, 7, 8]);
    expect(startValveNotOpenItems({ ...valveOnGround, onGround: false, masterOn: false }).checked[8]).toBe(true);
  });

  /* LIMITATIONS AVOID ICING CONDs (engine 1 or 4) on ECAM and PFD; INOP SYS ENG n BLEED, APU BLEED (engine 1), WING
   * A-ICE (engine 1 or 4) */
  it('has the LIMITATIONS and INOP SYS of START VLV FAULT (NOT CLOSED)', () => {
    expect(startValveNotClosedStatus(1)).toEqual({
      limitations: ['300400001'],
      inopSys: ['260300002', '260300006', '300300001'],
    });
    expect(startValveNotClosedStatus(2)).toEqual({ limitations: [], inopSys: ['260300003'] });
    expect(startValveNotClosedStatus(3)).toEqual({ limitations: [], inopSys: ['260300004'] });
    expect(startValveNotClosedStatus(4)).toEqual({ limitations: ['300400001'], inopSys: ['260300005', '300300001'] });
    for (const engineNumber of [1, 2, 3, 4] as const) {
      const entry = sensed(701800120 + engineNumber);
      const status = startValveNotClosedStatus(engineNumber);
      expect(entry.simVarIsActive).toBe(core.engineStartValveNotClosed[engineNumber - 1]);
      expect(entry.limitationsAllPhases?.([])).toEqual(status.limitations);
      expect(entry.limitationsPfd?.([])).toEqual(status.limitations);
      expect(entry.inopSysAllPhases?.([])).toEqual(status.inopSys);
    }
  });

  it('has the deferred procedure FOR APPROACH of an outer start valve not closed', () => {
    const deferred = EcamDeferredProcedures[700700001];
    expect(deferred.fromAbnormalProcs).toEqual(['701800121', '701800124']);
    expect(deferred.type).toBe(DeferredProcedureType.FOR_APPROACH);
    expect(deferred.items).toContainEqual({ name: 'IF SEVERE ICE ACCRETION', sensed: false, condition: true });
    expect(deferred.items).toContainEqual({ name: 'FOR LDG : FLAP LVR 3', sensed: false, level: 1 });
  });
});

/* The IGNITION memo: automatic continuous ignition in progress, or manual continuous ignition selected */
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
    const memo = core.memos.ewdMemos['709000001'];
    expect(memo.simVarIsActive).toBe(core.ignitionMemo);
    // the selector alone does not decide: the FWS evaluates it with the FADEC igniters of the four engines
    simVars.set('L:XMLVAR_ENG_MODE_SEL', 1);
    simVars.set('L:A32NX_FADEC_IGNITER_A_ACTIVE_ENG3', 1);
    runFwsCycle(core);
    expect(core.ignitionMemo.get()).toBe(false);
    simVars.set('L:A32NX_FADEC_IGNITER_B_ACTIVE_ENG3', 1);
    runFwsCycle(core);
    expect(core.ignitionMemo.get()).toBe(true);
    simVars.set('L:A32NX_FADEC_IGNITER_A_ACTIVE_ENG3', 0);
    simVars.set('L:A32NX_FADEC_IGNITER_B_ACTIVE_ENG3', 0);
    simVars.set('L:XMLVAR_ENG_MODE_SEL', 2);
    runFwsCycle(core);
    expect(core.ignitionMemo.get()).toBe(true);
  });
});
