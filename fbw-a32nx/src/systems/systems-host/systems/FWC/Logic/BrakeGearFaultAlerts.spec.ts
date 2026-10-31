// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';
import {
  BrakeGearFaultInputs,
  BrakeGearFaultAlerts,
  BrakeGearFaultKeys,
  isGearUplockFault,
} from './BrakeGearFaultAlerts';
import { LgciuGearPosition } from './LandingGearAlerts';
import { ewdLines, statusLines } from './FwcAlertSpecHelpers';
import { discreteWordWithBits, probedFailure, shownLineText, startCruiseFwc } from '../FwcControlsAlertProbe';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

const gearDown: LgciuGearPosition = {
  downlocked: [true, true, true],
  notLockedUp: [true, true, true],
  doorNotClosed: [false, false, false],
  leverUp: false,
};

/** The LH gear uplock engaged again while that gear is downlocked */
const leftUplockLockedGearDown: LgciuGearPosition = { ...gearDown, notLockedUp: [false, true, true] };

const invalid: LgciuGearPosition = { downlocked: null, notLockedUp: null, doorNotClosed: null, leverUp: null };

const parked: BrakeGearFaultInputs = { parkBrakeFault: false, parkBrakeHandleOn: true, lgcius: [gearDown, gearDown] };

describe('BRAKES PARK BRK FAULT', () => {
  it('follows the parking brake fault of the systems', () => {
    const alerts = new BrakeGearFaultAlerts();
    const item = alerts.ewdFailures[BrakeGearFaultKeys.parkBrakeFault];
    alerts.update(parked);
    expect(item.simVarIsActive.get()).toBe(false);
    alerts.update({ ...parked, parkBrakeFault: true });
    expect(item.simVarIsActive.get()).toBe(true);
    alerts.update(parked);
    expect(item.simVarIsActive.get()).toBe(false);
  });

  it('handle OFF with the pressure applied: BRK PRESS STILL APPLIED', () => {
    const alerts = new BrakeGearFaultAlerts();
    alerts.update({ ...parked, parkBrakeFault: true, parkBrakeHandleOn: false });
    expect(ewdLines(alerts.ewdFailures[BrakeGearFaultKeys.parkBrakeFault])).toEqual([
      'BRAKES PARK BRK FAULT',
      'BRK PRESS STILL APPLIED',
    ]);
  });

  it('handle ON without pressure: BRK PRESS RELEASED, -PARK BRK OFF, BEFORE ENG SHUT DOWN: -CHOCKS CONSIDER', () => {
    const alerts = new BrakeGearFaultAlerts();
    alerts.update({ ...parked, parkBrakeFault: true });
    const item = alerts.ewdFailures[BrakeGearFaultKeys.parkBrakeFault];
    expect(ewdLines(item)).toEqual([
      'BRAKES PARK BRK FAULT',
      'BRK PRESS RELEASED',
      ' -PARK BRK...........OFF',
      ' .BEFORE ENG SHUT DOWN:',
      ' -CHOCKS........CONSIDER',
    ]);
    expect(item.failure).toBe(2);
    expect(item.flightPhaseInhib).toEqual([3, 4, 5, 6, 7, 8]);
    expect([...item.statusInfo(), ...item.inopSys()]).toEqual([]);
  });
});

describe('L/G GEAR UPLOCK FAULT', () => {
  it('on when a gear uplock is engaged while that gear is downlocked', () => {
    expect(isGearUplockFault([gearDown, gearDown])).toBe(false);
    expect(isGearUplockFault([leftUplockLockedGearDown, leftUplockLockedGearDown])).toBe(true);
    // a gear uplocked in its uplock is not downlocked
    const gearUp: LgciuGearPosition = {
      ...gearDown,
      downlocked: [false, false, false],
      notLockedUp: [false, false, false],
    };
    expect(isGearUplockFault([gearUp, gearUp])).toBe(false);
  });

  it('uses the only valid LGCIU, and needs both valid LGCIUs to agree', () => {
    expect(isGearUplockFault([invalid, leftUplockLockedGearDown])).toBe(true);
    expect(isGearUplockFault([leftUplockLockedGearDown, gearDown])).toBe(false);
    expect(isGearUplockFault([invalid, invalid])).toBe(false);
  });

  it('-L/G KEEP DOWN, MAX SPEED 280/.67, FUEL CONSUMPT INCRSD, FMS PRED UNRELIABLE; STATUS, INOP SYS L/G RETRACT', () => {
    const alerts = new BrakeGearFaultAlerts();
    alerts.update({ ...parked, lgcius: [leftUplockLockedGearDown, leftUplockLockedGearDown] });
    const item = alerts.ewdFailures[BrakeGearFaultKeys.gearUplockFault];
    expect(item.simVarIsActive.get()).toBe(true);
    expect(item.failure).toBe(2);
    expect(item.flightPhaseInhib).toEqual([4]);
    expect(ewdLines(item)).toEqual([
      'L/G GEAR UPLOCK FAULT',
      ' -L/G..........KEEP DOWN',
      ' MAX SPEED.......280/.67',
      ' FUEL CONSUMPT INCRSD',
      ' FMS PRED UNRELIABLE',
    ]);
    expect(statusLines({ left: item.statusInfo(), inopSys: item.inopSys() })).toEqual({
      left: ['MAX SPEED.......280/.67', 'L/G...........KEEP DOWN', 'FUEL CONSUMPT INCRSD', 'FMS PRED UNRELIABLE'],
      right: ['INOP SYS', 'L/G RETRACT'],
    });
  });

  it('the PseudoFWC raises the alerts from the park brake simvars and the LGCIU words', () => {
    const rig = startCruiseFwc();
    const parkBrakeFault = probedFailure(rig.fwc, BrakeGearFaultKeys.parkBrakeFault);
    const gearUplockFault = probedFailure(rig.fwc, BrakeGearFaultKeys.gearUplockFault);
    expect(parkBrakeFault.simVarIsActive.get()).toBe(false);
    expect(gearUplockFault.simVarIsActive.get()).toBe(false);

    // park brake handle OFF with pressure applied
    rig.simvars.set('L:A32NX_PARK_BRAKE_FAULT', 1);
    rig.run(1);
    expect(parkBrakeFault.simVarIsActive.get()).toBe(true);
    expect(shownLineText(parkBrakeFault)[1]).toBe('BRK PRESS STILL APPLIED');
    rig.simvars.set('L:A32NX_PARK_BRAKE_LEVER_POS', 1);
    rig.run(1);
    expect(shownLineText(parkBrakeFault)[1]).toBe('BRK PRESS RELEASED');

    // both LGCIUs: all gears downlocked (word 1 bits 23-25), the LH gear locked up again (word 3 bit 11 clear)
    for (const lgciu of [1, 2]) {
      rig.simvars.set(`L:A32NX_LGCIU_${lgciu}_DISCRETE_WORD_1`, discreteWordWithBits(23, 24, 25));
      rig.simvars.set(`L:A32NX_LGCIU_${lgciu}_DISCRETE_WORD_3`, discreteWordWithBits(12, 13));
    }
    rig.run(1);
    expect(gearUplockFault.simVarIsActive.get()).toBe(true);
    for (const lgciu of [1, 2]) {
      rig.simvars.set(`L:A32NX_LGCIU_${lgciu}_DISCRETE_WORD_3`, discreteWordWithBits(11, 12, 13));
    }
    rig.run(1);
    expect(gearUplockFault.simVarIsActive.get()).toBe(false);
  });
});
