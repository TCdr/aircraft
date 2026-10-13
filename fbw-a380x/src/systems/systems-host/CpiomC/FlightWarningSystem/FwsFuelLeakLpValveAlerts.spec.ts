// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  ENG_LP_VALVE_FAULT_INOP_SYS,
  engLpValveFaultLines,
  FUEL_LEAK_DET_FAULT_INOP_SYS,
  FUEL_LEAK_LP_VALVE_PHASE_INHIBITION,
  isEngLpValveFault,
  readFuelLeakLpValveFlags,
} from './FwsFuelLeakLpValveAlerts';
import { FwcFlightPhase } from './FwsFlightPhases';

/* A380 FCOM PRO-ABN-ECAM-10-28 FUEL ENG 1(2)(3)(4) LP VLV FAULT, a380_fcom.txt l.149688-149739 */
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

  it('is inhibited in the phases of the FCOM figures (PDF p.5162, p.5222, p.5224)', () => {
    expect(FUEL_LEAK_LP_VALVE_PHASE_INHIBITION.engLpValveFault).toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(FUEL_LEAK_LP_VALVE_PHASE_INHIBITION.leakDetFault).toEqual([1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12]);
    expect(FUEL_LEAK_LP_VALVE_PHASE_INHIBITION.leakDetected).toEqual([1, 3, 4, 5, 6, 7, 9, 10, 11, 12]);
  });
});

/*
 * The wiring, read from the source text (importing the EcamMessages tables in a test fails on a circular import, see
 * FwsAbnormalSensedItems.spec.ts).
 */
describe('FWS wiring of the LP valve and leak detection alerts', () => {
  const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
  const core = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');
  const ata28 = readFileSync(
    resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata28.ts'),
    'utf-8',
  );
  const messages = readFileSync(
    resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/index.ts'),
    'utf-8',
  );

  /** The source of one entry, from its id to the end of its object, the entries being indented by `indent` */
  function alertBlock(source: string, id: string, indent = '    '): string {
    const start = source.indexOf(`\n${indent}${id}: {`);
    expect(start, `alert ${id}`).toBeGreaterThan(0);
    return source.slice(start, source.indexOf(`\n${indent}},`, start + 1));
  }

  /** The procedure of an alert in ata28.ts, whose entries are indented by two spaces */
  const procedureBlock = (id: string) => alertBlock(ata28, id, '  ');

  it.each([
    ['281800018', 1],
    ['281800019', 2],
    ['281800020', 3],
    ['281800021', 4],
  ])('%s ENG %i LP VLV FAULT is an amber caution on the LP valve of its engine', (id, engine) => {
    const block = alertBlock(abnormalSensed, id);
    expect(block).toContain(`simVarIsActive: this.fws.fuelEngLpValveFault[${engine - 1}],`);
    expect(block).toContain('flightPhaseInhib: FUEL_LEAK_LP_VALVE_PHASE_INHIBITION.engLpValveFault,');
    expect(block).toContain(`this.fws.engine${engine}Master.get()`);
    expect(block).toContain(`inopSysAllPhases: () => [ENG_LP_VALVE_FAULT_INOP_SYS[${engine - 1}]],`);
    expect(block).toContain('failure: 2,');
    expect(procedureBlock(id)).toContain(
      `items: [{ name: 'ENG ${engine} MASTER', sensed: true, labelNotCompleted: 'OFF' }],`,
    );
    expect(messages).toContain(`${ENG_LP_VALVE_FAULT_INOP_SYS[engine - 1]}: '\\x1b<4mENG ${engine} LP VLV',`);
  });

  it('281800072 LEAK DET FAULT is a crew awareness alert without master light, with FUEL LEAK DET inop', () => {
    const block = alertBlock(abnormalSensed, '281800072');
    expect(block).toContain('simVarIsActive: this.fws.fuelLeakDetectionFault,');
    expect(block).toContain('flightPhaseInhib: FUEL_LEAK_LP_VALVE_PHASE_INHIBITION.leakDetFault,');
    expect(block).toContain('failure: 1,');
    expect(messages).toContain(`${FUEL_LEAK_DET_FAULT_INOP_SYS}: '\\x1b<4mFUEL LEAK DET',`);
  });

  it('281800073 LEAK DETECTED is a caution with the FUEL LEAK procedure, LAND ANSA', () => {
    const block = alertBlock(abnormalSensed, '281800073');
    expect(block).toContain('simVarIsActive: this.fws.fuelLeakDetected,');
    expect(block).toContain('flightPhaseInhib: FUEL_LEAK_LP_VALVE_PHASE_INHIBITION.leakDetected,');
    expect(block).toContain('failure: 2,');
    const procedure = procedureBlock('281800073');
    expect(procedure).toContain('items: FUEL_LEAK_PROCEDURE_ITEMS,');
    expect(procedure).toContain("recommendation: 'LAND ANSA',");
    expect(procedureBlock('280900002')).toContain('items: FUEL_LEAK_PROCEDURE_ITEMS,');
  });

  it('FwsCore reads the flags on every update', () => {
    expect(core).toContain('readFuelLeakLpValveFlags((name) => SimVar.GetSimVarValue(name, SimVarValueType.Bool))');
    expect(core).toContain('this.fuelLeakDetected.set(leakLpValve.leakDetected);');
    expect(core).toContain('this.fuelLeakDetectionFault.set(leakLpValve.leakDetectionFault);');
  });
});
