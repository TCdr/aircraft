// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  allEngFlameOutInhibitsElecEmerConfig,
  AutoRelightInputs,
  autoRelightInProgress,
  ENG_FAIL_FLIGHT_PHASE_INHIBITION,
  ENG_FAIL_ITEM_COUNT,
  ENG_FAIL_NOT_IDENTIFIED_ITEM_COUNT,
  engineFailItemsChecked,
  engineFailItemsShown,
  OPPOSITE_SIDE_APPROACH_ITEM_COUNT,
  oppositeSideApproachItems,
  SAME_SIDE_APPROACH_ITEM_COUNT,
  sameSideApproachItems,
  TWO_ENGS_OUT_ALL_PHASES_ITEM_COUNT,
  TwoEnginesOutDeferredInputs,
  twoEnginesOutAllPhasesItems,
  EngineFailInputs,
  EngineFailMonitor,
  EnginesOut,
  FadecEngineState,
  hydraulicSystemsLostByEnginesOut,
  oppositeSideGeneratorPair,
  relightProcMustBeApplied,
  sameSideLines,
  shutDownBtvInop,
  shutDownCat3SingleOnly,
  TwoEnginesOut,
  twoEnginesOut,
} from './EngineFailAlerts';
import { FadecShutdownReason } from './EngineMonitoringAlerts';
import {
  EcamAbnormalProcedures,
  EcamDeferredProcedures,
} from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { DeferredProcedureType } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/EcamProcedureTypes';
import { createFws, FwsFixture, runFwsCycle, procedureItemNames } from './FwsSpecFixture';

const FRAME_MS = 100;

/** Runs the monitor for a number of seconds with the same inputs */
function run(monitor: EngineFailMonitor, inputs: EngineFailInputs, seconds: number): EngineFailMonitor {
  for (let t = 0; t < seconds * 1000; t += FRAME_MS) {
    monitor.update(inputs, FRAME_MS);
  }
  return monitor;
}

const running: EngineFailInputs = {
  masterOn: true,
  firePbPushed: false,
  engineState: FadecEngineState.On,
  coreSpeedPercent: 70,
};
const flamedOut: EngineFailInputs = { ...running, engineState: FadecEngineState.Shutting, coreSpeedPercent: 12 };

describe('ENG 1(2)(3)(4) FAIL memory', () => {
  it('an engine that ran and flames out fails below 50 % N3, not before', () => {
    const monitor = run(new EngineFailMonitor(), running, 10);
    run(monitor, { ...flamedOut, coreSpeedPercent: 55 }, 1);
    expect(monitor.failed).toBe(false);

    run(monitor, flamedOut, 1);
    expect(monitor.failed).toBe(true);
  });

  it('no ENG FAIL with the ENG FIRE pb pushed', () => {
    const monitor = run(new EngineFailMonitor(), running, 10);
    run(monitor, { ...flamedOut, firePbPushed: true }, 5);
    expect(monitor.failed).toBe(false);
  });

  it('ENG FAIL clears when the engine runs again after a relight', () => {
    const monitor = run(new EngineFailMonitor(), running, 10);
    run(monitor, flamedOut, 5);
    expect(monitor.failed).toBe(true);

    run(monitor, { ...running, engineState: FadecEngineState.Restarting, coreSpeedPercent: 40 }, 20);
    expect(monitor.failed).toBe(true);
    run(monitor, running, 1);
    expect(monitor.failed).toBe(false);
  });

  // Regression: FwsCore once took "master ON and not STARTING" for "was running" on the engines 3 and 4, so the
  // attempts below raised ENG 3(4) FAIL, not ENG 1(2) FAIL.
  it('a relight attempt after a crew shutdown that does not light up raises no ENG FAIL', () => {
    const monitor = run(new EngineFailMonitor(), running, 10);
    // MASTER OFF: the engine shuts down and windmills
    run(monitor, { ...flamedOut, masterOn: false }, 60);
    // MASTER ON outside the relight envelope: the FADEC starts the engine (fuel cut), it does not light up
    run(monitor, { ...flamedOut, engineState: FadecEngineState.Restarting }, 30);
    expect(monitor.failed).toBe(false);
    run(monitor, flamedOut, 30);
    expect(monitor.failed).toBe(false);
  });

  it('an engine start with the master ON before the FADEC reports STARTING raises no ENG FAIL', () => {
    const monitor = new EngineFailMonitor();
    run(monitor, { ...running, engineState: FadecEngineState.Off, coreSpeedPercent: 0, masterOn: false }, 5);
    // the master is ON one frame before the FADEC is STARTING
    run(monitor, { ...running, engineState: FadecEngineState.Off, coreSpeedPercent: 0 }, 0.1);
    run(monitor, { ...running, engineState: FadecEngineState.Starting, coreSpeedPercent: 20 }, 40);
    expect(monitor.failed).toBe(false);
    // a master ON with the ENG START selector at NORM: no start, no ENG FAIL
    run(monitor, { ...running, engineState: FadecEngineState.Off, coreSpeedPercent: 0 }, 30);
    expect(monitor.failed).toBe(false);
  });
});

