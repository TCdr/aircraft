// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  EngineStartFault,
  EngineStartPhase,
  ignitionFaultInopSys,
  ignitionFaultLines,
  isStartFaultActive,
  StartFaultLineInputs,
  startFaultLines,
  startFaultStatus,
  StartValveFault,
  StartValveFaultLineInputs,
  startValveFaultLines,
  startValveFaultStatus,
} from './EngineStartAlerts';

const groundAutoStart: StartFaultLineInputs = {
  fault: EngineStartFault.NoLightUp,
  phase: EngineStartPhase.AutomaticCrank,
  manualStart: false,
  onGround: true,
  masterOn: true,
  manualStartPbOn: false,
};

describe('ENG 1(2) START FAULT', () => {
  it('is active for a start fault, except THR LEVER NOT AT IDLE in flight phase 6', () => {
    expect(isStartFaultActive(EngineStartFault.None, 1)).toBe(false);
    expect(isStartFaultActive(EngineStartFault.NoLightUp, 2)).toBe(true);
    expect(isStartFaultActive(EngineStartFault.NoLightUp, 6)).toBe(true);
    expect(isStartFaultActive(EngineStartFault.ThrustLeverNotAtIdle, 2)).toBe(true);
    expect(isStartFaultActive(EngineStartFault.ThrustLeverNotAtIdle, 6)).toBe(false);
    // no starter time limit in the A320 FCOM
    expect(isStartFaultActive(EngineStartFault.StarterTimeExceeded, 2)).toBe(false);
  });

  it('shows AUTO CRANK IN PROGRESS, then NEW START IN PROGRESS, then ENG MASTER OFF on an automatic start', () => {
    expect(startFaultLines(groundAutoStart)).toEqual([0, 1, 8]);
    expect(startFaultLines({ ...groundAutoStart, phase: EngineStartPhase.Starting })).toEqual([0, 1, 9]);
    expect(startFaultLines({ ...groundAutoStart, phase: EngineStartPhase.Aborted })).toEqual([0, 1, 10]);
  });

  it('names the fault on its second line', () => {
    const subTitle = (fault: EngineStartFault) => startFaultLines({ ...groundAutoStart, fault })[1];
    expect(subTitle(EngineStartFault.NoLightUp)).toBe(1);
    expect(subTitle(EngineStartFault.Stall)).toBe(2);
    expect(subTitle(EngineStartFault.EgtOverlimit)).toBe(3);
    expect(subTitle(EngineStartFault.HungStart)).toBe(4);
    expect(subTitle(EngineStartFault.StarterFault)).toBe(5);
    expect(subTitle(EngineStartFault.LowStartAirPressure)).toBe(6);
    expect(subTitle(EngineStartFault.ThrustLeverNotAtIdle)).toBe(7);
  });

  it('asks for ENG MASTER OFF and MAN START OFF on a manual start', () => {
    const manual = { ...groundAutoStart, manualStart: true, manualStartPbOn: true, phase: EngineStartPhase.Starting };
    expect(startFaultLines(manual)).toEqual([0, 1, 10, 11]);
    expect(startFaultLines({ ...manual, masterOn: false, manualStartPbOn: false })).toEqual([0, 1]);
  });

  it('asks for ENG MASTER OFF in flight', () => {
    expect(startFaultLines({ ...groundAutoStart, onGround: false, phase: EngineStartPhase.None })).toEqual([0, 1, 10]);
  });

  it('has the procedures of the other faults', () => {
    expect(startFaultLines({ ...groundAutoStart, fault: EngineStartFault.LowStartAirPressure })).toEqual([0, 6, 12]);
    expect(startFaultLines({ ...groundAutoStart, fault: EngineStartFault.ThrustLeverNotAtIdle })).toEqual([0, 7, 13]);
    expect(startFaultLines({ ...groundAutoStart, fault: EngineStartFault.StarterFault })).toEqual([0, 5, 10]);
    expect(startFaultLines({ ...groundAutoStart, fault: EngineStartFault.StarterFault, onGround: false })).toEqual([
      0, 5, 14,
    ]);
  });

  it('shows WINDMILL START ONLY on the STATUS after a starter shaft shear', () => {
    expect(startFaultStatus(2, EngineStartFault.StarterFault)).toEqual(['800400002']);
    expect(startFaultStatus(1, EngineStartFault.NoLightUp)).toEqual([]);
  });
});

