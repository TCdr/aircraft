// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { NXLogicMemoryNode } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';
import { entrySource, expectCode, readSource, runFwsCoreStatement } from './FwsSpecSource';

const core = readSource('FwsCore.ts');
const abnormalSensed = readSource('FwsAbnormalSensed.ts');
const inopSys = readSource('FwsInopSys.ts');

const FAILURE_STATEMENT_START = '[0, 1].forEach((system) => {\n      const [hsmu,';

interface HydOptions {
  onGround?: boolean;
  greenOverheat?: boolean;
  yellowOverheat?: boolean;
  tempExcess?: boolean[];
}

const newMemory = (): Record<number, NXLogicMemoryNode> => ({
  0: new NXLogicMemoryNode(false),
  1: new NXLogicMemoryNode(false),
});

/**
 * Runs the HSMU / heat exchanger / overheat detection statement of FwsCore.update with the given active failures.
 * `memory` carries the fuel heat exchanger latches from one call to the next.
 */
function runHydFailures(active: number[], options: HydOptions = {}, memory = newMemory()) {
  return runFwsCoreStatement(
    core,
    FAILURE_STATEMENT_START,
    {
      failuresConsumer: { isActive: (failure: number) => active.includes(failure) },
      aircraftOnGround: options.onGround ?? false,
      greenRsvOverheat: options.greenOverheat ?? false,
      yellowRsvOverheat: options.yellowOverheat ?? false,
      hydSysOvht: [false, false],
      hydSysTempExcessHi: [false, false],
      hydFuelHeatExchangerValveFault: [false, false],
      hydHeatExchangerAirLeak: [false, false],
      hydHeatExchangerAirLeakDetFault: [false, false],
      hydOverheatDetFault: [false, false],
      hydOverheatDetChannelFault: [false, false, false, false],
      hydSysCoolingFault: [false, false],
      hydSysMonitoringFault: [false, false],
      hydFuelHeatExchangerUsed: memory,
    },
    { A380Failure, hydTempExcess: options.tempExcess ?? [false, false] },
  ) as Record<string, boolean[]>;
}

/* HYD G (Y) SYS MONITORING FAULT: the HSMU of the system failed */
describe('HYD G (Y) SYS MONITORING FAULT', () => {
  it('is raised by the HSMU failure of its own system only', () => {
    expect(runHydFailures([A380Failure.GreenHsmu]).hydSysMonitoringFault).toEqual([true, false]);
    expect(runHydFailures([A380Failure.YellowHsmu]).hydSysMonitoringFault).toEqual([false, true]);
    expect(runHydFailures([]).hydSysMonitoringFault).toEqual([false, false]);
  });
});

/* HYD G (Y) FUEL HEAT EXCHANGER VLV FAULT: the valve is abnormally open or closed */
describe('HYD G (Y) FUEL HEAT EXCHANGER VLV FAULT', () => {
  it('is raised by the fuel/hydraulic heat exchanger valve failure of its own system', () => {
    expect(runHydFailures([A380Failure.GreenFuelHeatExchangerValve]).hydFuelHeatExchangerValveFault).toEqual([
      true,
      false,
    ]);
    expect(runHydFailures([A380Failure.YellowFuelHeatExchangerValve]).hydFuelHeatExchangerValveFault).toEqual([
      false,
      true,
    ]);
  });
});

/* HEAT EXCHANGER AIR LEAK needs the leak detection, whose own failure is HEAT EXCHANGER AIR LEAK DET FAULT */
describe('HYD G (Y) HEAT EXCHANGER AIR LEAK and AIR LEAK DET FAULT', () => {
  it('raises the air leak with a working detection', () => {
    const states = runHydFailures([A380Failure.YellowHeatExchangerAirLeak]);
    expect(states.hydHeatExchangerAirLeak).toEqual([false, true]);
    expect(states.hydHeatExchangerAirLeakDetFault).toEqual([false, false]);
  });

  it('does not detect the leak once the detection failed, and raises the detection fault', () => {
    const states = runHydFailures([
      A380Failure.GreenHeatExchangerAirLeak,
      A380Failure.GreenHeatExchangerAirLeakDetection,
    ]);
    expect(states.hydHeatExchangerAirLeak).toEqual([false, false]);
    expect(states.hydHeatExchangerAirLeakDetFault).toEqual([true, false]);
  });
});