/**
 * Runs the four engines for 10 s, then flames out the given ones (the FADEC reports them shutting down, N3 below 50 %)
 * @param fixture the FWS on mocked simvars
 * @param failedEngines the engine numbers (1 to 4) that flame out
 */
function failEngines(fixture: FwsFixture, failedEngines: number[]) {
  const { core, simVars } = fixture;
  [1, 2, 3, 4].forEach((engine) => {
    core.bus.getPublisher<any>().pub(`engine_master_${engine}`, true, true);
    simVars.set(`L:A32NX_ENGINE_STATE:${engine}`, FadecEngineState.On);
    simVars.set(`L:A32NX_ENGINE_N3:${engine}`, 70);
  });
  for (let second = 0; second < 10; second++) {
    runFwsCycle(core);
  }
  failedEngines.forEach((engine) => {
    simVars.set(`L:A32NX_ENGINE_STATE:${engine}`, FadecEngineState.Shutting);
    simVars.set(`L:A32NX_ENGINE_N3:${engine}`, 12);
  });
  for (let second = 0; second < 3; second++) {
    runFwsCycle(core);
  }
}

describe('FwsCore wiring of the engine failure logic', () => {
  it('feeds the four engines to the same ENG FAIL logic', () => {
    for (const engine of [1, 2, 3, 4]) {
      const fixture = createFws(new Set());
      failEngines(fixture, [engine]);
      const fails = [fixture.core.eng1Fail, fixture.core.eng2Fail, fixture.core.eng3Fail, fixture.core.eng4Fail];
      expect(
        fails.map((fail) => fail.get()),
        `engine ${engine}`,
      ).toEqual([1, 2, 3, 4].map((other) => other === engine));
    }
  });

  it('reads the thrust lever of engines 3 and 4 for their THR LEVER IDLE lines', () => {
    const { core, simVars } = createFws(new Set());
    for (const engine of [3, 4]) {
      const entry = core.abnormalSensed.ewdAbnormalSensed[701800028 + engine];
      simVars.set(`L:A32NX_AUTOTHRUST_TLA:${engine}`, 0);
      runFwsCycle(core);
      expect(entry.whichItemsChecked()[2]).toBe(true);
      simVars.set(`L:A32NX_AUTOTHRUST_TLA:${engine}`, 25);
      runFwsCycle(core);
      expect(entry.whichItemsChecked()[2]).toBe(false);
    }
  });
});