const notClosedInFlight: StartValveFaultLineInputs = {
  engineNumber: 1,
  fault: StartValveFault.NotClosed,
  onGround: false,
  masterOn: true,
  manualStartPbOn: false,
  apuBleedOn: true,
  crossBleedOpen: true,
  crossBleedSelectorOpen: false,
  engineBleedOn: true,
  wingAntiIceOn: true,
  oppositeEngineRunning: true,
  apuAvailable: true,
  belowFl200: true,
};

describe('ENG 1(2) START VALVE FAULT', () => {
  it('removes the bleed sources of a start valve not closed in flight', () => {
    expect(startValveFaultLines(notClosedInFlight)).toEqual([0, 1, 2, 3, 4, 6, 7]);
    // APU BLEED OFF only for engine 1
    expect(startValveFaultLines({ ...notClosedInFlight, engineNumber: 2 })).toEqual([0, 1, 3, 4, 6, 7]);
  });

  it('asks for MAN START OFF and ENG MASTER OFF for a start valve not closed on the ground', () => {
    expect(
      startValveFaultLines({
        ...notClosedInFlight,
        onGround: true,
        apuBleedOn: false,
        crossBleedOpen: false,
        manualStartPbOn: true,
      }),
    ).toEqual([0, 1, 5, 8]);
  });

  it('asks for starter air for a start valve not open', () => {
    const notOpen = { ...notClosedInFlight, fault: StartValveFault.NotOpen, onGround: true, apuBleedOn: false };
    expect(startValveFaultLines(notOpen)).toEqual([0, 9, 10, 11, 12, 8]);
    expect(startValveFaultLines({ ...notOpen, belowFl200: false, oppositeEngineRunning: false })).toEqual([
      0, 9, 12, 8,
    ]);
    expect(startValveFaultLines({ ...notOpen, manualStartPbOn: true, apuBleedOn: true })).toEqual([0, 9, 10, 12, 5]);
  });

  it('has its STATUS for a start valve not closed in flight only', () => {
    expect(startValveFaultStatus(StartValveFault.NotClosed, false)).toEqual({
      left: ['700400001', '700500001', '700400002', '700400003', '700400004'],
      inopSys: ['300300001'],
    });
    expect(startValveFaultStatus(StartValveFault.NotClosed, true)).toEqual({ left: [], inopSys: [] });
    expect(startValveFaultStatus(StartValveFault.NotOpen, false)).toEqual({ left: [], inopSys: [] });
  });
});

describe('ENG 1(2) IGN FAULT', () => {
  it('names the failed igniters and asks to avoid adverse conditions without ignition', () => {
    expect(ignitionFaultLines(false, false)).toEqual([]);
    expect(ignitionFaultLines(true, false)).toEqual([0]);
    expect(ignitionFaultLines(false, true)).toEqual([1]);
    expect(ignitionFaultLines(true, true)).toEqual([2, 3]);
  });

  it('lists the inoperative igniters', () => {
    expect(ignitionFaultInopSys(1, true, false)).toEqual(['740300001']);
    expect(ignitionFaultInopSys(1, false, true)).toEqual(['740300002']);
    expect(ignitionFaultInopSys(2, true, false)).toEqual(['740300003']);
    expect(ignitionFaultInopSys(2, false, true)).toEqual(['740300004']);
    expect(ignitionFaultInopSys(1, true, true)).toEqual(['740300005']);
    expect(ignitionFaultInopSys(2, true, true)).toEqual(['740300006']);
  });
});
