// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Subject } from '@microsoft/msfs-sdk';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';
import { SdPages } from '@shared/EcamSystemPages';
import { createFws, runFwsCycle } from './FwsSpecFixture';

/** Both systems' states of one FwsCore hydraulic signal: [green, yellow], or the 4 channels */
type SignalArray = Subject<boolean>[];

interface HydOptions {
  onGround?: boolean;
  greenOverheat?: boolean;
  yellowOverheat?: boolean;
  /** Reservoir temperature excess per system */
  tempExcess?: boolean[];
}

/** The real FwsCore with the given flyPad failures active, run until the ground logic is settled */
function createHydFws(active: number[] = []) {
  const activeFailures = new Set<number>(active);
  const fixture = createFws(activeFailures);
  const { core, simVars } = fixture;

  /** On the runway (RAs and a main gear of each LGCIU compressed) or in the air at 500 ft */
  const setGround = (onGround: boolean) => {
    const radioAltitude = Arinc429Word.getRawWord(onGround ? 0 : 500, Arinc429SignStatusMatrix.NormalOperation);
    for (const ra of [1, 2, 3]) {
      simVars.set(`L:A32NX_RA_${ra}_RADIO_ALTITUDE`, radioAltitude);
    }
    simVars.set('L:A32NX_ELEC_DC_ESS_BUS_IS_POWERED', 1);
    simVars.set('L:A32NX_ELEC_DC_2_BUS_IS_POWERED', 1);
    simVars.set('L:A32NX_LGCIU_1_LEFT_GEAR_COMPRESSED', onGround ? 1 : 0);
    simVars.set('L:A32NX_LGCIU_2_LEFT_GEAR_COMPRESSED', onGround ? 1 : 0);
  };

  const run = (options: HydOptions = {}) => {
    setGround(options.onGround ?? false);
    simVars.set('L:A32NX_HYD_GREEN_RESERVOIR_OVHT', options.greenOverheat ?? false);
    simVars.set('L:A32NX_HYD_YELLOW_RESERVOIR_OVHT', options.yellowOverheat ?? false);
    simVars.set('L:A32NX_HYD_GREEN_RESERVOIR_TEMP_EXCESS', options.tempExcess?.[0] ?? false);
    simVars.set('L:A32NX_HYD_YELLOW_RESERVOIR_TEMP_EXCESS', options.tempExcess?.[1] ?? false);
    // the ground state needs its confirmation time
    for (let step = 0; step < 30; step++) {
      runFwsCycle(core);
    }
  };

  const states = (signals: SignalArray) => signals.map((signal) => signal.get());
  return { core, simVars, activeFailures, run, states };
}

/* HYD G (Y) SYS MONITORING FAULT: the HSMU of the system failed */
describe('HYD G (Y) SYS MONITORING FAULT', () => {
  it('is raised by the HSMU failure of its own system only', () => {
    const green = createHydFws([A380Failure.GreenHsmu]);
    green.run();
    expect(green.states(green.core.hydSysMonitoringFault)).toEqual([true, false]);
    const yellow = createHydFws([A380Failure.YellowHsmu]);
    yellow.run();
    expect(yellow.states(yellow.core.hydSysMonitoringFault)).toEqual([false, true]);
    const none = createHydFws();
    none.run();
    expect(none.states(none.core.hydSysMonitoringFault)).toEqual([false, false]);
  });
});

/* HYD G (Y) FUEL HEAT EXCHANGER VLV FAULT: the valve is abnormally open or closed */
describe('HYD G (Y) FUEL HEAT EXCHANGER VLV FAULT', () => {
  it('is raised by the fuel/hydraulic heat exchanger valve failure of its own system', () => {
    const green = createHydFws([A380Failure.GreenFuelHeatExchangerValve]);
    green.run();
    expect(green.states(green.core.hydFuelHeatExchangerValveFault)).toEqual([true, false]);
    const yellow = createHydFws([A380Failure.YellowFuelHeatExchangerValve]);
    yellow.run();
    expect(yellow.states(yellow.core.hydFuelHeatExchangerValveFault)).toEqual([false, true]);
  });
});

/* HEAT EXCHANGER AIR LEAK needs the leak detection, whose own failure is HEAT EXCHANGER AIR LEAK DET FAULT */
describe('HYD G (Y) HEAT EXCHANGER AIR LEAK and AIR LEAK DET FAULT', () => {
  it('raises the air leak with a working detection', () => {
    const fws = createHydFws([A380Failure.YellowHeatExchangerAirLeak]);
    fws.run();
    expect(fws.states(fws.core.hydHeatExchangerAirLeak)).toEqual([false, true]);
    expect(fws.states(fws.core.hydHeatExchangerAirLeakDetFault)).toEqual([false, false]);
  });

  it('does not detect the leak once the detection failed, and raises the detection fault', () => {
    const fws = createHydFws([A380Failure.GreenHeatExchangerAirLeak, A380Failure.GreenHeatExchangerAirLeakDetection]);
    fws.run();
    expect(fws.states(fws.core.hydHeatExchangerAirLeak)).toEqual([false, false]);
    expect(fws.states(fws.core.hydHeatExchangerAirLeakDetFault)).toEqual([true, false]);
  });
});

