// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it, vi } from 'vitest';
import { EventBus, Subject } from '@microsoft/msfs-sdk';
import { SdPages } from '@shared/EcamSystemPages';
import type { FwsCore } from './FwsCore';
import { FwsAbnormalSensed } from './FwsAbnormalSensed';
import { FwsInopSys } from './FwsInopSys';
import {
  ACCU_PRESS_LO_PSI,
  accuPressLoItems,
  aSkidFaultOnAllLg,
  BrakeSteerInputs,
  brakeFaultAlerts,
  btvFaultCautionTriggered,
  FwsBrakeAlerts,
  isParkBrakeHandleOn,
  PARK_BRK_PRESS_LO_PSI,
  readBrakeSteerInputs,
  steerFaultAlerts,
} from './FwsBrakeAlerts';

/*
 * The procedure tables import the enums of EcamMessages/index and it imports the tables: loaded through EcamMessages/index, that cycle
 * runs the tables before the enums exist. So ./index gets empty tables here, and each real table is loaded afterwards.
 */
vi.mock('../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata21-22-23', () => ({
  EcamAbnormalSensedAta212223: {},
  EcamDeferredProcAta212223: {},
}));
vi.mock('../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata24', () => ({
  EcamAbnormalSensedAta24: {},
  EcamDeferredProcAta24: {},
}));
vi.mock('../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata26', () => ({
  EcamAbnormalSensedAta26: {},
}));
vi.mock('../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata27', () => ({
  EcamAbnormalSensedAta27: {},
  EcamDeferredProcAta27: {},
}));
vi.mock('../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata28', () => ({
  EcamAbnormalSensedAta28: {},
}));
vi.mock('../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata29-30', () => ({
  EcamAbnormalSensedAta2930: {},
  EcamDeferredProcAta2930: {},
}));
vi.mock('../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata31-32-33', () => ({
  EcamAbnormalSensedAta313233: {},
  EcamDeferredProcAta313233: {},
}));
vi.mock('../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata34', () => ({
  EcamAbnormalSensedAta34: {},
  EcamDeferredProcAta34: {},
}));
vi.mock('../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata35-36-42', () => ({
  EcamAbnormalSensedAta353642: {},
}));
vi.mock('../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata46-49-52-56', () => ({
  EcamAbnormalSensedAta46495256: {},
}));
vi.mock('../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata70', () => ({
  EcamAbnormalSensedAta70: {},
  EcamDeferredProcAta70: {},
}));
vi.mock('../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata80-rest', () => ({
  EcamAbnormalSensedAta80Rest: {},
  EcamDeferredProcAta80Rest: {},
}));
vi.mock('../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/secondary-failures', () => ({
  EcamAbnormalSecondaryFailures: {},
}));

/**
 * A boolean Subject that also answers any other property or index with another such Subject: the alert tables of the
 * FWS read nested members of FwsCore (alerts.engineBleedNotClosed[engine]) while they are built
 */
function nestedSubject(): Subject<boolean> {
  const children: Record<string, unknown> = {};
  const subject = Subject.create(false);
  // a function target, so that FwsCore methods (this.fws.trimAirMonitoringFlags()) can be called too
  return new Proxy(() => nestedSubject(), {
    get: (_target, name) => {
      if (name in subject) {
        // methods run on the Subject itself, so that its private fields stay out of the proxy
        const member = (subject as unknown as Record<string | symbol, unknown>)[name];
        return typeof member === 'function' ? member.bind(subject) : member;
      }
      if (typeof name === 'symbol') {
        return undefined;
      }
      if (!(name in children)) {
        children[name] = nestedSubject();
      }
      return children[name];
    },
  }) as unknown as Subject<boolean>;
}

/**
 * An FwsCore stand-in for FwsAbnormalSensed and FwsInopSys: brakeSteerAlerts is the real FwsBrakeAlerts, bus a real EventBus, every other
 * property is a boolean Subject created false on first access (nested: also answering nested members and calls, which
 * FwsAbnormalSensed needs to be built; FwsInopSys needs plain Subjects for its mapped subjects to read false)
 */
