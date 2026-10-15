// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  EngineOverLimitInputs,
  EngineOverLimitMonitor,
  OverLimitParameter,
  egtOverLimitThreshold,
  engineOverLimitLines,
  engineStallLines,
  engineStallStatus,
} from './EngineParameterAlerts';

/** Thrust limit types of L:A32NX_AUTOTHRUST_THRUST_LIMIT_TYPE */
const NONE = 0;
const CLB = 1;
const MCT = 2;
const FLX = 3;
const TOGA = 4;
const MREV = 5;

const climb: EngineOverLimitInputs = {
  n1Percent: 85,
  n2Percent: 95,
  egtDegrees: 750,
  engineStarting: false,
  onGround: false,
  thrustLimitType: CLB,
};

function monitorAfter(...inputs: Partial<EngineOverLimitInputs>[]): EngineOverLimitMonitor {
  const monitor = new EngineOverLimitMonitor();
  for (const input of inputs) {
    monitor.update({ ...climb, ...input });
  }
  return monitor;
}

describe('ENG 1(2) N1/N2/EGT OVER LIMIT', () => {
  it('uses the EGT limits of the EWD (CFM56-5B TCDS): 940 °C at TOGA/FLX, 905 °C at CLB/MCT/MREV, 725 °C otherwise', () => {
    expect(egtOverLimitThreshold(true, CLB)).toBe(725);
    expect(egtOverLimitThreshold(false, TOGA)).toBe(940);
    expect(egtOverLimitThreshold(false, FLX)).toBe(940);
    expect(egtOverLimitThreshold(false, CLB)).toBe(905);
    expect(egtOverLimitThreshold(false, MCT)).toBe(905);
    expect(egtOverLimitThreshold(false, MREV)).toBe(905);
    expect(egtOverLimitThreshold(false, NONE)).toBe(725);
  });

  it('is not active with all parameters within their limits', () => {
    expect(monitorAfter({}).isActive).toBe(false);
  });

  it('triggers above the LEAP-1A red lines: N1 101 %, N2 116.5 %', () => {
    expect(monitorAfter({ n1Percent: 101.5 }).overLimitParameter).toBe(OverLimitParameter.N1);
    expect(monitorAfter({ n1Percent: 100.9 }).isActive).toBe(false);
    expect(monitorAfter({ n1Percent: 101 }).isActive).toBe(false);
    expect(monitorAfter({ n2Percent: 116.6 }).overLimitParameter).toBe(OverLimitParameter.N2);
    expect(monitorAfter({ n2Percent: 116.5 }).isActive).toBe(false);
  });

  it('does not trigger at the N2 of a LEAP-1A TOGA take-off (above the CFM56 105 %)', () => {
    expect(monitorAfter({ n2Percent: 106, thrustLimitType: TOGA }).isActive).toBe(false);
    expect(monitorAfter({ n2Percent: 110, thrustLimitType: TOGA }).isActive).toBe(false);
  });

  it('triggers on the EGT limit of the thrust limit type, as the EWD turns the EGT amber', () => {
    expect(monitorAfter({ egtDegrees: 910 }).overLimitParameter).toBe(OverLimitParameter.Egt);
    expect(monitorAfter({ egtDegrees: 910, thrustLimitType: TOGA }).isActive).toBe(false);
    expect(monitorAfter({ egtDegrees: 945, thrustLimitType: TOGA }).isActive).toBe(true);
    expect(monitorAfter({ egtDegrees: 730, engineStarting: true, onGround: true }).isActive).toBe(true);
  });

  it('names the EGT first when several parameters are over their limits', () => {
    expect(monitorAfter({ egtDegrees: 950, n1Percent: 105 }).overLimitParameter).toBe(OverLimitParameter.Egt);
  });

  it('ends when the parameter is back within its limit', () => {
    expect(monitorAfter({ egtDegrees: 910 }, { egtDegrees: 900 }).isActive).toBe(false);
  });

  it('asks for THR LEVER BELOW LIMIT below the second band of the max pointer', () => {
    const monitor = monitorAfter({ egtDegrees: 950 });
    expect(monitor.inShutdownBand).toBe(false);
    expect(engineOverLimitLines(monitor.overLimitParameter, monitor.inShutdownBand, false)).toEqual([2, 3]);
    expect(engineOverLimitLines(OverLimitParameter.N1, false, false)).toEqual([0, 3]);
    expect(engineOverLimitLines(OverLimitParameter.N2, false, false)).toEqual([1, 3]);
  });

  it('asks for THR LEVER IDLE and ENG MASTER OFF once the max pointer is above the 975 °C red limit, 102.8 % N1 or 117.3 % N2', () => {
    expect(monitorAfter({ egtDegrees: 980 }).inShutdownBand).toBe(true);
    expect(monitorAfter({ egtDegrees: 975 }).inShutdownBand).toBe(false);
    // N1: the FCOM 1.8 % band above the limit, on the LEAP-1A red line (101 % + 1.8 %)
    expect(monitorAfter({ n1Percent: 102.5 }).inShutdownBand).toBe(false);
    expect(monitorAfter({ n1Percent: 102.5 }).overLimitParameter).toBe(OverLimitParameter.N1);
    expect(monitorAfter({ n1Percent: 103 }).inShutdownBand).toBe(true);
    expect(monitorAfter({ n1Percent: 106 }).inShutdownBand).toBe(true);
    // N2: the FCOM 0.8 % band above the limit, on the LEAP-1A red line (116.5 % + 0.8 %)
    expect(monitorAfter({ n2Percent: 106 }).inShutdownBand).toBe(false);
    expect(monitorAfter({ n2Percent: 117 }).inShutdownBand).toBe(false);
    expect(monitorAfter({ n2Percent: 117 }).overLimitParameter).toBe(OverLimitParameter.N2);
    expect(monitorAfter({ n2Percent: 117.5 }).inShutdownBand).toBe(true);
    expect(engineOverLimitLines(OverLimitParameter.Egt, true, false)).toEqual([2, 4, 5]);
    // the lever line goes once the lever is at idle
    expect(engineOverLimitLines(OverLimitParameter.Egt, true, true)).toEqual([2, 5]);
  });

  it('keeps the max pointer when the parameter decreases, until the next engine start on ground', () => {
    // 980 °C then 930 °C: still above the limit, the procedure stays in the second band
    const monitor = monitorAfter({ egtDegrees: 980 }, { egtDegrees: 930 });
    expect(monitor.isActive).toBe(true);
    expect(monitor.inShutdownBand).toBe(true);

    monitor.update({ ...climb, onGround: true, engineStarting: true, egtDegrees: 400 });
    monitor.update({ ...climb, egtDegrees: 930 });
    expect(monitor.inShutdownBand).toBe(false);
  });

  it('does not reset the max pointer on an in-flight relight', () => {
    const monitor = monitorAfter({ egtDegrees: 980 }, { engineStarting: true, egtDegrees: 400 }, { egtDegrees: 930 });
    expect(monitor.inShutdownBand).toBe(true);
  });
});

describe('ENG 1(2) STALL', () => {
  it('shows THR LEVER IDLE and ENG MASTER OFF on ground', () => {
    expect(engineStallLines(1, false)).toEqual([0, 1, 2]);
    expect(engineStallLines(10, false)).toEqual([0, 1, 2]);
  });

  it('shows THR LEVER IDLE, ENG PARAMETERS CHECK and STALL PROC APPLY in flight', () => {
    expect(engineStallLines(6, false)).toEqual([0, 1, 3, 4]);
  });

  it('removes the THR LEVER IDLE line once the lever is at idle', () => {
    expect(engineStallLines(6, true)).toEqual([0, 3, 4]);
    expect(engineStallLines(2, true)).toEqual([0, 2]);
  });

  it('has CONSIDER ENG 1(2) RELIGHT on the STATUS page', () => {
    expect(engineStallStatus(1)).toEqual(['700400006']);
    expect(engineStallStatus(2)).toEqual(['700400007']);
  });
});
