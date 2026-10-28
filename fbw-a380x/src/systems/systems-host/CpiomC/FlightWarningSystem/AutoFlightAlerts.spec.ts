// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { isApproachCapabilityDowngradedByRa } from './AutoFlightAlerts';

const fwsCore = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');
const interfaceCpp = readFileSync(resolve(__dirname, '../../../../wasm/fbw_a380/src/FlyByWireInterface.cpp'), 'utf-8');

/* The wiring is read from the source text, as FwsAbnormalSensedItems.spec.ts does (EcamMessages import cycle). */
const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');

describe('AUTO FLT APPROACH CAPABILITY DOWNGRADED', () => {
  it('"The RA B is failed", not with a second RA failed (NAV RA SYS dual faults)', () => {
    expect(isApproachCapabilityDowngradedByRa(false, true, false)).toBe(true);
    expect(isApproachCapabilityDowngradedByRa(false, false, false)).toBe(false);
    expect(isApproachCapabilityDowngradedByRa(true, false, false)).toBe(false);
    expect(isApproachCapabilityDowngradedByRa(true, true, false)).toBe(false);
    expect(isApproachCapabilityDowngradedByRa(false, true, true)).toBe(false);
  });

  it('is wired: phases 2, 8, 9, master caution, CAT 3 DUAL inop and CAT 3 SINGLE ONLY', () => {
    const start = abnormalSensed.indexOf('    220800006: {');
    expect(start).toBeGreaterThan(0);
    const block = abnormalSensed.slice(start, abnormalSensed.indexOf('\n    },', start));
    expect(block).toContain('flightPhaseInhib: [1, 3, 4, 5, 6, 7, 10, 11, 12],');
    expect(block).toContain('isApproachCapabilityDowngradedByRa(raAFailed, raBFailed, raCFailed)');
    expect(block).toContain('failure: 2,');
    expect(block).toContain("inopSysApprLdg: () => ['220300028'],");
    expect(block).toContain("info: () => ['220200016'],");
  });
});

/** The source of the dictionary entry `key: {` of FwsAbnormalSensed */
function entrySource(key: string): string {
  const start = abnormalSensed.indexOf(`    ${key}: {`);
  expect(start).toBeGreaterThan(0);
  return abnormalSensed.slice(start, abnormalSensed.indexOf(String.fromCharCode(10) + '    },', start));
}

describe('AUTO FLT ENG 1(2)(3)(4) A/THR OFF', () => {
  it.each([
    [220800009, 1, '701800013', '220300014'],
    [220800010, 2, '701800014', '220300015'],
    [220800011, 3, '701800015', '220300016'],
    [220800012, 4, '701800016', '220300017'],
  ])(
    'raises %i for the failed A/THR of engine %i, not with its FADEC FAULT, with its INOP SYS',
    (key, engine, fadecFault, inopSys) => {
      const source = entrySource(String(key));
      expect(source).toContain(`simVarIsActive: this.fws.engineAutothrustOff[${engine - 1}],`);
      expect(source).toContain(`notActiveWhenItemActive: ['${fadecFault}'],`);
      expect(source).toContain(`inopSysAllPhases: () => ['${inopSys}'],`);
      expect(source).toContain('whichItemsToShow: () => [!this.fws.aircraftOnGround.get()],');
      expect(source).toContain('failure: 2,');
    },
  );

  it('is raised only with the A/THR armed or active, from the flyPad failure of the engine', () => {
    expect(fwsCore).toContain(
      'this.engineAutothrustOff[index].set(failureActive(failure) && this.autoThrustStatus.get() !== 0)',
    );
    for (let engine = 1; engine <= 4; engine++) {
      expect(fwsCore).toContain(`A380Failure.Eng${engine}Autothrust,`);
    }
  });

  it('cuts the PRIM autothrust orders to that engine like the FADEC network loss does', () => {
    expect(interfaceCpp).toContain('failuresConsumer.isActive(autothrustFailures[fadecIndex])');
    expect(interfaceCpp).toContain(
      'FadecFailureInputs::autothrustOrdersReceived(primsBusOutputs[0], fadecNetworkLost)',
    );
  });
});

describe('AUTO FLT TCAS MODE FAULT', () => {
  it('raises the caution from the AP/FD TCAS mode failure, with the AP & FD OFF line and its INOP SYS', () => {
    const source = entrySource('220800014');
    expect(source).toContain('simVarIsActive: this.fws.apFdTcasModeFault,');
    expect(source).toContain('whichItemsChecked: () => [false, this.fws.apOff.get() && this.fws.fdOff.get(), false],');
    expect(source).toContain("inopSysAllPhases: () => ['220300020'],");
    expect(source).toContain('failure: 2,');
    expect(fwsCore).toContain('this.apFdTcasModeFault.set(failureActive(A380Failure.ApFdTcasMode));');
  });

  it('makes the TCAS data invalid for the PRIMs, which cannot then engage the TCAS mode', () => {
    expect(interfaceCpp).toContain(
      'tcasBusOutputs.tcas_valid = idTcasFault->get() == 0 && !failuresConsumer.isActive(Failures::ApFdTcasMode);',
    );
  });
});
