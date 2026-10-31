// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  BrakeControlInputs,
  brakesReleasedItems,
  FwsBrakeControlAlerts,
  partialAntiSkidAlerts,
  partialAntiSkidInfo,
  rdcChannelFailed,
  readBrakeControlInputs,
  residualBrakingItems,
  sysRedundancyLostItems,
} from './FwsBrakeControlAlerts';
import { A380Failure } from '@failures';
import { createFws, procedureItemNames } from './FwsSpecFixture';

/** RDC channel fault bits: bit 0 RDC 1 A, bit 1 RDC 1 B, bit 2 RDC 2 A ... bit 5 RDC 3 B */
const RDC_1_A = 1;
const RDC_1_B = 2;
const RDC_2_A = 4;
const RDC_2_B = 8;
const RDC_3_A = 16;
const RDC_3_B = 32;
const WING_LOST = RDC_1_A | RDC_1_B;
const RIGHT_BODY_LOST = RDC_2_A | RDC_2_B;
const LEFT_BODY_LOST = RDC_3_A | RDC_3_B;

function inputs(overrides: Partial<BrakeControlInputs> = {}): BrakeControlInputs {
  return {
    bcs1Fault: false,
    bcs2Fault: false,
    rdcChannelFaults: 0,
    releasedPairs: 0,
    residualPairs: 0,
    pedalBrakingMode: 1,
    antiSkidSwitchOn: true,
    normPressureTransmitterFault: false,
    altnPressureTransmitterFault: false,
    selectorValveJammedOpen: false,
    minorFault: false,
    safetyTestOverdue: false,
    ...overrides,
  };
}

function trueAlerts(rdcChannelFaults: number, overrides: Partial<BrakeControlInputs> = {}): string[] {
  const alerts = partialAntiSkidAlerts(inputs({ rdcChannelFaults, ...overrides }));
  return Object.keys(alerts).filter((key) => alerts[key as keyof typeof alerts]);
}

describe('readBrakeControlInputs', () => {
  it('reads the BCS L:vars and the FWS-only failures', () => {
    const values: Record<string, number> = {
      'L:A32NX_BRAKES_CTL_1_FAULT': 1,
      'L:A32NX_BRAKES_CTL_2_FAULT': 0,
      'L:A32NX_BRAKES_RDC_CHANNEL_FAULTS': 12,
      'L:A32NX_BRAKES_RELEASED_PAIRS': 3,
      'L:A32NX_BRAKES_RESIDUAL_PAIRS': 128,
    };
    const read = readBrakeControlInputs(
      (name) => values[name] ?? 0,
      (failure) => failure === A380Failure.BrakesSelectorValveJammedOpen,
      { pedalBrakingMode: 2, antiSkidSwitchOn: true },
    );
    expect(read).toEqual(
      inputs({
        bcs1Fault: true,
        rdcChannelFaults: 12,
        releasedPairs: 3,
        residualPairs: 128,
        pedalBrakingMode: 2,
        selectorValveJammedOpen: true,
      }),
    );
  });

  it('decodes the RDC channel bits', () => {
    expect(rdcChannelFailed(RDC_2_B, 2, true)).toBe(true);
    expect(rdcChannelFailed(RDC_2_B, 2, false)).toBe(false);
    expect(rdcChannelFailed(RDC_3_A, 3, false)).toBe(true);
  });
});

