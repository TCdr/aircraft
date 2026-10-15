// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  ACCU_PRESS_LO_PSI,
  accuPressLoItems,
  BrakeSteerInputs,
  brakeFaultAlerts,
  FwsBrakeAlerts,
  PARK_BRK_PRESS_LO_PSI,
  readBrakeSteerInputs,
  steerFaultAlerts,
} from './FwsBrakeAlerts';

/** Nominal inputs: no fault, accumulator charged, no brake pressure */
function inputs(overrides: Partial<BrakeSteerInputs> = {}): BrakeSteerInputs {
  return {
    normBrkFault: false,
    altnBrkFault: false,
    emerBrkFault: false,
    accuPressurePsi: 5000,
    altnLeftPressurePsi: 0,
    altnRightPressurePsi: 0,
    normNwsFault: false,
    altnNwsFault: false,
    bwsFault: false,
    scs1Fault: false,
    scs2Fault: false,
    ...overrides,
  };
}

/** Runs the alerts for a number of seconds in 100 ms steps */
function run(alerts: FwsBrakeAlerts, seconds: number, input: BrakeSteerInputs, parkBrakeOn: boolean): void {
  for (let t = 0; t < seconds * 10; t++) {
    alerts.update(100, input, parkBrakeOn);
  }
}

describe('BRAKES alerts from the BCS and EBCU faults (A380 FCOM PRO-ABN-ECAM-10-32)', () => {
  const none = { normBrk: false, altnBrk: false, emerBrk: false, altnEmerBrk: false, pedalBraking: false };

  it('raises nothing without a fault', () => {
    expect(brakeFaultAlerts(false, false, false)).toEqual(none);
  });

  it('raises the single fault alerts: NORM BRK, ALTN BRK and EMER BRK FAULT', () => {
    expect(brakeFaultAlerts(true, false, false)).toEqual({ ...none, normBrk: true });
    expect(brakeFaultAlerts(false, true, false)).toEqual({ ...none, altnBrk: true });
    expect(brakeFaultAlerts(false, false, true)).toEqual({ ...none, emerBrk: true });
  });

  it('raises ALTN + EMER BRK FAULT instead of ALTN BRK and EMER BRK FAULT, normal braking still available', () => {
    expect(brakeFaultAlerts(false, true, true)).toEqual({ ...none, altnEmerBrk: true });
  });

  it('raises PEDAL BRAKING FAULT alone when the normal, alternate and emergency braking are failed', () => {
    expect(brakeFaultAlerts(true, true, true)).toEqual({ ...none, pedalBraking: true });
  });

  it('keeps NORM BRK FAULT next to ALTN BRK or EMER BRK FAULT (design choice)', () => {
    expect(brakeFaultAlerts(true, true, false)).toEqual({ ...none, normBrk: true, altnBrk: true });
    expect(brakeFaultAlerts(true, false, true)).toEqual({ ...none, normBrk: true, emerBrk: true });
  });
});

describe('STEER alerts from the SCS and steering faults (A380 FCOM PRO-ABN-ECAM-10-32)', () => {
  const none = { normNw: false, altnNw: false, nw: false, bw: false, ctl1: false, ctl2: false, nwBw: false };

  it('raises nothing without a fault', () => {
    expect(steerFaultAlerts(inputs())).toEqual(none);
  });

  it('raises NORM N/W, ALTN N/W, B/W STEER and STEER CTL 1(2) FAULT for the single faults', () => {
    expect(steerFaultAlerts(inputs({ normNwsFault: true }))).toEqual({ ...none, normNw: true });
    expect(steerFaultAlerts(inputs({ altnNwsFault: true }))).toEqual({ ...none, altnNw: true });
    expect(steerFaultAlerts(inputs({ bwsFault: true }))).toEqual({ ...none, bw: true });
    expect(steerFaultAlerts(inputs({ scs1Fault: true }))).toEqual({ ...none, ctl1: true });
    expect(steerFaultAlerts(inputs({ scs2Fault: true }))).toEqual({ ...none, ctl2: true });
  });

  it('raises N/W STEER FAULT instead of NORM and ALTN N/W STEER FAULT when both NWS modes are failed', () => {
    expect(steerFaultAlerts(inputs({ normNwsFault: true, altnNwsFault: true }))).toEqual({ ...none, nw: true });
  });

  it('raises N/W + B/W STEER FAULT alone with SCS 1 and 2 failed, or with the NWS and the BWS failed', () => {
    expect(steerFaultAlerts(inputs({ scs1Fault: true, scs2Fault: true }))).toEqual({ ...none, nwBw: true });
    expect(steerFaultAlerts(inputs({ normNwsFault: true, altnNwsFault: true, bwsFault: true }))).toEqual({
      ...none,
      nwBw: true,
    });
  });
});