/* SYS CHAN A or B OVHT DET FAULT (one channel), SYS OVHT DET FAULT (all sensors) */
describe('HYD G (Y) overheat detection faults', () => {
  it('raises the channel alert of the failed channel only while the other channel works', () => {
    expect(runHydFailures([A380Failure.GreenOverheatDetectionChannelA]).hydOverheatDetChannelFault).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect(runHydFailures([A380Failure.YellowOverheatDetectionChannelB]).hydOverheatDetChannelFault).toEqual([
      false,
      false,
      false,
      true,
    ]);
  });

  it('raises SYS OVHT DET FAULT instead of the channel alerts when both channels failed', () => {
    const states = runHydFailures([
      A380Failure.GreenOverheatDetectionChannelA,
      A380Failure.GreenOverheatDetectionChannelB,
    ]);
    expect(states.hydOverheatDetFault).toEqual([true, false]);
    expect(states.hydOverheatDetChannelFault).toEqual([false, false, false, false]);
  });
});

/* With the HSMU failed, or all overheat sensors failed, the overheat detection is lost */
describe('HYD G (Y) SYS OVHT and SYS TEMP EXCESS HI detection', () => {
  it('raises SYS OVHT with the overheat and a working detection', () => {
    expect(runHydFailures([], { greenOverheat: true }).hydSysOvht).toEqual([true, false]);
    expect(runHydFailures([], { yellowOverheat: true }).hydSysOvht).toEqual([false, true]);
  });

  it('raises SYS OVHT with one overheat detection channel left', () => {
    expect(runHydFailures([A380Failure.GreenOverheatDetectionChannelA], { greenOverheat: true }).hydSysOvht).toEqual([
      true,
      false,
    ]);
  });

  it.each([
    ['the HSMU failed', [A380Failure.GreenHsmu]],
    ['both channels failed', [A380Failure.GreenOverheatDetectionChannelA, A380Failure.GreenOverheatDetectionChannelB]],
  ])('loses SYS OVHT and SYS TEMP EXCESS HI when %s', (_name, failures) => {
    const states = runHydFailures(failures, { greenOverheat: true, tempExcess: [true, false] });
    expect(states.hydSysOvht).toEqual([false, false]);
    expect(states.hydSysTempExcessHi).toEqual([false, false]);
  });

  it('raises SYS TEMP EXCESS HI from the heat damage of its own system', () => {
    expect(runHydFailures([], { tempExcess: [false, true] }).hydSysTempExcessHi).toEqual([false, true]);
  });

  it('reads the reservoir and the 4 engine pumps of each system as the heat damage', () => {
    expect(core).toContain('L:A32NX_HYD_${color}_RESERVOIR_TEMP_EXCESS');
    expect(core).toContain('L:A32NX_HYD_${pump}_EDPUMP_TEMP_EXCESS');
    expectCode(
      core,
      "reservoirTempExcess('GREEN') || ['GREEN_1A', 'GREEN_1B', 'GREEN_2A', 'GREEN_2B'].some(enginePumpTempExcess)",
    );
    expectCode(
      core,
      "reservoirTempExcess('YELLOW') || ['YELLOW_3A', 'YELLOW_3B', 'YELLOW_4A', 'YELLOW_4B'].some(enginePumpTempExcess)",
    );
  });
});

/* SYS COOLING FAULT: the fuel/hydraulic heat exchanger was used during the previous flight */
describe('HYD G (Y) SYS COOLING FAULT', () => {
  it('is raised on the ground after a flight with an air/hydraulic heat exchanger failure', () => {
    const memory = newMemory();
    const failed = [A380Failure.GreenAirHeatExchanger];
    expect(runHydFailures(failed, { onGround: true }, memory).hydSysCoolingFault).toEqual([false, false]);
    runHydFailures(failed, { onGround: false }, memory);
    expect(runHydFailures(failed, { onGround: true }, memory).hydSysCoolingFault).toEqual([true, false]);
  });

  it('is not raised without an air/hydraulic heat exchanger failure in flight', () => {
    const memory = newMemory();
    runHydFailures([], { onGround: false }, memory);
    expect(runHydFailures([], { onGround: true }, memory).hydSysCoolingFault).toEqual([false, false]);
  });

  it('stays raised until the failure is cleared on the ground', () => {
    const memory = newMemory();
    const failed = [A380Failure.YellowAirHeatExchanger];
    runHydFailures(failed, { onGround: false }, memory);
    expect(runHydFailures(failed, { onGround: true }, memory).hydSysCoolingFault).toEqual([false, true]);
    expect(runHydFailures([], { onGround: true }, memory).hydSysCoolingFault).toEqual([false, false]);
  });

  it('is not shown in flight', () => {
    const memory = newMemory();
    const failed = [A380Failure.GreenAirHeatExchanger];
    runHydFailures(failed, { onGround: false }, memory);
    expect(runHydFailures(failed, { onGround: false }, memory).hydSysCoolingFault).toEqual([false, false]);
  });
});

