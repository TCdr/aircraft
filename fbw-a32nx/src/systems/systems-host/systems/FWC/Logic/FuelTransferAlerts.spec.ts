// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  AUTO_TRANSFER_FAULT_PHASE_INHIBITION,
  CTR_TK_XFR_OFF_PHASE_INHIBITION,
  FuelTransferAlertKeys,
  FuelTransferAlerts,
  FuelTransferInputs,
  isAutoTransferFault,
  isCentreTankTransferOff,
} from './FuelTransferAlerts';
import { ewdLines, pseudoFwcSource, statusLines } from './FwcAlertSpecHelpers';

const normal: FuelTransferInputs = {
  modeSelMan: false,
  centreLeftTransferOn: true,
  centreRightTransferOn: true,
  centreTankKg: 4000,
  leftWingTanksKg: 6200,
  rightWingTanksKg: 6200,
};

/* More than 250 kg in the centre tank and less than 5 000 kg in the left or right wing tanks. */
describe('FUEL AUTO TRANSFER FAULT', () => {
  it('triggers with fuel in the centre tank and a wing below 5 000 kg', () => {
    expect(isAutoTransferFault(normal)).toBe(false);
    expect(isAutoTransferFault({ ...normal, leftWingTanksKg: 4999 })).toBe(true);
    expect(isAutoTransferFault({ ...normal, rightWingTanksKg: 4999 })).toBe(true);
  });

  it('does not trigger with 250 kg or less in the centre tank', () => {
    expect(isAutoTransferFault({ ...normal, centreTankKg: 250, leftWingTanksKg: 3000 })).toBe(false);
  });

  it('asks for MODE SEL MAN and CTR TK L(R) XFR ON, hides the done actions; STATUS CTR TK FEED: MAN ONLY', () => {
    const alerts = new FuelTransferAlerts();
    alerts.update({ ...normal, leftWingTanksKg: 4000, centreRightTransferOn: false });
    const item = alerts.ewdFailures[FuelTransferAlertKeys.autoTransferFault];
    expect(item.simVarIsActive.get()).toBe(true);
    expect(ewdLines(item)).toEqual([
      'FUEL AUTO TRANSFER FAULT',
      ' -FUEL MODE SEL......MAN',
      ' -CTR TK R XFR........ON',
    ]);
    expect(statusLines({ left: item.statusInfo(), inopSys: item.inopSys() }).left).toEqual(['CTR TK FEED: MAN ONLY']);
    expect(AUTO_TRANSFER_FAULT_PHASE_INHIBITION).toEqual([2, 3, 4, 5, 7, 8]);
  });
});

/* Both CTR TK XFR pb-sw OFF with the system in automatic mode; the lines ask for CTR TK L XFR ON, CTR TK R XFR ON. */
describe('FUEL CTR TK XFR OFF', () => {
  const off = { ...normal, centreLeftTransferOn: false, centreRightTransferOn: false };

  it('triggers with both pb-sw OFF in AUTO mode only', () => {
    expect(isCentreTankTransferOff(off)).toBe(true);
    expect(isCentreTankTransferOff({ ...off, modeSelMan: true })).toBe(false);
    expect(isCentreTankTransferOff({ ...off, centreLeftTransferOn: true })).toBe(false);
  });

  it('asks for both pb-sw ON, shown in phases 2 and 6 only', () => {
    const alerts = new FuelTransferAlerts();
    alerts.update(off);
    const item = alerts.ewdFailures[FuelTransferAlertKeys.centreTankTransferOff];
    expect(item.simVarIsActive.get()).toBe(true);
    expect(ewdLines(item)).toEqual(['FUEL CTR TK XFR OFF', ' -CTR TK L XFR........ON', ' -CTR TK R XFR........ON']);
    expect(CTR_TK_XFR_OFF_PHASE_INHIBITION).toEqual([1, 3, 4, 5, 7, 8, 9, 10]);
  });

  it('is wired in the PseudoFWC', () => {
    const fwc = pseudoFwcSource();
    expect(fwc).toContain('...this.fuelTransferAlerts.ewdFailures');
    expect(fwc).toContain('this.fuelTransferAlerts.update(readFuelTransferInputs(');
  });
});