describe('ENG FAIL: RELIGHT PROC CONSIDER or APPLY', () => {
  it('APPLY when more than two engines failed', () => {
    expect(relightProcMustBeApplied([true, false, false, false])).toBe(false);
    expect(relightProcMustBeApplied([true, true, false, false])).toBe(false);
    expect(relightProcMustBeApplied([true, true, false, true])).toBe(true);
  });

  it.each([701800029, 701800030, 701800031, 701800032])(
    '%s has the APPLY line after the CONSIDER line, and one show / checked entry per item',
    (id) => {
      const items = EcamAbnormalProcedures[id].items;
      expect(items.length).toBe(ENG_FAIL_ITEM_COUNT);
      const consider = items.findIndex((item) => 'labelNotCompleted' in item && item.labelNotCompleted === 'CONSIDER');
      expect(items[consider]).toMatchObject({ name: expect.stringMatching(/RELIGHT PROC$/), sensed: false, level: 1 });
      expect(items[consider + 1]).toMatchObject({
        name: expect.stringMatching(/^ENG \d RELIGHT PROC$/),
        sensed: false,
        labelNotCompleted: 'APPLY',
      });

      // The 24 lines of the branches where the FADEC does not identify the failure, wrapped by engineFailItemsShown
      // and engineFailItemsChecked
      const { core } = createFws(new Set());
      const entry = core.abnormalSensed.ewdAbnormalSensed[id];
      core.aircraftOnGround.set(false);
      core.engineRelightProcApply.set(false);
      expect(entry.whichItemsToShow()).toHaveLength(ENG_FAIL_ITEM_COUNT);
      expect(entry.whichItemsChecked()).toHaveLength(ENG_FAIL_ITEM_COUNT);
      expect(entry.whichItemsToShow().slice(12, 14)).toEqual([true, false]);
      core.engineRelightProcApply.set(true);
      expect(entry.whichItemsToShow().slice(12, 14)).toEqual([false, true]);
      expect(ENG_FAIL_NOT_IDENTIFIED_ITEM_COUNT).toBe(24);

      // The shutdown reason of the FADEC of the engine selects the FADEC OVHT branch
      core.engineCtlSysFaultInputs[id - 701800029].fadecShutdownReason = FadecShutdownReason.FadecOverheat;
      expect(entry.whichItemsToShow()[24]).toBe(true);
    },
  );
});

/* ENG FAIL, FADEC OVHT and THRUST CTL LOST branches */
describe('ENG FAIL with a FADEC shutdown reason', () => {
  const notIdentified = (value: boolean) => new Array<boolean>(ENG_FAIL_NOT_IDENTIFIED_ITEM_COUNT).fill(value);

  it('keeps the 24 lines of the other branches without a FADEC shutdown', () => {
    const shown = engineFailItemsShown(FadecShutdownReason.None, notIdentified(true));
    expect(shown).toHaveLength(ENG_FAIL_ITEM_COUNT);
    expect(shown.slice(0, 24)).toEqual(notIdentified(true));
    expect(shown.slice(24)).toEqual([false, false, false, false]);
  });

  it('FADEC OVHT: L/G UP, FADEC OVHT, THR LEVER IDLE, ENG MASTER OFF; no AUTO RELIGHT, no DAMAGED lines', () => {
    const shown = engineFailItemsShown(FadecShutdownReason.FadecOverheat, notIdentified(true));
    expect(shown).toHaveLength(ENG_FAIL_ITEM_COUNT);
    expect(shown[0]).toBe(true);
    expect(shown.slice(1, 24)).toEqual(new Array<boolean>(23).fill(false));
    expect(shown.slice(24)).toEqual([true, false, true, true]);
  });

  it('THRUST CTL LOST: THRUST CTL LOST, THR LEVER IDLE, ENG MASTER OFF; L/G UP only when the other branch shows it', () => {
    const shown = engineFailItemsShown(FadecShutdownReason.ThrustControlLost, notIdentified(false));
    expect(shown.slice(0, 24)).toEqual(notIdentified(false));
    expect(shown.slice(24)).toEqual([false, true, true, true]);
  });

  it('HMU overspeed shutdown: THR LEVER IDLE and ENG MASTER OFF only, without a reason line', () => {
    const shown = engineFailItemsShown(FadecShutdownReason.HmuOverspeed, notIdentified(false));
    expect(shown.slice(0, 24)).toEqual(notIdentified(false));
    expect(shown.slice(24)).toEqual([false, false, true, true]);
  });

  it('ticks THR LEVER IDLE and ENG MASTER OFF', () => {
    const checked = engineFailItemsChecked(notIdentified(false), true, false);
    expect(checked).toHaveLength(ENG_FAIL_ITEM_COUNT);
    expect(checked.slice(24)).toEqual([false, false, true, false]);
    expect(engineFailItemsChecked(notIdentified(false), true, true).slice(24)).toEqual([false, false, true, true]);
  });

  it('has the four lines at the end of ata70 ENG n FAIL', () => {
    for (const engine of [1, 2, 3, 4]) {
      const names = procedureItemNames(701800028 + engine);
      expect(names.slice(24)).toEqual(['FADEC OVHT', 'THRUST CTL LOST', `THR LEVER ${engine}`, `ENG ${engine} MASTER`]);
    }
  });
});