/* SYS CHAN A or B OVHT DET FAULT (one channel), SYS OVHT DET FAULT (all sensors) */
describe('HYD G (Y) overheat detection faults', () => {
  it('raises the channel alert of the failed channel only while the other channel works', () => {
    const green = createHydFws([A380Failure.GreenOverheatDetectionChannelA]);
    green.run();
    expect(green.states(green.core.hydOverheatDetChannelFault)).toEqual([true, false, false, false]);
    // one working channel still detects the overheat: no SYS OVHT DET FAULT
    expect(green.states(green.core.hydOverheatDetFault)).toEqual([false, false]);
    const yellow = createHydFws([A380Failure.YellowOverheatDetectionChannelB]);
    yellow.run();
    expect(yellow.states(yellow.core.hydOverheatDetChannelFault)).toEqual([false, false, false, true]);
  });

  it('raises SYS OVHT DET FAULT instead of the channel alerts when both channels failed', () => {
    const fws = createHydFws([A380Failure.GreenOverheatDetectionChannelA, A380Failure.GreenOverheatDetectionChannelB]);
    fws.run();
    expect(fws.states(fws.core.hydOverheatDetFault)).toEqual([true, false]);
    expect(fws.states(fws.core.hydOverheatDetChannelFault)).toEqual([false, false, false, false]);
  });
});

/* With the HSMU failed, or all overheat sensors failed, the overheat detection is lost */
describe('HYD G (Y) SYS OVHT and SYS TEMP EXCESS HI detection', () => {
  it('raises SYS OVHT with the overheat and a working detection', () => {
    const green = createHydFws();
    green.run({ greenOverheat: true });
    expect(green.states(green.core.hydSysOvht)).toEqual([true, false]);
    const yellow = createHydFws();
    yellow.run({ yellowOverheat: true });
    expect(yellow.states(yellow.core.hydSysOvht)).toEqual([false, true]);
  });

  it('raises SYS OVHT with one overheat detection channel left', () => {
    const fws = createHydFws([A380Failure.GreenOverheatDetectionChannelA]);
    fws.run({ greenOverheat: true });
    expect(fws.states(fws.core.hydSysOvht)).toEqual([true, false]);
  });

  it.each([
    ['the HSMU failed', [A380Failure.GreenHsmu]],
    ['both channels failed', [A380Failure.GreenOverheatDetectionChannelA, A380Failure.GreenOverheatDetectionChannelB]],
  ])('loses SYS OVHT and SYS TEMP EXCESS HI when %s', (_name, failures) => {
    const fws = createHydFws(failures);
    fws.run({ greenOverheat: true, tempExcess: [true, false] });
    expect(fws.states(fws.core.hydSysOvht)).toEqual([false, false]);
    expect(fws.states(fws.core.hydSysTempExcessHi)).toEqual([false, false]);
  });

  it('raises SYS TEMP EXCESS HI from the heat damage of its own system', () => {
    const fws = createHydFws();
    fws.run({ tempExcess: [false, true] });
    expect(fws.states(fws.core.hydSysTempExcessHi)).toEqual([false, true]);
  });

  it.each([
    ['GREEN_1A', 0],
    ['GREEN_1B', 0],
    ['GREEN_2A', 0],
    ['GREEN_2B', 0],
    ['YELLOW_3A', 1],
    ['YELLOW_3B', 1],
    ['YELLOW_4A', 1],
    ['YELLOW_4B', 1],
  ])('reads the heat damage of the engine pump %s as the damage of system %i', (pump, system) => {
    const fws = createHydFws();
    fws.simVars.set(`L:A32NX_HYD_${pump}_EDPUMP_TEMP_EXCESS`, true);
    fws.run();
    expect(fws.states(fws.core.hydSysTempExcessHi)).toEqual(system === 0 ? [true, false] : [false, true]);
  });
});

/* SYS COOLING FAULT: the fuel/hydraulic heat exchanger was used during the previous flight */
describe('HYD G (Y) SYS COOLING FAULT', () => {
  it('is raised on the ground after a flight with an air/hydraulic heat exchanger failure', () => {
    // the failure comes in flight, so that the FWS does not start with the failure already latched on the ground
    const fws = createHydFws();
    fws.run({ onGround: true });
    fws.activeFailures.add(A380Failure.GreenAirHeatExchanger);
    fws.run({ onGround: true });
    expect(fws.states(fws.core.hydSysCoolingFault)).toEqual([false, false]);
    fws.run({ onGround: false });
    fws.run({ onGround: true });
    expect(fws.states(fws.core.hydSysCoolingFault)).toEqual([true, false]);
  });

  it('is not raised without an air/hydraulic heat exchanger failure in flight', () => {
    const fws = createHydFws();
    fws.run({ onGround: false });
    fws.run({ onGround: true });
    expect(fws.states(fws.core.hydSysCoolingFault)).toEqual([false, false]);
  });

  it('stays raised until the failure is cleared on the ground', () => {
    const fws = createHydFws([A380Failure.YellowAirHeatExchanger]);
    fws.run({ onGround: false });
    fws.run({ onGround: true });
    expect(fws.states(fws.core.hydSysCoolingFault)).toEqual([false, true]);
    fws.activeFailures.clear();
    fws.run({ onGround: true });
    expect(fws.states(fws.core.hydSysCoolingFault)).toEqual([false, false]);
  });

  it('is not shown in flight', () => {
    const fws = createHydFws([A380Failure.GreenAirHeatExchanger]);
    fws.run({ onGround: false });
    fws.run({ onGround: false });
    expect(fws.states(fws.core.hydSysCoolingFault)).toEqual([false, false]);
  });
});