describe('partial BRAKES A-SKID FAULT alerts', () => {
  it.each([
    [LEFT_BODY_LOST | RIGHT_BODY_LOST, 'leftAndRightBody'],
    [LEFT_BODY_LOST, 'leftBody'],
    [RIGHT_BODY_LOST, 'rightBody'],
    [WING_LOST | LEFT_BODY_LOST, 'wingAndLeftBody'],
    [WING_LOST | RIGHT_BODY_LOST, 'wingAndRightBody'],
    [WING_LOST, 'wing'],
  ])('RDC channel faults %i raise only %s', (faults, alert) => {
    expect(trueAlerts(faults)).toEqual([alert]);
  });

  it('needs both channels of the RDC', () => {
    expect(trueAlerts(RDC_1_A | RDC_2_B | RDC_3_A)).toEqual([]);
  });

  it('shows in alternate braking too', () => {
    expect(trueAlerts(WING_LOST, { pedalBrakingMode: 2 })).toEqual(['wing']);
  });

  it('gives way to A-SKID FAULT ON ALL L/G and A-SKID OFF (emergency braking, A-SKID sw OFF)', () => {
    expect(trueAlerts(WING_LOST, { pedalBrakingMode: 3 })).toEqual([]);
    expect(trueAlerts(WING_LOST, { antiSkidSwitchOn: false })).toEqual([]);
    expect(trueAlerts(WING_LOST | LEFT_BODY_LOST | RIGHT_BODY_LOST)).toEqual([]);
  });

  it('INFO: BRK PRESS AUTO LMTD, DELAY BRAKING, and the taxi lines with an engine running', () => {
    expect(partialAntiSkidInfo('320200010', false)).toEqual(['320200010', '320200003', null, null, null]);
    expect(partialAntiSkidInfo('320200010', true)).toEqual([
      '320200010',
      '320200003',
      '800200003',
      '800200005',
      '220200017',
    ]);
  });
});

describe('BRAKES SYS REDUNDANCY LOST lines', () => {
  it.each([
    [0, [false, false, false, false, false]],
    [RDC_2_B, [true, false, false, false, false]],
    [RDC_3_A, [false, true, false, false, false]],
    [RDC_2_A, [false, false, true, false, false]],
    [RDC_2_A | RDC_3_A, [false, false, false, true, false]],
    [RDC_1_A, [false, false, false, false, true]],
    [RDC_1_A | RDC_1_B | RDC_3_B, [true, false, false, false, false]],
  ])('RDC channel faults %i show %j', (faults, lines) => {
    expect(sysRedundancyLostItems(faults)).toEqual(lines);
  });

  it('a lost gear group (both channels) is not a redundancy loss', () => {
    expect(sysRedundancyLostItems(RIGHT_BODY_LOST).some((line) => line)).toBe(false);
  });
});

describe('BRAKES RELEASED and RESIDUAL BRAKING lines', () => {
  it('a released pair shows NORM RELEASED in normal braking and ALTN RELEASED in alternate braking', () => {
    const normal = brakesReleasedItems(0b100, 1);
    expect(normal.length).toBe(17);
    expect(normal.map((shown, line) => (shown ? line : -1)).filter((line) => line >= 0)).toEqual([2, 16]);
    const alternate = brakesReleasedItems(0b100, 2);
    expect(alternate.map((shown, line) => (shown ? line : -1)).filter((line) => line >= 0)).toEqual([10, 16]);
  });

  it('ON BRK lines follow the residual pairs', () => {
    expect(residualBrakingItems(0b10000001)).toEqual([true, false, false, false, false, false, false, true]);
  });
});

describe('FwsBrakeControlAlerts', () => {
  it('raises each alert from its input', () => {
    const alerts = new FwsBrakeControlAlerts();
    alerts.update(
      inputs({
        bcs2Fault: true,
        rdcChannelFaults: RDC_1_B | LEFT_BODY_LOST,
        releasedPairs: 0b1,
        residualPairs: 0b10,
        normPressureTransmitterFault: true,
        altnPressureTransmitterFault: true,
        selectorValveJammedOpen: true,
        minorFault: true,
        safetyTestOverdue: true,
      }),
    );

    expect(alerts.ctl1Fault.get()).toBe(false);
    expect(alerts.ctl2Fault.get()).toBe(true);
    expect(alerts.aSkidFaultOnLeftBodyLg.get()).toBe(true);
    expect(alerts.sysRedundancyLost.get()).toBe(true);
    expect(alerts.released.get()).toBe(true);
    expect(alerts.residualBraking.get()).toBe(true);
    expect(alerts.normBrkPressMonitoringFault.get()).toBe(true);
    expect(alerts.altnBrkPressMonitoringFault.get()).toBe(true);
    expect(alerts.selVlvJammedOpen.get()).toBe(true);
    expect(alerts.minorFault.get()).toBe(true);
    expect(alerts.sysSafetyTestRequired.get()).toBe(true);
  });

  it('raises nothing without a fault', () => {
    const alerts = new FwsBrakeControlAlerts();
    alerts.update(inputs());
    const subjects = Object.values(alerts).filter(
      (value): value is { get(): boolean } => typeof value === 'object' && value !== null && 'get' in value,
    );
    expect(subjects.length).toBe(16);
    expect(subjects.some((subject) => subject.get())).toBe(false);
  });
});

