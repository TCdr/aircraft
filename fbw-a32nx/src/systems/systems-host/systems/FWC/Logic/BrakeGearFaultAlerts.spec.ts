// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  BrakeGearFaultInputs,
  BrakeGearFaultAlerts,
  BrakeGearFaultKeys,
  isGearUplockFault,
} from './BrakeGearFaultAlerts';
import { LgciuGearPosition } from './LandingGearAlerts';
import { ewdLines, pseudoFwcSource, statusLines } from './FwcAlertSpecHelpers';

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

  it('the PseudoFWC updates and shows the alerts', () => {
    const fwc = pseudoFwcSource();
    expect(fwc).toContain('this.brakeGearFaultAlerts.update(readBrakeGearFaultInputs(landingGearInputs.lgcius));');
    expect(fwc).toContain('...this.brakeGearFaultAlerts.ewdFailures,');
  });
});
