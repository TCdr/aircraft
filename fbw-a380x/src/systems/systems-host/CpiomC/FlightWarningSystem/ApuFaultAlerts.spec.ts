// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeAll, describe, expect, it } from 'vitest';
import {
  APU_FAULT_INOP_SYS,
  APU_FAULT_PHASE_INHIBITION,
  APU_MACH_LIMIT_PHASE_INHIBITION,
  APU_OIL_FILTER_CLOGGED_PHASE_INHIBITION,
  apuFaultItemsChecked,
  apuFaultItemsToShow,
  ApuFaultInputs,
  apuMachLimitItemsChecked,
  isApuFault,
  isApuMachLimitExceeded,
  isApuOilFilterClogged,
} from './ApuFaultAlerts';

import { EcamAbnormalProcedures, EcamInopSys } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { A380Failure, A380FailureDefinitions } from '../../../failures/src/a380';
import { SdPages } from '@shared/EcamSystemPages';
import { createFws, FwsFixture } from './FwsSpecFixture';

let fixture: FwsFixture;
beforeAll(() => {
  fixture = createFws();
});
const alert = (id: string) => fixture.core.abnormalSensed.ewdAbnormalSensed[id];

const none: ApuFaultInputs = { emergencyShutdown: false, autoShutdown: false, apuFireWarning: false };

describe('APU FAULT', () => {
  it('triggers on an emergency or an automatic shutdown, not while the APU FIRE warning is shown', () => {
    expect(isApuFault(none)).toBe(false);
    expect(isApuFault({ ...none, emergencyShutdown: true })).toBe(true);
    expect(isApuFault({ ...none, autoShutdown: true })).toBe(true);
    expect(isApuFault({ ...none, emergencyShutdown: true, apuFireWarning: true })).toBe(false);
  });

  it('shows the EMER SHUTDOWN or the AUTO SHUTDOWN lines', () => {
    expect(apuFaultItemsToShow({ ...none, emergencyShutdown: true, autoShutdown: true })).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(apuFaultItemsToShow({ ...none, autoShutdown: true })).toEqual([
      false,
      false,
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it('APU MASTER SW ... OFF is done with the MASTER SW off', () => {
    expect(apuFaultItemsChecked(false)).toEqual([false, true, false, true, false, false, false, true]);
    expect(apuFaultItemsChecked(true).some((checked) => checked)).toBe(false);
  });

  it('is inhibited in flight phases 3-7, 9 and 10', () => {
    expect(APU_FAULT_PHASE_INHIBITION).toEqual([3, 4, 5, 6, 7, 9, 10]);
  });

  it('has a message with 8 lines, an INOP SYS APU and is wired', () => {
    const procedure = EcamAbnormalProcedures['490800001'];
    expect(procedure.title).toBe('\x1b<4m\x1b4mAPU\x1bm FAULT');
    expect(procedure.items).toHaveLength(apuFaultItemsChecked(true).length);
    expect(EcamInopSys['490300001']).toBe('\x1b<4mAPU');
    const entry = alert('490800001');
    expect(entry.simVarIsActive).toBe(fixture.core.apuFault);
    expect(entry.inopSysAllPhases?.([])).toEqual(APU_FAULT_INOP_SYS);
  });
});

describe('APU MACH LIMIT EXCEEDED', () => {
  it('triggers with the APU running above M 0.5', () => {
    expect(isApuMachLimitExceeded(true, 0.5)).toBe(false);
    expect(isApuMachLimitExceeded(true, 0.51)).toBe(true);
    expect(isApuMachLimitExceeded(false, 0.85)).toBe(false);
  });

  it('APU MASTER SW ... OFF is done with the MASTER SW off', () => {
    expect(apuMachLimitItemsChecked(true)).toEqual([false, false]);
    expect(apuMachLimitItemsChecked(false)).toEqual([false, true]);
  });

  it('is inhibited in every flight phase but 8', () => {
    expect(APU_MACH_LIMIT_PHASE_INHIBITION).toEqual([1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12]);
  });

  it('has its message and is wired with SC, master caution, APU page and INOP SYS APU', () => {
    const procedure = EcamAbnormalProcedures['490800002'];
    expect(procedure.title).toBe('\x1b<4m\x1b4mAPU\x1bm MACH LIMIT EXCEEDED');
    expect(procedure.items).toHaveLength(apuMachLimitItemsChecked(true).length);
    const entry = alert('490800002');
    expect(entry.simVarIsActive).toBe(fixture.core.apuMachLimitExceeded);
    expect(entry.inopSysAllPhases?.([])).toEqual(APU_FAULT_INOP_SYS);
    expect(entry.failure).toBe(2);
    expect(entry.sysPage).toBe(SdPages.Apu);
  });
});

describe('APU OIL FILTER CLOGGED', () => {
  it('shows the clogging failure while the APU runs', () => {
    expect(isApuOilFilterClogged(true, true)).toBe(true);
    expect(isApuOilFilterClogged(true, false)).toBe(false);
    expect(isApuOilFilterClogged(false, true)).toBe(false);
  });

  it('is inhibited in flight phases 2 to 11', () => {
    expect(APU_OIL_FILTER_CLOGGED_PHASE_INHIBITION).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('has its message, is a no-audio crew awareness alert fed by the flyPad failure 49004', () => {
    expect(EcamAbnormalProcedures['490800003'].title).toBe('\x1b<4m\x1b4mAPU\x1bm OIL FILTER CLOGGED');
    const entry = alert('490800003');
    expect(entry.simVarIsActive).toBe(fixture.core.apuOilFilterClogged);
    expect(entry.failure).toBe(1);
    expect(A380Failure.ApuOilFilterClogging).toBe(49004);
    expect(A380FailureDefinitions.some((definition) => definition[1] === A380Failure.ApuOilFilterClogging)).toBe(true);
  });
});
