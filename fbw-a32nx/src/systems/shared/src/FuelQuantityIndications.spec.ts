// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { FuelTransferFailures, isFuelOnBoardHalfBoxed, isOuterTankQuantityBoxed } from './FuelQuantityIndications';

const none: FuelTransferFailures = {
  leftOuterXfrClosed: false,
  rightOuterXfrClosed: false,
  leftCentreXfrFailedClosed: false,
  rightCentreXfrFailedClosed: false,
};

/* A320 FCOM DSC-28-20 TOTAL FUEL INDICATION and SD FUEL page FOB (a320_fcom.txt l.43341-43345, l.43275-43278) */
describe('FOB amber half box', () => {
  it('is not drawn without transfer valve failure', () => {
    expect(isFuelOnBoardHalfBoxed(none)).toBe(false);
  });

  it('is drawn when the outer tank transfer valves of a wing failed to open (intercell transfer valve failure)', () => {
    expect(isFuelOnBoardHalfBoxed({ ...none, leftOuterXfrClosed: true })).toBe(true);
    expect(isFuelOnBoardHalfBoxed({ ...none, rightOuterXfrClosed: true })).toBe(true);
  });

  it('is drawn when both centre tank transfer valves failed closed, not with one of them', () => {
    expect(isFuelOnBoardHalfBoxed({ ...none, leftCentreXfrFailedClosed: true, rightCentreXfrFailedClosed: true })).toBe(
      true,
    );
    expect(isFuelOnBoardHalfBoxed({ ...none, leftCentreXfrFailedClosed: true })).toBe(false);
  });
});

/* A320 FCOM DSC-28-20 FUEL QUANTITY - BOXED INDICATIONS (a320_fcom.txt l.43219-43223) */
describe('SD FUEL outer tank quantity amber box', () => {
  it('follows the failure of the outer tank transfer valves of its wing', () => {
    expect(isOuterTankQuantityBoxed(true)).toBe(true);
    expect(isOuterTankQuantityBoxed(false)).toBe(false);
  });
});

describe('fuel quantity boxes wiring', () => {
  const instruments = resolve(__dirname, '../../instruments/src');

  it('half-boxes the E/WD and SD FUEL page FOB, boxes the SD outer quantities', () => {
    const ewdFob = readFileSync(resolve(instruments, 'EWD/FOB.tsx'), 'utf-8');
    const sdFuel = readFileSync(resolve(instruments, 'SD/Pages/Fuel/Fuel.tsx'), 'utf-8');
    expect(ewdFob).toContain('isFuelOnBoardHalfBoxed(');
    expect(sdFuel).toContain('isFuelOnBoardHalfBoxed(');
    expect(sdFuel).toContain('isOuterTankQuantityBoxed(leftOuterXfrClosed > 0)');
    expect(sdFuel).toContain('isOuterTankQuantityBoxed(rightOuterXfrClosed > 0)');
  });

  it('boxes the centre tank quantity on the latched failed closed valves', () => {
    const sdFuel = readFileSync(resolve(instruments, 'SD/Pages/Fuel/Fuel.tsx'), 'utf-8');
    expect(sdFuel).toContain('L:A32NX_FUEL_CTR_TK_L_XFR_VALVE_FAILED_CLOSED');
    expect(sdFuel).toContain('L:A32NX_FUEL_CTR_TK_R_XFR_VALVE_FAILED_CLOSED');
  });
});
