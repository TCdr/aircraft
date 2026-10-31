// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeAll, describe, expect, it } from 'vitest';
import type { FwsCore } from './FwsCore';
import { A380Failure } from '@failures';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import {
  FLAPS_LEVER_OUT_OF_DETENT_PHASE_INHIBITION,
  FLAPS_LEVER_SYS_FAULT_PHASE_INHIBITION,
  FLAPS_SLATS_LOCKED_PHASE_INHIBITION,
  FLAP_SLAT_CTL_FAULT_PHASE_INHIBITION,
  SLAT_FLAP_MAINTENANCE_TEST_PHASE_INHIBITION,
  SlatFlapAlertMonitor,
  SlatFlapMaintenanceFailures,
  controlUnitFaultStatus,
  flapsLeverSysFaultStatus,
  readSlatFlapMaintenanceFailures,
  slatFlapAlerts,
  surfacesLockedStatus,
} from './FwsSlatFlapAlerts';
import {
  EcamAbnormalProcedures,
  EcamDeferredProcedures,
  EcamInfos,
  EcamInopSys,
  EcamLimitations,
} from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { DeferredProcedureType } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/EcamProcedureTypes';
import { SdPages } from '@shared/EcamSystemPages';
import { createFws, procedureItemNames } from './FwsSpecFixture';

/** A discrete word with these bits set */
const word = (bits: number[], ssm = Arinc429SignStatusMatrix.NormalOperation) =>
  new Arinc429Word(
    Arinc429Word.getRawWord(
      bits.reduce((value, bit) => value | (1 << (bit - 1)), 0),
      ssm,
    ),
  );
const noWord = word([]);

const noMaintenance: SlatFlapMaintenanceFailures = {
  flapSafetyTestOverdue: [false, false],
  slatSafetyTestOverdue: [false, false],
  slatWingTipBrakeTestOverdue: false,
  flapWingTipBrakeTestOverdue: false,
};

describe('A380X FWS slat and flap control alerts', () => {
  it('raises nothing without a fault', () => {
    const states = slatFlapAlerts([word([17, 28, 29]), word([17, 28, 29])], [noWord, noWord], noMaintenance);
    expect(states).toEqual({
      flapCtlFault: [false, false],
      slatCtlFault: [false, false],
      flapsLeverSysFault: [false, false],
      flapsLeverOutOfDetent: false,
      flapsLocked: false,
      slatsLocked: false,
      flapSafetyTestRequired: [false, false],
      slatSafetyTestRequired: [false, false],
      slatsTipBrakeTestRequired: false,
      flapsTipBrakeTestRequired: false,
    });
  });

  it('FLAP (SLAT) CTL 1(2) FAULT and FLAPS LEVER SYS 1(2) FAULT come from the component status word of that SFCC', () => {
    const states = slatFlapAlerts([noWord, noWord], [word([12, 13]), word([11])], noMaintenance);
    expect(states.flapCtlFault).toEqual([true, false]);
    expect(states.slatCtlFault).toEqual([false, true]);
    expect(states.flapsLeverSysFault).toEqual([true, false]);
  });

  it('LOCKED and OUT OF DETENT come from the system status word of either SFCC', () => {
    expect(slatFlapAlerts([noWord, word([16])], [noWord, noWord], noMaintenance)).toMatchObject({
      flapsLocked: true,
      slatsLocked: false,
      flapsLeverOutOfDetent: false,
    });
    expect(slatFlapAlerts([word([15, 27]), noWord], [noWord, noWord], noMaintenance)).toMatchObject({
      flapsLocked: false,
      slatsLocked: true,
      flapsLeverOutOfDetent: true,
    });
  });

  it('reads no fault from a word that is not in normal operation', () => {
    const failed = word([11, 12, 13, 15, 16, 27], Arinc429SignStatusMatrix.FailureWarning);
    const states = slatFlapAlerts([failed, failed], [failed, failed], noMaintenance);
    expect(states.flapCtlFault).toEqual([false, false]);
    expect(states.flapsLocked).toBe(false);
    expect(states.flapsLeverOutOfDetent).toBe(false);
  });

  it('SAFETY TEST REQUIRED and TIP BRK TEST REQUIRED come from the overdue test failures', () => {
    const active = new Set<number>([
      A380Failure.Sfcc2FlapSafetyTestOverdue,
      A380Failure.Sfcc1SlatSafetyTestOverdue,
      A380Failure.FlapWingTipBrakeTestOverdue,
    ]);
    const maintenance = readSlatFlapMaintenanceFailures((failure) => active.has(failure));
    expect(maintenance).toEqual({
      flapSafetyTestOverdue: [false, true],
      slatSafetyTestOverdue: [true, false],
      slatWingTipBrakeTestOverdue: false,
      flapWingTipBrakeTestOverdue: true,
    });
    const states = slatFlapAlerts([noWord, noWord], [noWord, noWord], maintenance);
    expect(states.flapSafetyTestRequired).toEqual([false, true]);
    expect(states.slatSafetyTestRequired).toEqual([true, false]);
    expect(states.flapsTipBrakeTestRequired).toBe(true);
    expect(states.slatsTipBrakeTestRequired).toBe(false);
  });

  it('the monitor publishes the states', () => {
    const monitor = new SlatFlapAlertMonitor();
    monitor.update(
      [noWord, word([16])],
      [noWord, word([12])],
      (failure) => failure === A380Failure.SlatWingTipBrakeTestOverdue,
    );
    expect(monitor.flapsLocked.get()).toBe(true);
    expect(monitor.flapCtlFault.map((fault) => fault.get())).toEqual([false, true]);
    expect(monitor.slatsTipBrakeTestRequired.get()).toBe(true);

    monitor.update([noWord, noWord], [noWord, noWord], () => false);
    expect(monitor.flapsLocked.get()).toBe(false);
    expect(monitor.flapCtlFault[1].get()).toBe(false);
  });
});