describe('ENG TWO ENGS OUT ON SAME / OPPOSITE SIDE', () => {
  const out = (...engines: number[]): EnginesOut =>
    [1, 2, 3, 4].map((engine) => engines.includes(engine)) as unknown as EnginesOut;

  it('two engines out on the same wing', () => {
    expect(twoEnginesOut(out(1, 2))).toBe(TwoEnginesOut.SameSide);
    expect(twoEnginesOut(out(3, 4))).toBe(TwoEnginesOut.SameSide);
  });

  it('two engines out on opposite wings', () => {
    expect(twoEnginesOut(out(1, 4))).toBe(TwoEnginesOut.OppositeSide);
    expect(twoEnginesOut(out(2, 3))).toBe(TwoEnginesOut.OppositeSide);
    expect(twoEnginesOut(out(1, 3))).toBe(TwoEnginesOut.OppositeSide);
  });

  it('not with one, three or four engines out', () => {
    expect(twoEnginesOut(out(2))).toBe(TwoEnginesOut.None);
    expect(twoEnginesOut(out(1, 2, 3))).toBe(TwoEnginesOut.None);
    expect(twoEnginesOut(out(1, 2, 3, 4))).toBe(TwoEnginesOut.None);
  });

  it('same side lines: the PACK of the failed side, the steering endurance with ENG 1+2', () => {
    expect(sameSideLines(out(1, 2))).toEqual({ pack1Off: true, pack2Off: false, steerEnduranceLimited: true });
    expect(sameSideLines(out(3, 4))).toEqual({ pack1Off: false, pack2Off: true, steerEnduranceLimited: false });
  });
});

describe('ENG SHUT DOWN STATUS', () => {
  it('BTV is inoperative when engine 2 or 3 is shut down', () => {
    expect(shutDownBtvInop(true, false)).toBe(true);
    expect(shutDownBtvInop(false, true)).toBe(true);
    expect(shutDownBtvInop(false, false)).toBe(false);
  });

  it('CAT 3 SINGLE ONLY with an engine shut down and the APU off', () => {
    expect(shutDownCat3SingleOnly(true, false)).toBe(true);
    expect(shutDownCat3SingleOnly(true, true)).toBe(false);
    expect(shutDownCat3SingleOnly(false, false)).toBe(false);
  });
});

