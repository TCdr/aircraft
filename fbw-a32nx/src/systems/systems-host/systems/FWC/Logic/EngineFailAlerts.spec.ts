// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { formatStatusPage } from '../../../../shared/src/StatusMessages';
import {
  CrossBleedSelector,
  EngineFailInputs,
  EngineFailMonitor,
  EngineShutDownLineInputs,
  engineFailLines,
  engineShutDownLines,
  engineShutDownStatus,
  isEngineFailGroundProcedure,
  isEngineShutDown,
} from './EngineFailAlerts';
import { installFwcSimVarMocks, runFwc } from '../PseudoFwcTestBed';
import { failureItem, isAlertTriggered, shownCodes, startCruiseFwc } from '../FwcAlertProbe';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

const IDLE_N2 = 65;

const running: EngineFailInputs = {
  masterOn: true,
  firePbPushed: false,
  engineRunning: true,
  n2Percent: 80,
  idleN2Percent: IDLE_N2,
};

/** A flamed out engine: the FADEC reports it shutting down, its N2 runs down to its windmilling speed */
const flamedOut: EngineFailInputs = { ...running, engineRunning: false, n2Percent: 12 };

function monitorAfter(...steps: [EngineFailInputs, number][]): EngineFailMonitor {
  const monitor = new EngineFailMonitor();
  for (const [inputs, seconds] of steps) {
    // 0.1 s steps
    for (let t = 0; t < seconds; t += 0.1) {
      monitor.update(inputs, 0.1);
    }
  }
  return monitor;
}

/* ENG 1(2) FAIL: the engine core speed is below idle, with the ENG MASTER lever ON and the ENG FIRE pb not pushed */
describe('ENG 1(2) FAIL trigger', () => {
  it('triggers when a running engine falls below idle with its master ON', () => {
    expect(monitorAfter([running, 10], [flamedOut, 1]).isActive).toBe(true);
  });

  it('does not trigger for an engine running at idle', () => {
    expect(monitorAfter([{ ...running, n2Percent: IDLE_N2 - 1 }, 60]).isActive).toBe(false);
  });

  it('does not trigger during an engine start (below idle, never run)', () => {
    expect(monitorAfter([{ ...flamedOut, n2Percent: 40 }, 60]).isActive).toBe(false);
  });

  it('does not trigger with the ENG FIRE pb pushed', () => {
    expect(monitorAfter([running, 10], [{ ...flamedOut, firePbPushed: true }, 1]).isActive).toBe(false);
  });

  it('ends with the ENG MASTER OFF and does not come back at the MASTER ON of a relight attempt', () => {
    const monitor = monitorAfter([running, 10], [flamedOut, 5], [{ ...flamedOut, masterOn: false }, 1]);
    expect(monitor.isActive).toBe(false);
    monitor.update(flamedOut, 0.1);
    expect(monitor.isActive).toBe(false);
  });

  it('ends when the engine is relit', () => {
    expect(monitorAfter([running, 10], [flamedOut, 5], [running, 1]).isActive).toBe(false);
  });

  /* the 30 s countdown starts when ENG 1(2) FAIL triggers */
  it('counts the 30 s of the relight attempt from the trigger of the alert', () => {
    expect(monitorAfter([running, 10], [flamedOut, 29]).relightWaitElapsed).toBe(false);
    expect(monitorAfter([running, 10], [flamedOut, 30.5]).relightWaitElapsed).toBe(true);
  });
});

/* ENG 1(2) SHUT DOWN: ENG master at OFF in phases 3 to 8, or ENG FIRE pb pushed in phases 1, 2, 9 and 10 */
describe('ENG 1(2) SHUT DOWN trigger', () => {
  it('triggers with the master OFF in phases 3 to 8 only', () => {
    for (let phase = 1; phase <= 10; phase++) {
      expect(isEngineShutDown(false, false, phase)).toBe(phase >= 3 && phase <= 8);
    }
  });

  it('triggers with the ENG FIRE pb pushed in phases 1, 2, 9 and 10 only', () => {
    for (let phase = 1; phase <= 10; phase++) {
      expect(isEngineShutDown(true, true, phase)).toBe([1, 2, 9, 10].includes(phase));
    }
  });

  it('does not trigger for a running engine', () => {
    expect(isEngineShutDown(true, false, 6)).toBe(false);
  });
});

