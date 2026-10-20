// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  FuelTransferFaultInputs,
  FuelTransferFaultMonitor,
  isManualTransferRequired,
  NO_TRANSFER_RESTRICTION,
} from './FuelTransferFaults';

const FQMS_1 = 1 << 0;
const FQMS_2 = 1 << 1;
const FQDC_1 = 1 << 2;
const FQDC_2 = 1 << 3;
const AGP_1 = 1 << 4;
const AGP_2 = 1 << 5;

/** Tank bits in the A380FuelTankType order: L OUTER 0, FEED 1 1, L MID 2, L INNER 3, FEED 2 4 ... TRIM 10 */
const FEED_1_TANK = 1 << 1;
const LEFT_OUTER_TANK = 1 << 0;

function normal(): FuelTransferFaultInputs {
  return {
    quantitySystemFaultsWord: 0,
    fqiLostTanksWord: 0,
    onGround: false,
    fwdGalleryInletValveOpen: false,
    aftGalleryInletValveOpen: false,
    trimTankIsolationValveClosed: false,
    trimAndApuLineDamaged: false,
    wingTankOverflow: false,
    manualTransferSelected: false,
  };
}

describe('Manual transfer required (FUEL MAN XFR PROCEDURE)', () => {
  it.each([
    ['both FQMS', FQMS_1 | FQMS_2],
    ['both FQDCs (with their AGPs)', FQDC_1 | FQDC_2 | AGP_1 | AGP_2],
    ['both AGPs', AGP_1 | AGP_2],
  ])('with %s failed', (_name, word) => {
    expect(isManualTransferRequired({ ...normal(), quantitySystemFaultsWord: word })).toBe(true);
  });

  it('not with one FQMS, one FQDC or one AGP failed', () => {
    for (const word of [FQMS_1, FQMS_2, FQDC_1 | AGP_1, AGP_2]) {
      expect(isManualTransferRequired({ ...normal(), quantitySystemFaultsWord: word })).toBe(false);
    }
  });

  it('with the quantity of a feed tank lost, not with that of a wing tank', () => {
    expect(isManualTransferRequired({ ...normal(), fqiLostTanksWord: FEED_1_TANK })).toBe(true);
    expect(isManualTransferRequired({ ...normal(), fqiLostTanksWord: LEFT_OUTER_TANK })).toBe(false);
  });
});

describe('FuelTransferFaultMonitor', () => {
  it('restricts nothing on a normal aircraft', () => {
    expect(new FuelTransferFaultMonitor().update(normal())).toEqual(NO_TRANSFER_RESTRICTION);
  });

  it('stops the automatic transfers for the rest of the flight once a manual transfer was required', () => {
    const monitor = new FuelTransferFaultMonitor();
    const failed = { ...normal(), quantitySystemFaultsWord: FQMS_1 | FQMS_2 };
    expect(monitor.update(failed)).toMatchObject({ manualTransferRequired: true, automaticTransfersLost: true });
    // FQMS recovered in flight: still manual
    expect(monitor.update(normal())).toMatchObject({ manualTransferRequired: true, automaticTransfersLost: true });
    // On ground without the failure: automatic again
    expect(monitor.update({ ...normal(), onGround: true })).toEqual(NO_TRANSFER_RESTRICTION);
  });

  it('one gallery not usable inhibits the CG transfers; the forward one also the pumped outer tank transfer', () => {
    expect(new FuelTransferFaultMonitor().update({ ...normal(), aftGalleryInletValveOpen: true })).toEqual({
      ...NO_TRANSFER_RESTRICTION,
      cgTransfersInhibited: true,
    });
    expect(new FuelTransferFaultMonitor().update({ ...normal(), fwdGalleryInletValveOpen: true })).toEqual({
      ...NO_TRANSFER_RESTRICTION,
      cgTransfersInhibited: true,
      outerPumpedTransferLost: true,
    });
  });

  it('both galleries not usable: no automatic transfer and no transfer out of the inner, mid and trim tanks', () => {
    const restrictions = new FuelTransferFaultMonitor().update({
      ...normal(),
      fwdGalleryInletValveOpen: true,
      aftGalleryInletValveOpen: true,
    });
    expect(restrictions).toMatchObject({
      manualTransferRequired: false,
      automaticTransfersLost: true,
      innerMidTrimTransfersLost: true,
      outerPumpedTransferLost: true,
    });
  });

  it('a wing tank overflow during an automatic transfer makes the transfers manual for the rest of the flight', () => {
    const monitor = new FuelTransferFaultMonitor();
    expect(monitor.update({ ...normal(), wingTankOverflow: true })).toMatchObject({
      manualTransferRequired: true,
      automaticTransfersLost: true,
    });
    // The surge tank drained back in flight: still manual
    expect(monitor.update(normal())).toMatchObject({ manualTransferRequired: true, automaticTransfersLost: true });
    expect(monitor.update({ ...normal(), onGround: true })).toEqual(NO_TRANSFER_RESTRICTION);
  });

  it('a wing tank overflow during a manual transfer leaves the automatic transfers, even once set back to AUTO', () => {
    const monitor = new FuelTransferFaultMonitor();
    expect(monitor.update({ ...normal(), wingTankOverflow: true, manualTransferSelected: true })).toEqual(
      NO_TRANSFER_RESTRICTION,
    );
    expect(monitor.update({ ...normal(), wingTankOverflow: true })).toEqual(NO_TRANSFER_RESTRICTION);
  });

  it('the trim tank: no automatic transfer with its isolation valve closed or its lines damaged', () => {
    expect(new FuelTransferFaultMonitor().update({ ...normal(), trimTankIsolationValveClosed: true })).toEqual({
      ...NO_TRANSFER_RESTRICTION,
      trimTankAutomaticTransfersInhibited: true,
      trimTankIsolationValveClosed: true,
    });
    expect(new FuelTransferFaultMonitor().update({ ...normal(), trimAndApuLineDamaged: true })).toEqual({
      ...NO_TRANSFER_RESTRICTION,
      trimTankAutomaticTransfersInhibited: true,
    });
  });
});