describe('ENG TWO ENGS OUT STATUS', () => {
  const out = (...engines: number[]): EnginesOut =>
    [1, 2, 3, 4].map((engine) => engines.includes(engine)) as unknown as EnginesOut;
  it('the two engines of a side out lose the hydraulic system of that side', () => {
    expect(hydraulicSystemsLostByEnginesOut(out(1, 2))).toEqual({ green: true, yellow: false });
    expect(hydraulicSystemsLostByEnginesOut(out(3, 4))).toEqual({ green: false, yellow: true });
    expect(hydraulicSystemsLostByEnginesOut(out(1, 3))).toEqual({ green: false, yellow: false });
    expect(hydraulicSystemsLostByEnginesOut(out(1, 2, 3, 4))).toEqual({ green: true, yellow: true });
  });

  it('same side: G(Y) HYD SYS and PART SPLRs, no ENG PMP A+B line of the lost system', () => {
    const fixture = createFws(new Set());
    const { core, simVars } = fixture;
    const inopSys = core.inopSys.inopSys;
    // Both hydraulic systems pressurised: only the engines out can make a system inoperative
    simVars.set('L:A32NX_HYD_GREEN_SYSTEM_1_SECTION_PRESSURE_SWITCH', 1);
    simVars.set('L:A32NX_HYD_YELLOW_SYSTEM_1_SECTION_PRESSURE_SWITCH', 1);
    expect(inopSys['290300021'].simVarIsActive).toBe(core.greenHydSysInop);
    expect(inopSys['290300022'].simVarIsActive).toBe(core.yellowHydSysInop);
    runFwsCycle(core);
    expect(core.greenHydSysInop.get()).toBe(false);
    expect(core.yellowHydSysInop.get()).toBe(false);
    expect(core.inopSys.partSplrs.get()).toBe(false);

    failEngines(fixture, [1, 2]);
    expect(core.greenHydSysInop.get()).toBe(true);
    expect(core.yellowHydSysInop.get()).toBe(false);
    expect(core.inopSys.partSplrs.get()).toBe(true);
    // GEN 1 and 2 are inoperative with their engines out, yet their ENG PMP A+B lines give way to G HYD SYS
    expect(core.eng1HydraulicInop.get()).toBe(false);
    expect(core.eng2HydraulicInop.get()).toBe(false);
    expect(core.eng3HydraulicInop.get()).toBe(false);
  });

  it('same side: PART L/G RETRACTION and the PACK of the failed side', () => {
    const { core } = createFws(new Set());
    const entry = core.abnormalSensed.ewdAbnormalSensed['701800159'];
    core.twoEnginesOutLeftSide.set(true);
    expect(entry.inopSysAllPhases?.([])).toEqual(['320300023', '210300009']);
    core.twoEnginesOutLeftSide.set(false);
    expect(entry.inopSysAllPhases?.([])).toEqual(['320300023', '210300010']);
  });

  it('opposite side: one GEN line for the two generators lost', () => {
    expect(oppositeSideGeneratorPair([true, false, true, false])).toEqual([1, 3]);
    expect(oppositeSideGeneratorPair([true, false, false, true])).toEqual([1, 4]);
    expect(oppositeSideGeneratorPair([false, true, true, false])).toEqual([2, 3]);
    expect(oppositeSideGeneratorPair([false, true, false, true])).toEqual([2, 4]);
    // same side pairs have their own GEN 1+2 and GEN 3+4 lines, one or three generators no pair line
    expect(oppositeSideGeneratorPair([true, true, false, false])).toBeNull();
    expect(oppositeSideGeneratorPair([false, false, true, true])).toBeNull();
    expect(oppositeSideGeneratorPair([true, false, false, false])).toBeNull();
    expect(oppositeSideGeneratorPair([true, true, true, false])).toBeNull();

    const { core } = createFws(new Set());
    const inopSys = core.inopSys.inopSys;
    expect(inopSys['240300039'].simVarIsActive).toBe(core.inopSys.gen13Inop);
    expect(inopSys['240300040'].simVarIsActive).toBe(core.inopSys.gen14Inop);
    expect(inopSys['240300041'].simVarIsActive).toBe(core.inopSys.gen23Inop);
    expect(inopSys['240300042'].simVarIsActive).toBe(core.inopSys.gen24Inop);
    // GEN 1 is not shown with GEN 1+2, 1+3 or 1+4
    expect(inopSys['240300010'].notActiveWhenItemActive).toEqual(['240300037', '240300039', '240300040']);
    expect(inopSys['240300013'].notActiveWhenItemActive).toEqual(['240300038', '240300040', '240300042']);
  });
});

