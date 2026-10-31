// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTO_TRANSFER_FAULT_PHASE_INHIBITION,
  CTR_TK_XFR_OFF_PHASE_INHIBITION,
  FuelTransferAlertKeys,
  FuelTransferAlerts,
  FuelTransferInputs,
  isAutoTransferFault,
  isCentreTankTransferOff,
} from './FuelTransferAlerts';
import { ewdLines, statusLines } from './FwcAlertSpecHelpers';
import { installFwcSimVarMocks, runFwc } from '../PseudoFwcTestBed';
import { failureItem, isAlertTriggered, shownText, startCruiseFwc } from '../FwcAlertProbe';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

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
});

describe('the real FWC: fuel transfer alerts', () => {
  const KG_PER_GALLON = 3;
  let simvars: Map<string, number>;

  beforeEach(() => {
    ({ simvars } = installFwcSimVarMocks());
    simvars.set('FUEL WEIGHT PER GALLON', KG_PER_GALLON);
  });

  it('raises FUEL CTR TK XFR OFF with both pb-sw OFF in AUTO mode, and asks for them ON', () => {
    const { fwc, bus } = startCruiseFwc(simvars);
    const key = FuelTransferAlertKeys.centreTankTransferOff;
    expect(isAlertTriggered(fwc, key)).toBe(false);
    expect(failureItem(fwc, key).flightPhaseInhib).toEqual(CTR_TK_XFR_OFF_PHASE_INHIBITION);

    simvars.set('L:A32NX_OVHD_FUEL_CTR_TK_L_XFR_PB_IS_ON', 0);
    runFwc(fwc, 1);
    expect(isAlertTriggered(fwc, key)).toBe(false);

    simvars.set('L:A32NX_OVHD_FUEL_CTR_TK_R_XFR_PB_IS_ON', 0);
    runFwc(fwc, 1);
    expect(isAlertTriggered(fwc, key)).toBe(true);
    expect(shownText(fwc, key)).toEqual(['FUEL CTR TK XFR OFF', '-CTR TK L XFR........ON', '-CTR TK R XFR........ON']);

    // the MAN mode of the CTR TK MODE SEL pb-sw takes the alert away
    bus.getPublisher<any>().pub('fuel_ctr_tk_mode_sel_man', true, false, true);
    runFwc(fwc, 1);
    expect(isAlertTriggered(fwc, key)).toBe(false);
  });

  it('raises FUEL AUTO TRANSFER FAULT from the tank quantities of the systems', () => {
    const { fwc } = startCruiseFwc(simvars, () => {
      simvars.set('FUEL TANK CENTER QUANTITY', 4000 / KG_PER_GALLON);
      simvars.set('FUEL TANK LEFT MAIN QUANTITY', 6200 / KG_PER_GALLON);
      simvars.set('FUEL TANK RIGHT MAIN QUANTITY', 6200 / KG_PER_GALLON);
    });
    const key = FuelTransferAlertKeys.autoTransferFault;
    expect(failureItem(fwc, key).flightPhaseInhib).toEqual(AUTO_TRANSFER_FAULT_PHASE_INHIBITION);
    expect(isAlertTriggered(fwc, key)).toBe(false);

    simvars.set('FUEL TANK RIGHT MAIN QUANTITY', 4999 / KG_PER_GALLON);
    runFwc(fwc, 1);
    expect(isAlertTriggered(fwc, key)).toBe(true);
  });
});