describe('BRAKES ACCU PRESS LO and PARK BRK PRESS LO', () => {
  it('raises ACCU PRESS LO after 10 s below 3 000 psi only', () => {
    const alerts = new FwsBrakeAlerts();
    run(alerts, 9, inputs({ accuPressurePsi: ACCU_PRESS_LO_PSI - 100 }), false);
    expect(alerts.accuPressLo.get()).toBe(false);
    run(alerts, 2, inputs({ accuPressurePsi: ACCU_PRESS_LO_PSI - 100 }), false);
    expect(alerts.accuPressLo.get()).toBe(true);

    run(alerts, 1, inputs({ accuPressurePsi: 3600 }), false);
    expect(alerts.accuPressLo.get()).toBe(false);
  });

  it('does not raise ACCU PRESS LO after one park brake application of a charged accumulator (3 600 psi)', () => {
    const alerts = new FwsBrakeAlerts();
    run(alerts, 20, inputs({ accuPressurePsi: 3600 }), true);
    expect(alerts.accuPressLo.get()).toBe(false);
  });

  it('raises PARK BRK PRESS LO after 5 s below 1 700 psi on one side with the park brake on', () => {
    const alerts = new FwsBrakeAlerts();
    const low = inputs({ altnLeftPressurePsi: 2103, altnRightPressurePsi: PARK_BRK_PRESS_LO_PSI - 100 });
    run(alerts, 4, low, true);
    expect(alerts.parkBrkPressLo.get()).toBe(false);
    run(alerts, 2, low, true);
    expect(alerts.parkBrkPressLo.get()).toBe(true);
  });

  it('does not raise PARK BRK PRESS LO with the park brake off, or at the park brake pressure of the model', () => {
    const alerts = new FwsBrakeAlerts();
    run(alerts, 10, inputs(), false);
    expect(alerts.parkBrkPressLo.get()).toBe(false);
    run(alerts, 10, inputs({ altnLeftPressurePsi: 2103, altnRightPressurePsi: 2103 }), true);
    expect(alerts.parkBrkPressLo.get()).toBe(false);
  });

  it('shows ACCUS REINFLATE and CHOCKS without an engine running, the BEFORE ENGINE SHUTDOWN lines with one', () => {
    expect(accuPressLoItems(false)).toEqual([true, true, false, false]);
    expect(accuPressLoItems(true)).toEqual([false, false, true, true]);
  });
});