describe('ENG ALL ENG FLAME OUT inhibits ELEC EMER CONFIG while it is shown', () => {
  const PHASE_6_LIFT_OFF_TO_1500_FT = 6;
  const PHASE_8_CRUISE = 8;

  it('in a phase that shows ALL ENG FLAME OUT', () => {
    expect(allEngFlameOutInhibitsElecEmerConfig(true, false, PHASE_8_CRUISE)).toBe(true);
    expect(allEngFlameOutInhibitsElecEmerConfig(false, false, PHASE_8_CRUISE)).toBe(false);
  });

  it('not when the phase inhibits a new ALL ENG FLAME OUT: ELEC EMER CONFIG shows instead', () => {
    expect(allEngFlameOutInhibitsElecEmerConfig(true, false, PHASE_6_LIFT_OFF_TO_1500_FT)).toBe(false);
  });

  it('an ALL ENG FLAME OUT already shown keeps inhibiting it in any phase', () => {
    expect(allEngFlameOutInhibitsElecEmerConfig(true, true, PHASE_6_LIFT_OFF_TO_1500_FT)).toBe(true);
    expect(allEngFlameOutInhibitsElecEmerConfig(true, true, 10)).toBe(true);
  });
});

describe('ENG FAIL inhibition and AUTO RELIGHT IN PROGRESS', () => {
  it('ENG FAIL is not inhibited in any flight phase', () => {
    expect(ENG_FAIL_FLIGHT_PHASE_INHIBITION).toEqual([]);
    const { core } = createFws(new Set());
    for (let engine = 1; engine <= 4; engine++) {
      expect(core.abnormalSensed.ewdAbnormalSensed[701800028 + engine].flightPhaseInhib).toBe(
        ENG_FAIL_FLIGHT_PHASE_INHIBITION,
      );
    }
  });

  const flameoutInFlight: AutoRelightInputs = {
    inFlight: true,
    igniterAActive: false,
    igniterBActive: false,
    relightAttempt: false,
    relightIgnition: false,
  };

  it('no AUTO RELIGHT IN PROGRESS for a flameout that the FADEC does not relight (fuel cut: igniters off)', () => {
    expect(autoRelightInProgress(flameoutInFlight)).toBe(false);
  });

  it('AUTO RELIGHT IN PROGRESS while the FADEC auto relight has both igniters on, in flight', () => {
    const autoRelight = { ...flameoutInFlight, igniterAActive: true, igniterBActive: true };
    expect(autoRelightInProgress(autoRelight)).toBe(true);
    expect(autoRelightInProgress({ ...autoRelight, inFlight: false })).toBe(false);
    expect(autoRelightInProgress({ ...autoRelight, igniterBActive: false })).toBe(false);
  });

  it('not for the igniters of a relight the crew started (ENG MASTER OFF then ON)', () => {
    const crewRelight = { ...flameoutInFlight, igniterAActive: true, igniterBActive: true };
    expect(autoRelightInProgress({ ...crewRelight, relightAttempt: true })).toBe(false);
    expect(autoRelightInProgress({ ...crewRelight, relightIgnition: true })).toBe(false);
  });

  it.each([1, 2, 3, 4])(
    'ENG %d FAIL shows the line from the FADEC auto relight state, not from "in flight"',
    (engine) => {
      const { core } = createFws(new Set());
      const entry = core.abnormalSensed.ewdAbnormalSensed[701800028 + engine];
      core.aircraftOnGround.set(false);
      core.engineAutoRelightInProgress[engine - 1].set(false);
      expect(entry.whichItemsToShow()[1]).toBe(false);
      core.engineAutoRelightInProgress[engine - 1].set(true);
      expect(entry.whichItemsToShow()[1]).toBe(true);
    },
  );
});

