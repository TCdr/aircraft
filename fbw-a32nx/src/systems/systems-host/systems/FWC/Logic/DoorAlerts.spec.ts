// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  DOOR_PHASE_INHIBITION,
  DoorAlertKeys,
  DoorAlerts,
  DoorsNotClosed,
  isInteractivePointNotClosed,
} from './DoorAlerts';
import { ewdLines, pseudoFwcSource, statusLines } from './FwcAlertSpecHelpers';

const allClosed = Object.values(DoorAlertKeys).reduce(
  (doors, key) => ({ ...doors, [key]: false }),
  {} as Record<string, boolean>,
) as DoorsNotClosed;

/* A door not detected closed by its proximity sensor: in flight IF ABN CAB V/S: MAX FL 100/MEA-MORA (E/WD and
 * STATUS), on ground crew awareness */
describe('DOOR cautions', () => {
  it('a door is not closed as soon as its interactive point is open at all', () => {
    expect(isInteractivePointNotClosed(0)).toBe(false);
    expect(isInteractivePointNotClosed(1)).toBe(true);
  });

  it.each([
    [DoorAlertKeys.leftForwardCabin, 'DOOR L FWD CABIN'],
    [DoorAlertKeys.rightForwardCabin, 'DOOR R FWD CABIN'],
    [DoorAlertKeys.leftAftCabin, 'DOOR L AFT CABIN'],
    [DoorAlertKeys.rightAftCabin, 'DOOR R AFT CABIN'],
    [DoorAlertKeys.leftEmergencyExit, 'DOOR L EMER EXIT'],
    [DoorAlertKeys.rightEmergencyExit, 'DOOR R EMER EXIT'],
    [DoorAlertKeys.forwardCargo, 'DOOR FWD CARGO'],
    [DoorAlertKeys.aftCargo, 'DOOR AFT CARGO'],
  ])('%s: on ground the title only, its door alone', (key, title) => {
    const alerts = new DoorAlerts();
    alerts.update({ ...allClosed, [key]: true }, true);
    const item = alerts.ewdFailures[key];
    expect(item.simVarIsActive.get()).toBe(true);
    expect(ewdLines(item)).toEqual([title]);
    expect(item.statusInfo()).toEqual([]);
    const others = Object.values(DoorAlertKeys).filter((other) => other !== key);
    expect(others.some((other) => alerts.ewdFailures[other].simVarIsActive.get())).toBe(false);
  });

  it('in flight: IF ABN CAB V/S: MAX FL 100/MEA-MORA, also on the STATUS page', () => {
    const alerts = new DoorAlerts();
    alerts.update({ ...allClosed, [DoorAlertKeys.forwardCargo]: true }, false);
    const item = alerts.ewdFailures[DoorAlertKeys.forwardCargo];
    expect(ewdLines(item)).toEqual(['DOOR FWD CARGO', '   .IF ABN CAB V/S:', ' MAX FL.....100/MEA-MORA']);
    expect(statusLines({ left: item.statusInfo(), inopSys: item.inopSys() }).left).toEqual([
      'IF ABN CAB V/S:',
      'MAX FL.....100/MEA-MORA',
    ]);
  });

  it('are amber cautions on the DOOR page, shown in phases 2, 3, 6 and 9', () => {
    const item = new DoorAlerts().ewdFailures[DoorAlertKeys.leftForwardCabin];
    expect(item.failure).toBe(2);
    expect(DOOR_PHASE_INHIBITION).toEqual([1, 4, 5, 7, 8, 10]);
  });

  it('are wired in the PseudoFWC', () => {
    const fwc = pseudoFwcSource();
    expect(fwc).toContain('...this.doorAlerts.ewdFailures');
    expect(fwc).toContain('this.doorAlerts.update(readDoorsNotClosed()');
  });
});