describe('A380X FWS slat and flap control alerts: phase inhibitions and STATUS', () => {
  it('inhibits each alert in its flight phases', () => {
    expect(FLAP_SLAT_CTL_FAULT_PHASE_INHIBITION).toEqual([3, 4, 5, 6, 7, 9, 10, 11]);
    expect(FLAPS_LEVER_SYS_FAULT_PHASE_INHIBITION).toEqual([3, 4, 5, 6, 7, 9, 10]);
    expect(FLAPS_LEVER_OUT_OF_DETENT_PHASE_INHIBITION).toEqual([4, 5, 6]);
    expect(FLAPS_SLATS_LOCKED_PHASE_INHIBITION).toEqual([4, 5, 6, 7, 10]);
    expect(SLAT_FLAP_MAINTENANCE_TEST_PHASE_INHIBITION).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('FLAP (SLAT) CTL 1(2) FAULT: INOP CAT 3 DUAL, INFO CAT 3 SINGLE ONLY, REDUND LOSS of the control unit', () => {
    expect(controlUnitFaultStatus('flaps', 1).inopSysApprLdg?.()).toEqual(['220300028']);
    expect(controlUnitFaultStatus('flaps', 1).info?.()).toEqual(['220200016']);
    expect(controlUnitFaultStatus('flaps', 0).redundLoss?.()).toEqual(['270300301']);
    expect(controlUnitFaultStatus('flaps', 1).redundLoss?.()).toEqual(['270300302']);
    expect(controlUnitFaultStatus('slats', 0).redundLoss?.()).toEqual(['270300303']);
    expect(controlUnitFaultStatus('slats', 1).redundLoss?.()).toEqual(['270300304']);
  });

  it('FLAPS LEVER SYS 1(2) FAULT: SLATS SLOW, FLAPS SLOW and the slat and flap systems of that SFCC, all phases', () => {
    expect(flapsLeverSysFaultStatus(0).limitationsAllPhases?.()).toEqual(['290400001', '290400002']);
    expect(flapsLeverSysFaultStatus(0).inopSysAllPhases?.()).toEqual(['290100003', '290100005']);
    expect(flapsLeverSysFaultStatus(1).inopSysAllPhases?.()).toEqual(['290100004', '290100006']);
  });

  it('FLAPS (SLATS) LOCKED: landing limitations, INOP FLAPS (SLATS), BTV, CAT 2, GLS AUTOLAND, and the INFOs', () => {
    expect(surfacesLockedStatus('flaps').limitationsApprLdg?.()).toEqual(['270400001', '220400001', '800400003']);
    expect(surfacesLockedStatus('flaps').inopSysApprLdg?.()).toEqual([
      '290100012',
      '320300007',
      '220300027',
      '220300010',
    ]);
    expect(surfacesLockedStatus('slats').inopSysApprLdg?.()[0]).toBe('290100013');
    expect(surfacesLockedStatus('slats').info?.()).toEqual(['280200003', '270200301']);
  });
});

/** The monitor state of the core named like 'flapCtlFault[0]' or 'flapsLocked' */
function monitorState(slatFlapControl: SlatFlapAlertMonitor, name: string): unknown {
  const indexed = name.match(/^(\w+)\[(\d)\]$/);
  const state = (slatFlapControl as unknown as Record<string, unknown>)[indexed ? indexed[1] : name];
  return indexed ? (state as unknown[])[Number(indexed[2])] : state;
}

describe('A380X FWS slat and flap control alerts: wiring', () => {
  let core: FwsCore;
  beforeAll(() => {
    ({ core } = createFws());
  });
  const alert = (id: string) => core.abnormalSensed.ewdAbnormalSensed[id];

  it.each([
    ['272800004', 'flapCtlFault[0]', FLAP_SLAT_CTL_FAULT_PHASE_INHIBITION, 1, SdPages.Fctl],
    ['272800005', 'flapCtlFault[1]', FLAP_SLAT_CTL_FAULT_PHASE_INHIBITION, 1, SdPages.Fctl],
    ['272800019', 'slatCtlFault[0]', FLAP_SLAT_CTL_FAULT_PHASE_INHIBITION, 1, SdPages.Fctl],
    ['272800020', 'slatCtlFault[1]', FLAP_SLAT_CTL_FAULT_PHASE_INHIBITION, 1, SdPages.Fctl],
    ['272800009', 'flapSafetyTestRequired[0]', SLAT_FLAP_MAINTENANCE_TEST_PHASE_INHIBITION, 1, SdPages.None],
    ['272800010', 'flapSafetyTestRequired[1]', SLAT_FLAP_MAINTENANCE_TEST_PHASE_INHIBITION, 1, SdPages.None],
    ['272800011', 'slatSafetyTestRequired[0]', SLAT_FLAP_MAINTENANCE_TEST_PHASE_INHIBITION, 1, SdPages.None],
    ['272800012', 'slatSafetyTestRequired[1]', SLAT_FLAP_MAINTENANCE_TEST_PHASE_INHIBITION, 1, SdPages.None],
    ['272800013', 'flapsLeverOutOfDetent', FLAPS_LEVER_OUT_OF_DETENT_PHASE_INHIBITION, 2, SdPages.None],
    ['272800014', 'flapsLeverSysFault[0]', FLAPS_LEVER_SYS_FAULT_PHASE_INHIBITION, 2, SdPages.Fctl],
    ['272800015', 'flapsLeverSysFault[1]', FLAPS_LEVER_SYS_FAULT_PHASE_INHIBITION, 2, SdPages.Fctl],
    ['272800016', 'flapsLocked', FLAPS_SLATS_LOCKED_PHASE_INHIBITION, 2, SdPages.Fctl],
    ['272800024', 'slatsLocked', FLAPS_SLATS_LOCKED_PHASE_INHIBITION, 2, SdPages.Fctl],
    ['272800025', 'slatsTipBrakeTestRequired', SLAT_FLAP_MAINTENANCE_TEST_PHASE_INHIBITION, 1, SdPages.None],
    ['272800027', 'flapsTipBrakeTestRequired', SLAT_FLAP_MAINTENANCE_TEST_PHASE_INHIBITION, 1, SdPages.None],
  ])(
    '%s is raised by slatFlapControl.%s with its phase inhibition, level %i, SD page %i',
    (id, state, inhibition, level, page) => {
      const entry = alert(id);
      expect(entry.simVarIsActive).toBe(monitorState(core.slatFlapControl, state));
      expect(entry.flightPhaseInhib).toEqual(inhibition);
      expect(entry.failure).toBe(level);
      expect(entry.sysPage).toBe(page);
      expect(entry.whichItemsToShow()).toHaveLength(EcamAbnormalProcedures[id].items.length);
    },
  );

  it('shows the procedure lines of FLAPS LEVER SYS FAULT and FLAPS (SLATS) LOCKED', () => {
    expect(EcamAbnormalProcedures['272800014'].items.slice(0, 2).map((item) => item.name)).toEqual([
      'SLATS SLOW',
      'FLAPS SLOW',
    ]);
    for (const id of ['272800016', '272800024']) {
      expect(procedureItemNames(id)).toEqual(['FOR VFE : USE PFD', 'USE SELECTED SPEED', 'LDG PERF AFFECTED']);
    }
  });

  it('a control unit fault gives way to SYS 1+2 FAULT when both control units are failed', () => {
    expect(alert('272800004').notActiveWhenItemActive).toEqual(['272800008']);
    expect(alert('272800020').notActiveWhenItemActive).toEqual(['272800023']);
  });

  it('FLAPS (SLATS) LOCKED have their FOR APPROACH deferred procedure', () => {
    expect(EcamDeferredProcedures['270700301'].fromAbnormalProcs).toEqual(['272800016']);
    expect(EcamDeferredProcedures['270700302'].fromAbnormalProcs).toEqual(['272800024']);
    expect(EcamDeferredProcedures['270700301'].type).toBe(DeferredProcedureType.FOR_APPROACH);
    const flapsLockedApproach = core.abnormalSensed.ewdDeferredProcs['270700301'];
    core.flapsSuperiorTo17Deg.set(false);
    core.tawsFlapModeOff.set(true);
    expect(flapsLockedApproach.whichItemsToShow()).toEqual([true, true, true, true, true]);
    expect(flapsLockedApproach.whichItemsChecked()[0]).toBe(true);
    core.flapsSuperiorTo17Deg.set(true);
    core.tawsFlapModeOff.set(false);
    expect(flapsLockedApproach.whichItemsToShow()[0]).toBe(false);
    expect(flapsLockedApproach.whichItemsChecked()[0]).toBe(false);
    expect(core.abnormalSensed.ewdDeferredProcs['270700302']).toBeDefined();
  });

  it('defines every STATUS key the alerts use', () => {
    for (const key of ['270200301', '270300301', '270300302', '270300303', '270300304']) {
      expect(
        [EcamInfos, EcamInopSys, EcamLimitations].some((table) => key in table),
        key,
      ).toBe(true);
    }
    expect(EcamInfos['270200301']).toBe('\x1b<3mFOR GA : MAINTAIN S/F CONF');
  });
});