describe('ENG TWO ENGS OUT deferred procedures', () => {
  const deferred = (id: number) => EcamDeferredProcedures[id];
  const itemNames = (id: number) => deferred(id).items.map((item) => item.name);
  const itemCount = (id: number) => deferred(id).items.length;

  const cruise: TwoEnginesOutDeferredInputs = {
    jettisonArmPbOn: false,
    jettisonActivePbOn: false,
    engines1And2Out: true,
    flapsHandleIndex: 0,
    gearLeverDown: false,
    gravityExtensionDown: false,
    athrEngaged: true,
    groundSpoilersArmed: false,
  };

  it('the deferred procedures are registered and come from the two alerts', () => {
    expect(deferred(700700002).fromAbnormalProcs).toEqual(['701800159', '701800160']);
    expect(deferred(700700002).type).toBe(DeferredProcedureType.ALL_PHASES);
    expect(deferred(700700003).fromAbnormalProcs).toEqual(['701800159']);
    expect(deferred(700700004).fromAbnormalProcs).toEqual(['701800160']);
    const { core } = createFws(new Set());
    for (const id of [700700001, 700700002, 700700003, 700700004]) {
      expect(core.abnormalSensed.ewdDeferredProcs[id], String(id)).toBeDefined();
    }
  });

  it('one show / checked entry per item', () => {
    expect(itemCount(700700002)).toBe(TWO_ENGS_OUT_ALL_PHASES_ITEM_COUNT);
    expect(itemCount(700700003)).toBe(SAME_SIDE_APPROACH_ITEM_COUNT);
    expect(itemCount(700700004)).toBe(OPPOSITE_SIDE_APPROACH_ITEM_COUNT);
    for (const items of [
      twoEnginesOutAllPhasesItems(cruise),
      sameSideApproachItems(cruise),
      oppositeSideApproachItems(cruise),
    ]) {
      expect(items.show.length).toBe(items.checked.length);
    }
    expect(sameSideApproachItems(cruise).show.length).toBe(SAME_SIDE_APPROACH_ITEM_COUNT);
    expect(oppositeSideApproachItems(cruise).show.length).toBe(OPPOSITE_SIDE_APPROACH_ITEM_COUNT);
  });

  it('ALL PHASES: IF GW DECREASE RQRD: JETTISON ARM ON, JETTISON ACTIVE ON', () => {
    expect(twoEnginesOutAllPhasesItems(cruise).checked).toEqual([false, false, false]);
    expect(twoEnginesOutAllPhasesItems({ ...cruise, jettisonArmPbOn: true, jettisonActivePbOn: true }).checked).toEqual(
      [false, true, true],
    );
  });

  it('SAME SIDE: SLATS SLOW only with ENG 1+2 lost', () => {
    expect(sameSideApproachItems(cruise).show[7]).toBe(true);
    expect(sameSideApproachItems({ ...cruise, engines1And2Out: false }).show[7]).toBe(false);
    const names = itemNames(700700003);
    expect(names[names.indexOf('FLAPS SLOW') + 1]).toBe('SLATS SLOW');
  });

  it('SAME SIDE: the sensed lines follow the jettison, the flap lever, the gear, the A/THR and the ground spoilers', () => {
    const approach = sameSideApproachItems({
      ...cruise,
      flapsHandleIndex: 3,
      gearLeverDown: true,
      gravityExtensionDown: true,
      athrEngaged: false,
      groundSpoilersArmed: true,
    }).checked;
    for (const done of [1, 2, 13, 18, 20, 22, 26, 27, 28]) {
      expect(approach[done], `item ${done}`).toBe(true);
    }
    expect(approach[17]).toBe(false); // L/G LEVER UP once the lever is down
    const conf1 = sameSideApproachItems({ ...cruise, flapsHandleIndex: 1 }).checked;
    expect([conf1[13], conf1[22], conf1[26]]).toEqual([true, false, false]);
  });

  it('OPPOSITE SIDE: L/G LEVER DOWN at INITIAL APPROACH, no gravity extension, no A/THR line', () => {
    expect(itemNames(700700004).filter((name) => name.includes('GRVTY') || name.includes('A/THR'))).toEqual([]);
    const done = oppositeSideApproachItems({ ...cruise, flapsHandleIndex: 2, gearLeverDown: true }).checked;
    expect([done[11], done[12], done[14], done[17]]).toEqual([true, true, true, false]);
  });
});
