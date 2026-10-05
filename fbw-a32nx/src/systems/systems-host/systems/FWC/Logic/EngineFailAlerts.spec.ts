// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
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

/* A320 FCOM PRO-ABN-ENG ENG 1(2) FAIL, a320_fcom.txt l.79767: "This alert triggers when the engine core speed is below
 * idle, with the ENG MASTER lever set to ON, and ENG FIRE pb not pushed." */
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

  /* l.79851: "The 30 s countdown starts as soon as the ENG 1(2) FAIL alert is triggered." */
  it('counts the 30 s of the relight attempt from the trigger of the alert', () => {
    expect(monitorAfter([running, 10], [flamedOut, 29]).relightWaitElapsed).toBe(false);
    expect(monitorAfter([running, 10], [flamedOut, 30.5]).relightWaitElapsed).toBe(true);
  });
});

/* l.81066-81067: "This alert triggers when ENG master is at off in phases 3 to 8, or ENG FIRE pb is pushed in phases 1,
 * 2, 9 and 10." */
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

/* l.79797-79881 */
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
};

/* l.81087-81123 */
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
});

/* l.81168-81264 */
describe('ENG 1(2) SHUT DOWN STATUS', () => {
  it('engine 1 without fire: IF PERF PERMITS X BLEED OPEN, CONSIDER ENG 1 RELIGHT, CAT 3 SINGLE ONLY; INOP SYS', () => {
    const status = engineShutDownStatus(1, false, false);
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
    const status = engineShutDownStatus(2, true, true);
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

  it('with the wing anti-ice on and no fire: no X BLEED line', () => {
    const status = engineShutDownStatus(1, false, true);
    expect(formatStatusPage(status.left, status.inopSys).left).not.toContain('X BLEED');
  });
});

describe('PseudoFWC wiring of ENG 1(2) FAIL / SHUT DOWN', () => {
  const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf-8');
  const block = (key: string) => {
    const start = fwc.indexOf(`    ${key}: {`);
    return fwc.slice(start, fwc.indexOf('\n    },', start));
  };

  it('has the four amber alerts on the ENG page', () => {
    for (const key of ['7700101', '7700102', '7700111', '7700112']) {
      expect(block(key)).toContain('failure: 2,');
      expect(block(key)).toContain('sysPage: EcamSysPage.ENG,');
      expect(block(key)).toContain('flightPhaseInhib: [],');
    }
    expect(block('7700111')).toContain('engineShutDownStatus(1,');
    expect(block('7700112')).toContain('engineShutDownStatus(2,');
  });

  it('calls LAND ASAP (amber) with ENG FAIL and SHUT DOWN', () => {
    const landAsap = block("'0000360'");
    expect(landAsap).toContain('eng1Fail || eng2Fail || eng1ShutDown || eng2ShutDown');
  });

  it('inhibits ALL ENGINES FAILURE in the FCOM phases 1-4 and 8-10', () => {
    expect(block('7700027')).toContain('flightPhaseInhib: [1, 2, 3, 4, 8, 9, 10],');
  });

  it('replaces the single engine alerts by ALL ENGINES FAILURE', () => {
    expect(fwc).toContain('this.engine1Fail.set(this.engine1FailMonitor.isActive && !allEnginesFailed);');
    expect(fwc).toMatch(/this\.engine2ShutDown\.set\(isEngineShutDown\([^;]*\) && !allEnginesFailed\);/);
  });
});
