// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeAll, describe, expect, it } from 'vitest';
import { EcamAbnormalProcedures, EcamInopSys } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import {
  ENG_LP_VALVE_FAULT_INOP_SYS,
  engLpValveFaultLines,
  FUEL_LEAK_DET_FAULT_INOP_SYS,
  FUEL_LEAK_LP_VALVE_PHASE_INHIBITION,
  isEngLpValveFault,
  readFuelLeakLpValveFlags,
} from './FwsFuelLeakLpValveAlerts';
import { FwcFlightPhase } from './FwsFlightPhases';
import type { FwsCore } from './FwsCore';
import { createFws, FwsFixture } from './FwsSpecFixture';

describe('FUEL ENG 1(2)(3)(4) LP VLV FAULT', () => {
  it('triggers on ground for a valve abnormally closed (engine start) or abnormally open (engine shutdown)', () => {
    expect(isEngLpValveFault(true, false, true)).toBe(true);
    expect(isEngLpValveFault(true, true, false)).toBe(true);
    expect(isEngLpValveFault(true, false, false)).toBe(false);
  });

  it('does not trigger in flight', () => {
    expect(isEngLpValveFault(false, true, false)).toBe(false);
    expect(isEngLpValveFault(false, false, true)).toBe(false);
  });

  it('asks for the ENG MASTER OFF before takeoff, and gives crew awareness only after landing', () => {
    expect(engLpValveFaultLines(FwcFlightPhase.FirstEngineStarted, true)).toEqual({ show: [true], checked: [false] });
    expect(engLpValveFaultLines(FwcFlightPhase.FirstEngineStarted, false)).toEqual({ show: [true], checked: [true] });
    const afterLanding = [
      FwcFlightPhase.TouchDown,
      FwcFlightPhase.AtOrBelowEightyKnots,
      FwcFlightPhase.EnginesShutdown,
    ];
    for (const phase of afterLanding) {
      expect(engLpValveFaultLines(phase, true).show).toEqual([false]);
    }
  });

  it('reads the LP valve monitoring of each engine and the leak detection as real booleans', () => {
    const flags = readFuelLeakLpValveFlags((name) =>
      name === 'L:A32NX_FUEL_ENG_3_LP_VALVE_ABNORMALLY_OPEN' || name === 'L:A380X_FUEL_LEAK_DETECTED' ? 1 : 0,
    );
    expect(flags.lpValveAbnormallyOpen).toEqual([false, false, true, false]);
    expect(flags.lpValveAbnormallyClosed).toEqual([false, false, false, false]);
    expect(flags.leakDetected).toBe(true);
    expect(flags.leakDetectionFault).toBe(false);
  });

  it('is inhibited in the phases of the aircraft', () => {
    expect(FUEL_LEAK_LP_VALVE_PHASE_INHIBITION.engLpValveFault).toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(FUEL_LEAK_LP_VALVE_PHASE_INHIBITION.leakDetFault).toEqual([1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12]);
    expect(FUEL_LEAK_LP_VALVE_PHASE_INHIBITION.leakDetected).toEqual([1, 3, 4, 5, 6, 7, 9, 10, 11, 12]);
  });
});

describe('FWS wiring of the LP valve and leak detection alerts', () => {
  let core: FwsCore;
  let simVars: FwsFixture['simVars'];
  beforeAll(() => {
    ({ core, simVars } = createFws());
    core.startupCompleted.set(true);
  });
  const alert = (id: string) => core.abnormalSensed.ewdAbnormalSensed[id];

  it.each([
    ['281800018', 0],
    ['281800019', 1],
    ['281800020', 2],
    ['281800021', 3],
  ])('%s ENG %i LP VLV FAULT is an amber caution on the LP valve of its engine', (id, engineIndex) => {
    const engine = engineIndex + 1;
    const entry = alert(id);
    expect(entry.simVarIsActive).toBe(core.fuelEngLpValveFault[engineIndex]);
    expect(entry.flightPhaseInhib).toEqual(FUEL_LEAK_LP_VALVE_PHASE_INHIBITION.engLpValveFault);
    expect(entry.inopSysAllPhases?.([])).toEqual([ENG_LP_VALVE_FAULT_INOP_SYS[engineIndex]]);
    expect(entry.failure).toBe(2);
    expect(EcamAbnormalProcedures[id].items).toEqual([
      { name: `ENG ${engine} MASTER`, sensed: true, labelNotCompleted: 'OFF' },
    ]);
    expect(EcamInopSys[ENG_LP_VALVE_FAULT_INOP_SYS[engineIndex]]).toBe(`\x1b<4mENG ${engine} LP VLV`);
  });

  it('the ENG MASTER line is hidden after landing', () => {
    core.flightPhase.set(FwcFlightPhase.FirstEngineStarted);
    expect(alert('281800020').whichItemsToShow()).toEqual([true]);
    core.flightPhase.set(FwcFlightPhase.TouchDown);
    expect(alert('281800020').whichItemsToShow()).toEqual([false]);
  });

  it('281800072 LEAK DET FAULT is a crew awareness alert without master light, with FUEL LEAK DET inop', () => {
    const entry = alert('281800072');
    expect(entry.simVarIsActive).toBe(core.fuelLeakDetectionFault);
    expect(entry.flightPhaseInhib).toEqual(FUEL_LEAK_LP_VALVE_PHASE_INHIBITION.leakDetFault);
    expect(entry.failure).toBe(1);
    expect(entry.inopSysAllPhases?.([])).toEqual([FUEL_LEAK_DET_FAULT_INOP_SYS]);
    expect(EcamInopSys[FUEL_LEAK_DET_FAULT_INOP_SYS]).toBe('\x1b<4mFUEL LEAK DET');
  });

  it('281800073 LEAK DETECTED is a caution with the FUEL LEAK procedure, LAND ANSA', () => {
    const entry = alert('281800073');
    expect(entry.simVarIsActive).toBe(core.fuelLeakDetected);
    expect(entry.flightPhaseInhib).toEqual(FUEL_LEAK_LP_VALVE_PHASE_INHIBITION.leakDetected);
    expect(entry.failure).toBe(2);
    const procedure = EcamAbnormalProcedures['281800073'];
    expect(procedure.recommendation).toBe('LAND ANSA');
    expect(procedure.items).toBe(EcamAbnormalProcedures['280900002'].items);
  });

  it('the leak alerts follow the simvars on every update', () => {
    simVars.set('L:A380X_FUEL_LEAK_DETECTED', 1);
    simVars.set('L:A380X_FUEL_LEAK_DET_FAULT', 1);
    core.update(1000);
    expect(core.fuelLeakDetected.get()).toBe(true);
    expect(core.fuelLeakDetectionFault.get()).toBe(true);
    simVars.set('L:A380X_FUEL_LEAK_DETECTED', 0);
    simVars.set('L:A380X_FUEL_LEAK_DET_FAULT', 0);
    core.update(1000);
    expect(core.fuelLeakDetected.get()).toBe(false);
    expect(core.fuelLeakDetectionFault.get()).toBe(false);
  });
});
