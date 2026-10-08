// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  allEngFlameOutInhibitsElecEmerConfig,
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

describe('ENG 1(2)(3)(4) FAIL memory (A380 FCOM PRO-ABN-ECAM-10-70 l.171718)', () => {
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

  // The engines 3 and 4 took "master ON and not STARTING" for "was running" (FwsCore before 2026-10-05): the attempts
  // below raised ENG 3(4) FAIL, not ENG 1(2) FAIL.
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

describe('FwsCore wiring of the engine failure logic', () => {
  const fwsCore = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');

  it('feeds the four engines to the same ENG FAIL logic', () => {
    expect(fwsCore).toContain('private readonly engineFailMonitors = [1, 2, 3, 4].map(() => new EngineFailMonitor());');
    for (const engine of [1, 2, 3, 4]) {
      expect(fwsCore).toContain(
        `[this.engine${engine}Master, this.fireButtonEng${engine}, this.engine${engine}State, this.HPNEng${engine}],`,
      );
    }
    expect(fwsCore).not.toMatch(
      /engine[34]Master\.get\(\) && this\.engine[34]State\.get\(\) !== engineState\.STARTING/,
    );
  });

  it('reads the thrust lever of engines 3 and 4 for their THR LEVER IDLE lines', () => {
    expect(fwsCore).toContain('thrustLever3Idle = this.throttle3Position.map');
    expect(fwsCore).toContain('thrustLever4Idle = this.throttle4Position.map');
  });
});

describe('ENG FAIL: RELIGHT PROC CONSIDER or APPLY (l.171867-171872)', () => {
  it('APPLY when more than two engines failed', () => {
    expect(relightProcMustBeApplied([true, false, false, false])).toBe(false);
    expect(relightProcMustBeApplied([true, true, false, false])).toBe(false);
    expect(relightProcMustBeApplied([true, true, false, true])).toBe(true);
  });

  const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
  const ata70 = readFileSync(
    resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata70.ts'),
    'utf-8',
  );
  /** One procedure of ata70.ts, from its id to the end of its object */
  const block = (source: string, id: number) => {
    const start = source.indexOf(`  ${id}: {`);
    return source.slice(start, source.indexOf('\n  },', start));
  };

  it.each([701800029, 701800030, 701800031, 701800032])(
    '%s has the APPLY line after the CONSIDER line, and one show / checked entry per item',
    (id) => {
      const items = block(ata70, id).match(/\{ name: /g) ?? [];
      expect(items.length).toBe(24);
      expect(block(ata70, id)).toMatch(
        /RELIGHT PROC', sensed: false, labelNotCompleted: 'CONSIDER', level: 1 \},\s*\{ name: 'ENG \d RELIGHT PROC', sensed: false, labelNotCompleted: 'APPLY'/,
      );

      const entry = abnormalSensed.slice(abnormalSensed.indexOf(`    ${id}: {`));
      const list = (name: string) =>
        entry
          .slice(entry.indexOf(`${name}: () => [`), entry.indexOf('      ],', entry.indexOf(`${name}: () => [`)))
          .split('\n')
          .slice(1)
          .filter((line) => line.trim().endsWith(','));
      expect(list('whichItemsToShow').length).toBe(24);
      expect(list('whichItemsChecked').length).toBe(24);
      expect(list('whichItemsToShow')[12]).toContain('!this.fws.engineRelightProcApply.get()');
      expect(list('whichItemsToShow')[13]).toContain('&& this.fws.engineRelightProcApply.get()');
    },
  );
});

describe('ENG TWO ENGS OUT ON SAME / OPPOSITE SIDE (l.175224, 175477)', () => {
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

describe('ENG SHUT DOWN STATUS (l.172777-172795)', () => {
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

describe('ENG TWO ENGS OUT STATUS (l.175434-175454, 175614-175632)', () => {
  const out = (...engines: number[]): EnginesOut =>
    [1, 2, 3, 4].map((engine) => engines.includes(engine)) as unknown as EnginesOut;
  const fwsCore = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');
  const inopSys = readFileSync(resolve(__dirname, 'FwsInopSys.ts'), 'utf-8');
  const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
  /** One entry of a FWS dictionary, from its key to the end of its object */
  const entry = (source: string, key: number) => {
    const start = source.indexOf(`    ${key}: {`);
    expect(start).toBeGreaterThan(0);
    return source.slice(start, source.indexOf('\n    },', start));
  };

  it('the two engines of a side out lose the hydraulic system of that side (DSC-29-10)', () => {
    expect(hydraulicSystemsLostByEnginesOut(out(1, 2))).toEqual({ green: true, yellow: false });
    expect(hydraulicSystemsLostByEnginesOut(out(3, 4))).toEqual({ green: false, yellow: true });
    expect(hydraulicSystemsLostByEnginesOut(out(1, 3))).toEqual({ green: false, yellow: false });
    expect(hydraulicSystemsLostByEnginesOut(out(1, 2, 3, 4))).toEqual({ green: true, yellow: true });
  });

  it('same side: G(Y) HYD SYS and PART SPLRs, no ENG PMP A+B line of the lost system', () => {
    expect(fwsCore).toContain('const hydraulicSystemsLost = hydraulicSystemsLostByEnginesOut(enginesOut);');
    expect(entry(inopSys, 290300021)).toContain('simVarIsActive: this.fws.greenHydSysInop,');
    expect(entry(inopSys, 290300022)).toContain('simVarIsActive: this.fws.yellowHydSysInop,');
    expect(inopSys).toMatch(
      /partSplrs = MappedSubject\.create\(\s*SubscribableMapFunctions\.or\(\),\s*this\.fws\.greenHydSysInop,\s*this\.fws\.yellowHydSysInop,/,
    );
    for (const [engine, system] of [
      [1, 'green'],
      [2, 'green'],
      [3, 'yellow'],
      [4, 'yellow'],
    ]) {
      expect(fwsCore).toMatch(
        new RegExp(
          `eng${engine}HydraulicInop = MappedSubject\\.create\\(\\s*\\(\\[genInop, systemLost\\]\\) => genInop && !systemLost,\\s*this\\.gen${engine}Inop,\\s*this\\.${system}HydSysLostByEnginesOut,`,
        ),
      );
    }
  });

  it('same side: PART L/G RETRACTION and the PACK of the failed side', () => {
    expect(entry(abnormalSensed, 701800159)).toContain(
      "inopSysAllPhases: () => ['320300023', this.fws.twoEnginesOutLeftSide.get() ? '210300009' : '210300010'],",
    );
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

    for (const [key, pair] of [
      [240300039, '13'],
      [240300040, '14'],
      [240300041, '23'],
      [240300042, '24'],
    ] as const) {
      expect(entry(inopSys, key)).toContain(`simVarIsActive: this.gen${pair}Inop,`);
    }
    // GEN 1 is not shown with GEN 1+2, 1+3 or 1+4
    expect(entry(inopSys, 240300010)).toContain("notActiveWhenItemActive: ['240300037', '240300039', '240300040'],");
    expect(entry(inopSys, 240300013)).toContain("notActiveWhenItemActive: ['240300038', '240300040', '240300042'],");
  });
});

describe('ENG ALL ENG FLAME OUT inhibits ELEC EMER CONFIG while it is shown (l.173795)', () => {
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