function fakeFws(nested = true): {
  fws: FwsCore;
  subjects: Record<string, Subject<boolean>>;
  brakeAlerts: FwsBrakeAlerts;
} {
  const subjects: Record<string, Subject<boolean>> = {};
  const brakeAlerts = new FwsBrakeAlerts();
  const bus = new EventBus();
  const fws = new Proxy(
    {},
    {
      get: (_target, name: string) => {
        if (name === 'brakeSteerAlerts') {
          return brakeAlerts;
        }
        if (name === 'bus') {
          return bus;
        }
        if (!(name in subjects)) {
          subjects[name] = nested ? nestedSubject() : Subject.create(false);
        }
        return subjects[name];
      },
    },
  ) as unknown as FwsCore;
  return { fws, subjects, brakeAlerts };
}

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
    pedalBrakingMode: 1,
    antiSkidSwitchOn: true,
    autoBrkFault: false,
    ...overrides,
  };
}

/** Runs the alerts for a number of seconds in 100 ms steps */
function run(alerts: FwsBrakeAlerts, seconds: number, input: BrakeSteerInputs, parkBrakeOn: boolean): void {
  for (let t = 0; t < seconds * 10; t++) {
    alerts.update(100, input, parkBrakeOn);
  }
}

describe('BRAKES alerts from the BCS and EBCU faults', () => {
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

describe('STEER alerts from the SCS and steering faults', () => {
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

describe('BRAKES A-SKID FAULT ON ALL L/G and AUTO BRK FAULT', () => {
  it('raises A-SKID FAULT ON ALL L/G in emergency braking with the A-SKID sw ON', () => {
    expect(aSkidFaultOnAllLg(inputs({ pedalBrakingMode: 3 }))).toBe(true);
  });

  it('does not raise A-SKID FAULT ON ALL L/G with the A-SKID sw OFF: A-SKID OFF shows instead', () => {
    expect(aSkidFaultOnAllLg(inputs({ pedalBrakingMode: 3, antiSkidSwitchOn: false }))).toBe(false);
  });

  it('does not raise A-SKID FAULT ON ALL L/G in normal or alternate braking, or without pedal braking', () => {
    expect(aSkidFaultOnAllLg(inputs({ pedalBrakingMode: 1 }))).toBe(false);
    expect(aSkidFaultOnAllLg(inputs({ pedalBrakingMode: 2 }))).toBe(false);
    expect(aSkidFaultOnAllLg(inputs({ pedalBrakingMode: 0 }))).toBe(false);
  });

  it('sets both alerts from the inputs', () => {
    const alerts = new FwsBrakeAlerts();
    run(alerts, 1, inputs(), false);
    expect(alerts.aSkidFaultOnAllLg.get()).toBe(false);
    expect(alerts.autoBrkFault.get()).toBe(false);
    run(alerts, 1, inputs({ pedalBrakingMode: 3, autoBrkFault: true }), false);
    expect(alerts.aSkidFaultOnAllLg.get()).toBe(true);
    expect(alerts.autoBrkFault.get()).toBe(true);
  });
});

describe('BRAKES ACCU PRESS LO and PARK BRK PRESS LO', () => {
  it('raises ACCU PRESS LO after 10 s in the amber arc of the accumulator pressure (below 3 840 psi)', () => {
    expect(ACCU_PRESS_LO_PSI).toBe(3840);
    const alerts = new FwsBrakeAlerts();
    run(alerts, 9, inputs({ accuPressurePsi: 3800 }), false);
    expect(alerts.accuPressLo.get()).toBe(false);
    run(alerts, 2, inputs({ accuPressurePsi: 3800 }), false);
    expect(alerts.accuPressLo.get()).toBe(true);

    run(alerts, 1, inputs({ accuPressurePsi: 3900 }), false);
    expect(alerts.accuPressLo.get()).toBe(false);
  });

  it('does not raise ACCU PRESS LO after one park brake application of a charged accumulator (4 100 psi left)', () => {
    const alerts = new FwsBrakeAlerts();
    run(alerts, 20, inputs({ accuPressurePsi: 4100, altnLeftPressurePsi: 3600, altnRightPressurePsi: 3600 }), true);
    expect(alerts.accuPressLo.get()).toBe(false);
  });

  it('raises PARK BRK PRESS LO after 5 s below 1 700 psi on one side with the park brake on', () => {
    const alerts = new FwsBrakeAlerts();
    const low = inputs({ altnLeftPressurePsi: 3600, altnRightPressurePsi: PARK_BRK_PRESS_LO_PSI - 100 });
    run(alerts, 4, low, true);
    expect(alerts.parkBrkPressLo.get()).toBe(false);
    run(alerts, 2, low, true);
    expect(alerts.parkBrkPressLo.get()).toBe(true);
  });

  it('does not raise PARK BRK PRESS LO with the park brake off, or at the park brake pressure of the model', () => {
    const alerts = new FwsBrakeAlerts();
    run(alerts, 10, inputs(), false);
    expect(alerts.parkBrkPressLo.get()).toBe(false);
    run(alerts, 10, inputs({ altnLeftPressurePsi: 3600, altnRightPressurePsi: 3600 }), true);
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
      'L:A32NX_BRAKES_PEDAL_BRAKING_MODE',
      'A:ANTISKID BRAKES ACTIVE',
      'L:A32NX_BRAKES_AUTO_BRK_FAULT',
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
    const hydraulics = readFileSync(
      resolve(__dirname, '../../../../wasm/systems/a380_systems/src/hydraulic/mod.rs'),
      'utf-8',
    );
    expect(hydraulics).toContain('"BRAKES_PEDAL_BRAKING_MODE"');
    const autobrakes = readFileSync(
      resolve(__dirname, '../../../../wasm/systems/a380_systems/src/hydraulic/autobrakes.rs'),
      'utf-8',
    );
    expect(autobrakes).toContain('"BRAKES_AUTO_BRK_FAULT"');
  });

  it('the park brake handle read from the simvars decides PARK BRK PRESS LO', () => {
    const lowPressure = {
      'L:A32NX_HYD_BRAKE_ALTN_ACC_PRESS': 5000,
      'L:A32NX_HYD_BRAKE_ALTN_LEFT_PRESS': 3600,
      'L:A32NX_HYD_BRAKE_ALTN_RIGHT_PRESS': PARK_BRK_PRESS_LO_PSI - 100,
    };
    const readWithHandle = (handle: number) => (name: string) => {
      if (name === 'L:A32NX_PARK_BRAKE_LEVER_POS') {
        return handle;
      }
      return (lowPressure as Record<string, number>)[name] ?? 0;
    };

    const handleOff = new FwsBrakeAlerts();
    for (let t = 0; t < 100; t++) {
      handleOff.updateFromSimVars(100, readWithHandle(0));
    }
    expect(handleOff.parkBrkPressLo.get()).toBe(false);

    const handleOn = new FwsBrakeAlerts();
    for (let t = 0; t < 100; t++) {
      handleOn.updateFromSimVars(100, readWithHandle(1));
    }
    expect(handleOn.parkBrkPressLo.get()).toBe(true);
  });

  it('reads the park brake handle as ON only at position 1', () => {
    expect(isParkBrakeHandleOn(() => 1)).toBe(true);
    expect(isParkBrakeHandleOn(() => 0)).toBe(false);
    expect(isParkBrakeHandleOn(() => 2)).toBe(false);
  });

  /**
   * Level (failure: 1 without audio and master light, 2 with SC and MASTER CAUT) and flight phase inhibition of each
   * alert, as published for the aircraft.
   */
  const expectedAlerts: [string, string, number, number[]][] = [
    ['320800020', 'normBrkFault', 1, [3, 4, 5, 6, 7, 10, 11]],
    ['320800011', 'altnBrkFault', 1, [3, 4, 5, 6, 7, 9, 10]],
    ['320800017', 'emerBrkFault', 1, [3, 4, 5, 6, 7, 9, 10]],
    ['320800010', 'altnEmerBrkFault', 1, [3, 4, 5, 6, 7, 9, 10]],
    ['320800024', 'pedalBrakingFault', 2, [4, 5, 6, 7]],
    ['320800009', 'accuPressLo', 2, [3, 4, 5, 6, 7, 9, 10]],
    ['320800023', 'parkBrkPressLo', 2, [3, 4, 5, 6, 7, 8, 9, 10]],
    ['320800001', 'aSkidFaultOnAllLg', 2, [4, 5, 6, 7]],
    ['320800013', 'autoBrkFault', 2, [3, 4, 5, 6, 7]],
    ['320800060', 'normNwSteerFault', 2, [3, 4, 5, 6, 7, 10]],
    ['320800047', 'altnNwSteerFault', 1, [3, 4, 5, 6, 7, 9, 10, 11]],
    ['320800058', 'nwSteerFault', 2, [4, 5, 6, 7]],
    ['320800049', 'bwSteerFault', 1, [3, 4, 5, 6, 7, 9, 10]],
    ['320800053', 'steerCtl1Fault', 1, [3, 4, 5, 6, 7, 9, 10, 11]],
    ['320800054', 'steerCtl2Fault', 1, [3, 4, 5, 6, 7, 9, 10, 11]],
    ['320800055', 'nwBwSteerFault', 2, [4, 5, 6, 7]],
  ];

  it.each(expectedAlerts)('wires %s to %s with level %i and the phase inhibition', (id, subject, level, phases) => {
    const { fws, brakeAlerts } = fakeFws();
    const alert = new FwsAbnormalSensed(fws).ewdAbnormalSensed[id];
    expect(alert, id).toBeDefined();
    expect(alert.simVarIsActive).toBe(brakeAlerts[subject as keyof FwsBrakeAlerts]);
    expect(alert.failure).toBe(level);
    expect(alert.flightPhaseInhib).toEqual(phases);
    expect(alert.sysPage).toBe(SdPages.Wheel);
  });
});

/*
 * BRAKES BTV FAULT: an engine 2 or 3 out makes BTV inoperative through the ENG 1(2)(3)(4) SHUT DOWN STATUS, not
 * through this caution, although the FCDC BTV LOST bit is also set by an inner engine not running.
 */
describe('BRAKES BTV FAULT trigger', () => {
  it('triggers on BTV LOST with all the inner engines running', () => {
    expect(btvFaultCautionTriggered(true, true, true)).toBe(true);
  });

  it.each([
    [false, true, 'engine 2 not running'],
    [true, false, 'engine 3 not running'],
    [false, false, 'engines 2 and 3 not running'],
  ])('does not trigger on BTV LOST with %s/%s (%s)', (engine2Running, engine3Running) => {
    expect(btvFaultCautionTriggered(true, engine2Running, engine3Running)).toBe(false);
  });

  it('does not trigger without BTV LOST', () => {
    expect(btvFaultCautionTriggered(false, true, true)).toBe(false);
  });

  it('320800014 BTV FAULT reads the caution trigger, the INOP SYS BTV keeps the FCDC BTV LOST', () => {
    const { fws, subjects } = fakeFws();
    const alert = new FwsAbnormalSensed(fws).ewdAbnormalSensed['320800014'];
    expect(alert.simVarIsActive).toBe(subjects.btvFaultCaution);
    expect(alert.failure).toBe(2);

    const plain = fakeFws(false);
    const btvInopSys = new FwsInopSys(plain.fws).inopSys['320300007'];
    expect(btvInopSys.simVarIsActive.get()).toBe(false);
    plain.subjects.btvLost.set(true);
    expect(btvInopSys.simVarIsActive.get()).toBe(true);
  });
});
