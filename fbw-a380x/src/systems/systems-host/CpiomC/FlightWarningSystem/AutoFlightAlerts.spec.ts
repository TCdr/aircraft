// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import { isApproachCapabilityDowngradedByRa } from './AutoFlightAlerts';
import { A380Failure } from '../../../failures/src/a380';
import { createFws, FwsFixture, runFwsCycle } from './FwsSpecFixture';

/** The C++ PRIM interface cannot be run in vitest: the two tests marked below read its source text */
const interfaceCpp = readFileSync(resolve(__dirname, '../../../../wasm/fbw_a380/src/FlyByWireInterface.cpp'), 'utf-8');

const alert = (fixture: FwsFixture, id: string) => fixture.core.abnormalSensed.ewdAbnormalSensed[id];

describe('AUTO FLT APPROACH CAPABILITY DOWNGRADED', () => {
  it('"The RA B is failed", not with a second RA failed (NAV RA SYS dual faults)', () => {
    expect(isApproachCapabilityDowngradedByRa(false, true, false)).toBe(true);
    expect(isApproachCapabilityDowngradedByRa(false, false, false)).toBe(false);
    expect(isApproachCapabilityDowngradedByRa(true, false, false)).toBe(false);
    expect(isApproachCapabilityDowngradedByRa(true, true, false)).toBe(false);
    expect(isApproachCapabilityDowngradedByRa(false, true, true)).toBe(false);
  });

  it('is wired: phases 2, 8, 9, master caution, CAT 3 DUAL inop and CAT 3 SINGLE ONLY', () => {
    const fixture = createFws(new Set());
    const entry = alert(fixture, '220800006');
    expect(entry.flightPhaseInhib).toEqual([1, 3, 4, 5, 6, 7, 10, 11, 12]);
    expect(entry.failure).toBe(2);
    expect(entry.inopSysApprLdg?.([])).toEqual(['220300028']);
    expect(entry.info?.([])).toEqual(['220200016']);
    const { core } = fixture;
    core.height1Failed.set(false);
    core.height2Failed.set(true);
    core.height3Failed.set(false);
    expect(entry.simVarIsActive.get()).toBe(true);
    core.height3Failed.set(true);
    expect(entry.simVarIsActive.get()).toBe(false);
  });
});

describe('AUTO FLT ENG 1(2)(3)(4) A/THR OFF', () => {
  it.each([
    [220800009, 1, '701800013', '220300014', A380Failure.Eng1Autothrust],
    [220800010, 2, '701800014', '220300015', A380Failure.Eng2Autothrust],
    [220800011, 3, '701800015', '220300016', A380Failure.Eng3Autothrust],
    [220800012, 4, '701800016', '220300017', A380Failure.Eng4Autothrust],
  ])(
    'raises %i for the failed A/THR of engine %i, not with its FADEC FAULT, with its INOP SYS',
    (key, engine, fadecFault, inopSys, failure) => {
      const fixture = createFws(new Set([failure]));
      const { core, simVars } = fixture;
      const entry = alert(fixture, String(key));
      expect(entry.simVarIsActive).toBe(core.engineAutothrustOff[engine - 1]);
      expect(entry.notActiveWhenItemActive).toEqual([fadecFault]);
      expect(entry.inopSysAllPhases?.([])).toEqual([inopSys]);
      expect(entry.failure).toBe(2);

      // Raised only with the A/THR armed or active, and only for the engine whose failure is active
      runFwsCycle(core);
      expect(core.engineAutothrustOff.map((off) => off.get())).toEqual([false, false, false, false]);
      simVars.set('L:A32NX_AUTOTHRUST_STATUS', 1);
      runFwsCycle(core);
      expect(core.engineAutothrustOff.map((off) => off.get())).toEqual(
        [0, 1, 2, 3].map((index) => index === engine - 1),
      );

      core.aircraftOnGround.set(true);
      expect(entry.whichItemsToShow()).toEqual([false]);
      core.aircraftOnGround.set(false);
      expect(entry.whichItemsToShow()).toEqual([true]);
    },
  );

  it('cuts the PRIM autothrust orders to that engine like the FADEC network loss does', () => {
    expect(interfaceCpp).toContain('failuresConsumer.isActive(autothrustFailures[fadecIndex])');
    expect(interfaceCpp).toContain(
      'FadecFailureInputs::autothrustOrdersReceived(primsBusOutputs[0], fadecNetworkLost)',
    );
  });
});

describe('AUTO FLT TCAS MODE FAULT', () => {
  let fixture: FwsFixture;
  beforeAll(() => {
    fixture = createFws(new Set([A380Failure.ApFdTcasMode]));
  });

  it('raises the caution from the AP/FD TCAS mode failure, with the AP & FD OFF line and its INOP SYS', () => {
    const { core } = fixture;
    const entry = alert(fixture, '220800014');
    expect(entry.simVarIsActive).toBe(core.apFdTcasModeFault);
    expect(entry.inopSysAllPhases?.([])).toEqual(['220300020']);
    expect(entry.failure).toBe(2);
    runFwsCycle(core);
    expect(core.apFdTcasModeFault.get()).toBe(true);
    core.apOff.set(true);
    core.fdOff.set(true);
    expect(entry.whichItemsChecked()).toEqual([false, true, false]);
    core.fdOff.set(false);
    expect(entry.whichItemsChecked()).toEqual([false, false, false]);
  });

  it('makes the TCAS data invalid for the PRIMs, which cannot then engage the TCAS mode', () => {
    expect(interfaceCpp).toContain(
      'tcasBusOutputs.tcas_valid = idTcasFault->get() == 0 && !failuresConsumer.isActive(Failures::ApFdTcasMode);',
    );
  });
});