/* ENG 1(2) FAIL procedure */
describe('ENG 1(2) FAIL procedure lines', () => {
  it('in flight: ENG MODE SEL IGN, THR LEVER IDLE and the 30 s condition during the relight attempt', () => {
    expect(
      engineFailLines({ flightPhase: 6, engModeSelIgn: false, thrLeverIdle: false, relightWaitElapsed: false }),
    ).toEqual([0, 1, 2, 3]);
  });

  it('in flight after 30 s: ENG MASTER OFF and the damage / no damage branches, with AGENT 1 after 10 s', () => {
    expect(
      engineFailLines({ flightPhase: 6, engModeSelIgn: true, thrLeverIdle: true, relightWaitElapsed: true }),
    ).toEqual([0, 3, 4, 5, 6, 7, 9, 10]);
  });

  it('on the ground: THR LEVER IDLE, ENG MASTER OFF, then the damage / no damage branches with AGENT 1 at once', () => {
    expect(
      engineFailLines({ flightPhase: 2, engModeSelIgn: false, thrLeverIdle: false, relightWaitElapsed: false }),
    ).toEqual([0, 2, 4, 5, 6, 8, 9, 10]);
  });

  it('uses the before takeoff / after landing procedure in phases 1-3 and 8-10, the in flight one in phases 4-7', () => {
    for (let phase = 1; phase <= 10; phase++) {
      expect(isEngineFailGroundProcedure(phase)).toBe(phase <= 3 || phase >= 8);
    }
  });
});

const shutDownInputs: EngineShutDownLineInputs = {
  engineNumber: 1,
  wingAntiIceOn: false,
  elecEmerConfig: false,
  firePbPushed: false,
  pack1On: true,
  pack2On: true,
  crossBleedSelector: CrossBleedSelector.Auto,
  engModeSelIgn: false,
  tcasModeTa: false,
  reverserUnlocked: false,
};