/* The ECAM entries: ids, subjects, class and SD page */
describe('HYD G (Y) heat exchanger, HSMU and overheat detection ECAM entries', () => {
  it.each([
    ['290800013', 'hydFuelHeatExchangerValveFault[0]', 2, 'Fctl'],
    ['290800014', 'hydFuelHeatExchangerValveFault[1]', 2, 'Fctl'],
    ['290800015', 'hydHeatExchangerAirLeak[0]', 1, 'Hyd'],
    ['290800016', 'hydHeatExchangerAirLeak[1]', 1, 'Hyd'],
    ['290800017', 'hydHeatExchangerAirLeakDetFault[0]', 1, 'Hyd'],
    ['290800018', 'hydHeatExchangerAirLeakDetFault[1]', 1, 'Hyd'],
    ['290800023', 'hydOverheatDetChannelFault[0]', 1, 'None'],
    ['290800024', 'hydOverheatDetChannelFault[1]', 1, 'None'],
    ['290800025', 'hydOverheatDetChannelFault[2]', 1, 'None'],
    ['290800026', 'hydOverheatDetChannelFault[3]', 1, 'None'],
    ['290800027', 'hydSysCoolingFault[0]', 1, 'None'],
    ['290800028', 'hydSysCoolingFault[1]', 1, 'None'],
    ['290800029', 'hydSysMonitoringFault[0]', 1, 'None'],
    ['290800030', 'hydSysMonitoringFault[1]', 1, 'None'],
    ['290800033', 'hydOverheatDetFault[0]', 1, 'None'],
    ['290800034', 'hydOverheatDetFault[1]', 1, 'None'],
    ['290800037', 'hydSysTempExcessHi[0]', 2, 'Hyd'],
    ['290800038', 'hydSysTempExcessHi[1]', 2, 'Hyd'],
  ])('%s is driven by %s with failure class %i on the %s SD page', (id, subject, failure, page) => {
    const entry = entrySource(abnormalSensed, id);
    expect(entry).toContain(`simVarIsActive: this.fws.${subject},`);
    expect(entry).toContain(`failure: ${failure},`);
    expect(entry).toContain(`sysPage: SdPages.${page},`);
  });

  it('SYS OVHT is driven by the detection-gated subject and replaced by SYS TEMP EXCESS HI', () => {
    expect(entrySource(abnormalSensed, '290800031')).toContain('simVarIsActive: this.fws.hydSysOvht[0],');
    expect(entrySource(abnormalSensed, '290800031')).toContain("notActiveWhenItemActive: ['290800037']");
    expect(entrySource(abnormalSensed, '290800032')).toContain('simVarIsActive: this.fws.hydSysOvht[1],');
    expect(entrySource(abnormalSensed, '290800032')).toContain("notActiveWhenItemActive: ['290800038']");
  });

  it('SYS TEMP EXCESS HI always shows the two ENG PMP A+B DISC lines, the elec pump line only on the ground', () => {
    const entry = entrySource(abnormalSensed, '290800037').replace(/\s+/g, ' ');
    const shown = entry.split('whichItemsToShow')[1].split('whichItemsChecked')[0];
    expect(shown).toContain(
      'this.fws.engine1Running.get(), this.fws.engine2Running.get(), true, true, this.fws.enginesOffAndOnGroundSignal.read()',
    );
  });
});

describe('HYD G (Y) INOP SYS and REDUND LOSS lines', () => {
  it.each([
    ['290300013', 'hydOverheatDetChannelFault[0]', true],
    ['290300014', 'hydOverheatDetChannelFault[1]', true],
    ['290300015', 'hydOverheatDetChannelFault[2]', true],
    ['290300016', 'hydOverheatDetChannelFault[3]', true],
    ['290300017', 'hydSysMonitoringFault[0]', false],
    ['290300018', 'hydSysMonitoringFault[1]', false],
    ['290300019', 'hydOverheatDetFault[0]', false],
    ['290300020', 'hydOverheatDetFault[1]', false],
  ])('%s follows %s (REDUND LOSS: %s)', (id, subject, redundancyLoss) => {
    const entry = inopSysEntry(id);
    expect(entry).toContain(`simVarIsActive: this.fws.${subject}`);
    expect(entry.includes('redundancyLoss: true')).toBe(redundancyLoss);
  });
});

/** The FwsInopSys entry `id: {` up to its closing brace, on one line */
function inopSysEntry(id: string): string {
  const start = inopSys.indexOf(`    ${id}: {`);
  expect(start).toBeGreaterThan(0);
  return inopSys.slice(start, inopSys.indexOf('},', start)).replace(/\s+/g, ' ');
}