describe('FwsBrakeAlerts inputs and wiring', () => {
  it('reads the BCS, EBCU and SCS fault variables and the brake pressures of the Rust model', () => {
    const names: string[] = [];
    readBrakeSteerInputs((name) => {
      names.push(name);
      return 0;
    });
    expect(names).toEqual([
      'L:A32NX_BRAKES_NORM_BRK_FAULT',
      'L:A32NX_BRAKES_ALTN_BRK_FAULT',
      'L:A32NX_BRAKES_EMER_BRK_FAULT',
      'L:A32NX_HYD_BRAKE_ALTN_ACC_PRESS',
      'L:A32NX_HYD_BRAKE_ALTN_LEFT_PRESS',
      'L:A32NX_HYD_BRAKE_ALTN_RIGHT_PRESS',
      'L:A32NX_STEERING_NORM_NWS_FAULT',
      'L:A32NX_STEERING_ALTN_NWS_FAULT',
      'L:A32NX_STEERING_BWS_FAULT',
      'L:A32NX_STEERING_SCS_1_FAULT',
      'L:A32NX_STEERING_SCS_2_FAULT',
    ]);
  });

  it('the Rust model writes the variables the FWS reads', () => {
    const rust = readFileSync(
      resolve(__dirname, '../../../../wasm/systems/a380_systems/src/hydraulic/brake_steer_faults.rs'),
      'utf-8',
    );
    for (const name of [
      'BRAKES_NORM_BRK_FAULT',
      'BRAKES_ALTN_BRK_FAULT',
      'BRAKES_EMER_BRK_FAULT',
      'STEERING_NORM_NWS_FAULT',
      'STEERING_ALTN_NWS_FAULT',
      'STEERING_BWS_FAULT',
      'STEERING_SCS_1_FAULT',
      'STEERING_SCS_2_FAULT',
    ]) {
      expect(rust).toContain(`"${name}"`);
    }
  });

  it('the FWS updates the alerts with the park brake handle', () => {
    const core = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');
    expect(core).toMatch(/this\.brakeSteerAlerts\.update\(\s*deltaTime,\s*readBrakeSteerInputs\(/);
  });

  /**
   * Level (failure: 1 without audio and master light, 2 with SC and MASTER CAUT) and flight phase inhibition of each
   * alert, from the A380 FCOM PRO-ABN-ECAM-10-32 figures (PDF page).
   */
  const expectedAlerts: [string, string, number, number[]][] = [
    ['320800020', 'normBrkFault', 1, [3, 4, 5, 6, 7, 10, 11]], // NORM BRK FAULT p.5457
    ['320800011', 'altnBrkFault', 1, [3, 4, 5, 6, 7, 9, 10]], // ALTN BRK FAULT p.5444
    ['320800017', 'emerBrkFault', 1, [3, 4, 5, 6, 7, 9, 10]], // EMER BRK FAULT p.5453
    ['320800010', 'altnEmerBrkFault', 1, [3, 4, 5, 6, 7, 9, 10]], // ALTN + EMER BRK FAULT p.5442
    ['320800024', 'pedalBrakingFault', 2, [4, 5, 6, 7]], // PEDAL BRAKING FAULT p.5463
    ['320800009', 'accuPressLo', 2, [3, 4, 5, 6, 7, 9, 10]], // ACCU PRESS LO p.5440
    ['320800023', 'parkBrkPressLo', 2, [3, 4, 5, 6, 7, 8, 9, 10]], // PARK BRK PRESS LO p.5461
    ['320800060', 'normNwSteerFault', 2, [3, 4, 5, 6, 7, 10]], // NORM N/W STEER FAULT p.5534
    ['320800047', 'altnNwSteerFault', 1, [3, 4, 5, 6, 7, 9, 10, 11]], // ALTN N/W STEER FAULT p.5517
    ['320800058', 'nwSteerFault', 2, [4, 5, 6, 7]], // N/W STEER FAULT p.5531
    ['320800049', 'bwSteerFault', 1, [3, 4, 5, 6, 7, 9, 10]], // B/W STEER FAULT p.5519
    ['320800053', 'steerCtl1Fault', 1, [3, 4, 5, 6, 7, 9, 10, 11]], // STEER CTL 1 FAULT p.5524
    ['320800054', 'steerCtl2Fault', 1, [3, 4, 5, 6, 7, 9, 10, 11]], // STEER CTL 2 FAULT p.5524
    ['320800055', 'nwBwSteerFault', 2, [4, 5, 6, 7]], // N/W + B/W STEER FAULT p.5526
  ];

  it.each(expectedAlerts)(
    'wires %s to %s with level %i and the FCOM phase inhibition',
    (id, subject, level, phases) => {
      const sensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
      const start = sensed.indexOf(`    ${id}: {`);
      expect(start).toBeGreaterThan(0);
      const block = sensed.slice(start, sensed.indexOf('\n    },', start));
      expect(block).toContain(`simVarIsActive: this.fws.brakeSteerAlerts.${subject},`);
      expect(block).toContain(`failure: ${level},`);
      expect(block).toContain(`flightPhaseInhib: [${phases.join(', ')}],`);
      expect(block).toContain('sysPage: SdPages.Wheel,');
    },
  );
});