describe('BCS alerts in FwsAbnormalSensed', () => {
  const { core } = createFws();

  it.each([
    ['320800002', 'aSkidFaultOnLeftAndRightBodyLg', '[4, 5, 6, 7]', 2],
    ['320800003', 'aSkidFaultOnLeftBodyLg', '[4, 5, 6, 7]', 2],
    ['320800004', 'aSkidFaultOnRightBodyLg', '[4, 5, 6, 7]', 2],
    ['320800005', 'aSkidFaultOnWingAndLeftBodyLg', '[4, 5, 6, 7]', 2],
    ['320800006', 'aSkidFaultOnWingAndRightBodyLg', '[4, 5, 6, 7]', 2],
    ['320800007', 'aSkidFaultOnWingLg', '[4, 5, 6, 7]', 2],
    ['320800012', 'altnBrkPressMonitoringFault', '[3, 4, 5, 6, 7, 8, 9, 10, 11]', 1],
    ['320800015', 'ctl1Fault', '[3, 4, 5, 6, 7, 9, 10, 11]', 1],
    ['320800016', 'ctl2Fault', '[3, 4, 5, 6, 7, 9, 10, 11]', 1],
    ['320800019', 'minorFault', '[3, 4, 5, 6, 7, 8, 9, 10, 11]', 1],
    ['320800021', 'normBrkPressMonitoringFault', '[3, 4, 5, 6, 7, 8, 9, 10, 11]', 1],
    ['320800025', 'released', '[4, 5, 6, 7]', 2],
    ['320800026', 'residualBraking', '[4, 5, 6, 7, 9, 10]', 2],
    ['320800027', 'selVlvJammedOpen', '[3, 4, 5, 6, 7, 8, 9, 10, 11]', 1],
    ['320800028', 'sysRedundancyLost', '[3, 4, 5, 6, 7, 8, 9, 10, 11]', 1],
    ['320800029', 'sysSafetyTestRequired', '[2, 3, 4, 5, 6, 7, 8, 9, 10, 11]', 1],
  ])('%s follows brakeControlAlerts.%s, inhibited in phases %s, level %i', (id, subject, phases, level) => {
    const entry = core.abnormalSensed.ewdAbnormalSensed[Number(id)];
    expect(entry.simVarIsActive).toBe((core.brakeControlAlerts as unknown as { [subject: string]: unknown })[subject]);
    expect(entry.flightPhaseInhib).toEqual(JSON.parse(phases));
    expect(entry.failure).toBe(level);
  });

  it('BRAKES RELEASED has the 16 BRK NORM/ALTN RELEASED lines and LDG DIST AFFECTED', () => {
    const pairs = ['1/2', '3/4', '5/6', '7/8', '9/10', '11/12', '13/14', '15/16'];
    const names = procedureItemNames('320800025');
    expect(names).toEqual([
      ...pairs.map((pair) => `BRK ${pair} NORM RELEASED`),
      ...pairs.map((pair) => `BRK ${pair} ALTN RELEASED`),
      'LDG DIST AFFECTED',
    ]);
  });

  it('BRAKES SYS REDUNDANCY LOST names channel A for the L + R BODY line', () => {
    const names = procedureItemNames('320800028').map((name) => name.trim());
    expect(names).toEqual([
      'SYS B REDUNDANCY LOST',
      'SYS A REDUNDANCY LOST ON L BODY',
      'SYS A REDUNDANCY LOST ON R BODY',
      'SYS A REDUNDANCY LOST ON L + R BODY',
      'SYS A REDUNDANCY LOST ON WING',
    ]);
  });
});