/* ENG 1(2) SHUT DOWN procedure */
describe('ENG 1(2) SHUT DOWN procedure lines', () => {
  it('without wing anti-ice nor fire: ENG MODE SEL IGN, IF NO FUEL LEAK: IMBALANCE MONITOR, TCAS MODE SEL TA', () => {
    expect(engineShutDownLines(shutDownInputs)).toEqual([0, 4, 5, 6, 7]);
  });

  it('with the wing anti-ice on: the pack of the affected side OFF and X BLEED OPEN', () => {
    expect(engineShutDownLines({ ...shutDownInputs, engineNumber: 2, wingAntiIceOn: true })).toEqual([
      0, 2, 3, 4, 5, 6, 7,
    ]);
  });

  it('with the wing anti-ice on in Elec Emer config: PACK 1 OFF', () => {
    expect(
      engineShutDownLines({ ...shutDownInputs, engineNumber: 2, wingAntiIceOn: true, elecEmerConfig: true }),
    ).toEqual([0, 1, 3, 4, 5, 6, 7]);
  });

  it('with the ENG FIRE pb pushed: X BLEED SHUT, WING ANTI ICE OFF, AVOID ICING CONDITIONS, no X BLEED OPEN', () => {
    expect(engineShutDownLines({ ...shutDownInputs, wingAntiIceOn: true, firePbPushed: true })).toEqual([
      0, 1, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it('removes the lines of the actions done', () => {
    expect(
      engineShutDownLines({
        ...shutDownInputs,
        wingAntiIceOn: true,
        pack1On: false,
        crossBleedSelector: CrossBleedSelector.Open,
        engModeSelIgn: true,
        tcasModeTa: true,
      }),
    ).toEqual([0, 5, 6]);
  });

  /* If REV unlocked: IF BUFFET: MAX SPEED 240 KT, after TCAS MODE SEL TA */
  it('with a reverser unlocked: IF BUFFET: MAX SPEED 240 KT', () => {
    expect(engineShutDownLines({ ...shutDownInputs, reverserUnlocked: true })).toEqual([0, 4, 5, 6, 7, 11, 12]);
    expect(engineShutDownLines({ ...shutDownInputs, reverserUnlocked: true, firePbPushed: true })).toEqual([
      0, 4, 5, 6, 7, 11, 12, 8, 10,
    ]);
  });
});

/* ENG 1(2) SHUT DOWN STATUS */
describe('ENG 1(2) SHUT DOWN STATUS', () => {
  it('engine 1 without fire: IF PERF PERMITS X BLEED OPEN, CONSIDER ENG 1 RELIGHT, CAT 3 SINGLE ONLY; INOP SYS', () => {
    const status = engineShutDownStatus(1, false, false, false);
    const page = formatStatusPage(status.left, status.inopSys);
    expect(page.left.split('\r')).toEqual([
      '\x1b<7mIF PERF PERMITS:',
      '\x1b<5mX BLEED...........OPEN',
      '\x1b<7mIF NO ENG 1 DAMAGE:',
      '\x1b<5mCONSIDER ENG 1 RELIGHT',
      '\x1b<3mCAT 3 SINGLE ONLY',
      '\x1b<3mONE PACK ONLY IF WAI ON',
    ]);
    expect(page.right.split('\r').slice(1)).toEqual([
      '\x1b<4mCAT 3 DUAL',
      '\x1b<4mENG 1 BLEED',
      '\x1b<4mPACK 1',
      '\x1b<4mMAIN GALLEY',
      '\x1b<4mGEN 1',
      '\x1b<4mG ENG 1 PUMP',
    ]);
  });

  it('engine 2 with the ENG FIRE pb pushed: AVOID ICING CONDITIONS and the severe ice lines, WING A. ICE inop', () => {
    const status = engineShutDownStatus(2, true, true, false);
    const page = formatStatusPage(status.left, status.inopSys);
    expect(page.left.split('\r').slice(0, 5)).toEqual([
      '\x1b<5mAVOID ICING CONDITIONS',
      '\x1b<7mIF SEVERE ICE ACCRETION:',
      '\x1b<5mMIN SPD....VLS+10/G DOT',
      '\x1b<5mMANEUVER WITH CARE',
      '\x1b<5mLDG DIST PROC....APPLY',
    ]);
    expect(page.left).not.toContain('IF PERF PERMITS');
    expect(page.left).toContain('CONSIDER ENG 2 RELIGHT');
    expect(page.right).toContain('Y ENG 2 PUMP');
    expect(page.right).toContain('WING A. ICE');
  });

  /* REV unlocked: the APPR PROC of the "1, 2 or 3 doors not stowed or reverser detected unlocked" case: the reverser
   * of the FBW failure is unlocked, not deployed */
  it('with a reverser unlocked: MAX SPEED 300/.78 and the APPR PROC IF BUFFET lines', () => {
    const status = engineShutDownStatus(1, false, false, true);
    const left = formatStatusPage(status.left, status.inopSys).left.split('\r');
    expect(left).toEqual([
      '\x1b<5mMAX SPEED.......300/.78',
      '\x1b<7mAPPR PROC:',
      '\x1b<7mIF BUFFET:',
      '\x1b<5mFOR LDG......USE FLAP 3',
      '\x1b<5mGPWS LDG FLAP 3......ON',
      '\x1b<5mAPPR SPD.....VREF+10 KT',
      '\x1b<5mLDG DIST PROC....APPLY',
      '\x1b<7mIF PERF PERMITS:',
      '\x1b<5mX BLEED...........OPEN',
      '\x1b<7mIF NO ENG 1 DAMAGE:',
      '\x1b<5mCONSIDER ENG 1 RELIGHT',
      '\x1b<3mCAT 3 SINGLE ONLY',
      '\x1b<3mONE PACK ONLY IF WAI ON',
    ]);
  });

  it('without a reverser unlocked: no MAX SPEED nor APPR PROC line', () => {
    const status = engineShutDownStatus(1, false, false, false);
    expect(formatStatusPage(status.left, status.inopSys).left).not.toMatch(/MAX SPEED|APPR PROC|IF BUFFET/);
  });

  it('with the wing anti-ice on and no fire: no X BLEED line', () => {
    const status = engineShutDownStatus(1, false, true, false);
    expect(formatStatusPage(status.left, status.inopSys).left).not.toContain('X BLEED');
  });
});

describe('the real FWC: ENG 1(2) FAIL / SHUT DOWN', () => {
  const ENGINE_1_FAIL = '7700101';
  const ENGINE_2_FAIL = '7700102';
  const ENGINE_1_SHUT_DOWN = '7700111';
  const ENGINE_2_SHUT_DOWN = '7700112';
  const ALL_ENGINES_FAILURE = '7700027';
  const LAND_ASAP_AMBER = '0000360';
  const FAILED_CORE_N2 = 20;

  let simvars: Map<string, number>;

  beforeEach(() => {
    ({ simvars } = installFwcSimVarMocks());
  });

  const startWithIdleN2 = () =>
    startCruiseFwc(simvars, () => {
      simvars.set('L:A32NX_ENGINE_IDLE_N2', IDLE_N2);
    });

  const publishMaster = (bus: EventBus, engine: 1 | 2, on: boolean) => {
    bus.getPublisher<any>().pub(`engine${engine}Master`, on ? 1 : 0, false, true);
  };

  it('has the four amber alerts on the ENG page, without flight phase inhibition', () => {
    const { fwc } = startWithIdleN2();
    for (const key of [ENGINE_1_FAIL, ENGINE_2_FAIL, ENGINE_1_SHUT_DOWN, ENGINE_2_SHUT_DOWN]) {
      const item = failureItem(fwc, key);
      expect(item.failure, key).toBe(2);
      expect(item.sysPage, key).toBe(EcamSysPage.ENG);
      expect(item.flightPhaseInhib, key).toEqual([]);
    }
  });

  it('ENG 1 FAIL follows the core speed of engine 1 only, and calls LAND ASAP (amber)', () => {
    const { fwc } = startWithIdleN2();
    expect(isAlertTriggered(fwc, ENGINE_1_FAIL)).toBe(false);
    expect(fwc.ewdMessageMemos[LAND_ASAP_AMBER].simVarIsActive.get()).toBe(false);

    simvars.set('L:A32NX_ENGINE_N2:1', FAILED_CORE_N2);
    runFwc(fwc, 1);
    expect(isAlertTriggered(fwc, ENGINE_1_FAIL)).toBe(true);
    expect(isAlertTriggered(fwc, ENGINE_2_FAIL)).toBe(false);
    expect(fwc.ewdMessageMemos[LAND_ASAP_AMBER].simVarIsActive.get()).toBe(true);
  });

  it('ENG 2 SHUT DOWN follows the ENG MASTER 2 in cruise and calls LAND ASAP (amber)', () => {
    const { fwc, bus } = startWithIdleN2();
    publishMaster(bus, 2, false);
    runFwc(fwc, 1);
    expect(isAlertTriggered(fwc, ENGINE_2_SHUT_DOWN)).toBe(true);
    expect(isAlertTriggered(fwc, ENGINE_1_SHUT_DOWN)).toBe(false);
    expect(fwc.ewdMessageMemos[LAND_ASAP_AMBER].simVarIsActive.get()).toBe(true);
  });

  it.each([
    [1, ENGINE_1_SHUT_DOWN],
    [2, ENGINE_2_SHUT_DOWN],
  ])('the procedure and the STATUS of ENG %i SHUT DOWN get the unlocked reverser of that engine', (engine, key) => {
    const { fwc, bus } = startWithIdleN2();
    publishMaster(bus, engine as 1 | 2, false);
    runFwc(fwc, 1);
    const item = failureItem(fwc, key);
    const procedureWithoutReverser = shownCodes(fwc, key);
    const statusWithoutReverser = item.statusInfo?.();
    expect(statusWithoutReverser).toEqual(engineShutDownStatus(engine as 1 | 2, false, false, false).left);

    simvars.set(`L:A32NX_REVERSER_${engine}_UNLOCKED`, 1);
    runFwc(fwc, 1);
    expect(item.statusInfo?.()).toEqual(engineShutDownStatus(engine as 1 | 2, false, false, true).left);
    expect(item.statusInfo?.()).not.toEqual(statusWithoutReverser);
    expect(shownCodes(fwc, key).length).toBeGreaterThan(procedureWithoutReverser.length);
  });

  it('inhibits ALL ENGINES FAILURE in the flight phases 1-4 and 8-10', () => {
    const { fwc } = startWithIdleN2();
    expect(failureItem(fwc, ALL_ENGINES_FAILURE).flightPhaseInhib).toEqual([1, 2, 3, 4, 8, 9, 10]);
  });

  it('replaces the single engine alerts by ALL ENGINES FAILURE', () => {
    const { fwc, bus } = startWithIdleN2();
    simvars.set('L:A32NX_ENGINE_N2:1', FAILED_CORE_N2);
    simvars.set('L:A32NX_ENGINE_N2:2', FAILED_CORE_N2);
    runFwc(fwc, 1);
    expect(isAlertTriggered(fwc, ALL_ENGINES_FAILURE)).toBe(true);
    expect(isAlertTriggered(fwc, ENGINE_1_FAIL)).toBe(false);
    expect(isAlertTriggered(fwc, ENGINE_2_FAIL)).toBe(false);

    // both ENG MASTER at OFF with the fuel valves closed: the dual failure takes the SHUT DOWN alerts as well
    simvars.set('L:A32NX_ENGINE_N2:1', 90);
    simvars.set('L:A32NX_ENGINE_N2:2', 90);
    for (const engine of [1, 2] as const) {
      publishMaster(bus, engine, false);
      bus.getPublisher<any>().pub(`fuel_valve_switch_${engine}`, false, false, true);
    }
    runFwc(fwc, 1);
    expect(isAlertTriggered(fwc, ALL_ENGINES_FAILURE)).toBe(true);
    expect(isAlertTriggered(fwc, ENGINE_1_SHUT_DOWN)).toBe(false);
    expect(isAlertTriggered(fwc, ENGINE_2_SHUT_DOWN)).toBe(false);
  });
});