/* The ECAM entries: ids, subjects, class and SD page */
describe('HYD G (Y) heat exchanger, HSMU and overheat detection ECAM entries', () => {
  const { core } = createFws(new Set());
  const signals = core as unknown as Record<string, SignalArray>;

  it.each([
    ['290800013', 'hydFuelHeatExchangerValveFault', 0, 2, SdPages.Fctl],
    ['290800014', 'hydFuelHeatExchangerValveFault', 1, 2, SdPages.Fctl],
    ['290800015', 'hydHeatExchangerAirLeak', 0, 1, SdPages.Hyd],
    ['290800016', 'hydHeatExchangerAirLeak', 1, 1, SdPages.Hyd],
    ['290800017', 'hydHeatExchangerAirLeakDetFault', 0, 1, SdPages.Hyd],
    ['290800018', 'hydHeatExchangerAirLeakDetFault', 1, 1, SdPages.Hyd],
    ['290800023', 'hydOverheatDetChannelFault', 0, 1, SdPages.None],
    ['290800024', 'hydOverheatDetChannelFault', 1, 1, SdPages.None],
    ['290800025', 'hydOverheatDetChannelFault', 2, 1, SdPages.None],
    ['290800026', 'hydOverheatDetChannelFault', 3, 1, SdPages.None],
    ['290800027', 'hydSysCoolingFault', 0, 1, SdPages.None],
    ['290800028', 'hydSysCoolingFault', 1, 1, SdPages.None],
    ['290800029', 'hydSysMonitoringFault', 0, 1, SdPages.None],
    ['290800030', 'hydSysMonitoringFault', 1, 1, SdPages.None],
    ['290800033', 'hydOverheatDetFault', 0, 1, SdPages.None],
    ['290800034', 'hydOverheatDetFault', 1, 1, SdPages.None],
    ['290800037', 'hydSysTempExcessHi', 0, 2, SdPages.Hyd],
    ['290800038', 'hydSysTempExcessHi', 1, 2, SdPages.Hyd],
  ])('%s is driven by %s[%i] with failure class %i on SD page %i', (id, subject, index, failure, page) => {
    const entry = core.abnormalSensed.ewdAbnormalSensed[id];
    expect(entry.simVarIsActive).toBe(signals[subject][index]);
    expect(entry.failure).toBe(failure);
    expect(entry.sysPage).toBe(page);
  });

  it('SYS OVHT is driven by the detection-gated subject and replaced by SYS TEMP EXCESS HI', () => {
    const green = core.abnormalSensed.ewdAbnormalSensed['290800031'];
    const yellow = core.abnormalSensed.ewdAbnormalSensed['290800032'];
    expect(green.simVarIsActive).toBe(core.hydSysOvht[0]);
    expect(green.notActiveWhenItemActive).toEqual(['290800037']);
    expect(yellow.simVarIsActive).toBe(core.hydSysOvht[1]);
    expect(yellow.notActiveWhenItemActive).toEqual(['290800038']);
  });

  it('SYS TEMP EXCESS HI always shows the two ENG PMP A+B DISC lines, the elec pump line only on the ground', () => {
    const shown = core.abnormalSensed.ewdAbnormalSensed['290800037'].whichItemsToShow();
    expect(shown).toEqual([
      core.engine1Running.get(),
      core.engine2Running.get(),
      true,
      true,
      core.enginesOffAndOnGroundSignal.read(),
    ]);
  });
});

describe('HYD G (Y) INOP SYS and REDUND LOSS lines', () => {
  const { core } = createFws(new Set());
  const signals = core as unknown as Record<string, SignalArray>;

  it.each([
    ['290300013', 'hydOverheatDetChannelFault', 0, true],
    ['290300014', 'hydOverheatDetChannelFault', 1, true],
    ['290300015', 'hydOverheatDetChannelFault', 2, true],
    ['290300016', 'hydOverheatDetChannelFault', 3, true],
    ['290300017', 'hydSysMonitoringFault', 0, false],
    ['290300018', 'hydSysMonitoringFault', 1, false],
    ['290300019', 'hydOverheatDetFault', 0, false],
    ['290300020', 'hydOverheatDetFault', 1, false],
  ])('%s follows %s[%i] (REDUND LOSS: %s)', (id, subject, index, redundancyLoss) => {
    const entry = core.inopSys.inopSys[id];
    expect(entry.simVarIsActive).toBe(signals[subject][index]);
    expect(Boolean(entry.redundancyLoss)).toBe(redundancyLoss);
  });
});
