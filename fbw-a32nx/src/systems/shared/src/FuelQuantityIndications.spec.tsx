// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderSdPage, RenderedSdPage } from '../../instruments/src/SD/Common/SdPageSpecHarness';
import { FuelPage } from '../../instruments/src/SD/Pages/Fuel/Fuel';
import { FuelTransferFailures, isFuelOnBoardHalfBoxed, isOuterTankQuantityBoxed } from './FuelQuantityIndications';

const none: FuelTransferFailures = {
  leftOuterXfrClosed: false,
  rightOuterXfrClosed: false,
  leftCentreXfrFailedClosed: false,
  rightCentreXfrFailedClosed: false,
};

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

describe('SD FUEL outer tank quantity amber box', () => {
  it('follows the failure of the outer tank transfer valves of its wing', () => {
    expect(isOuterTankQuantityBoxed(true)).toBe(true);
    expect(isOuterTankQuantityBoxed(false)).toBe(false);
  });
});

describe('fuel quantity boxes on the SD FUEL page', () => {
  let page: RenderedSdPage;
  afterEach(() => page?.unmount());

  const FOB_HALF_BOX = 'path.AmberLine';
  const LEFT_OUTER_BOX = 'rect.AmberLine[x="6"]';
  const RIGHT_OUTER_BOX = 'rect.AmberLine[x="506"]';
  const CENTRE_BOX = 'rect.AmberLine[x="236"]';
  const boxesShown = (...selectors: string[]) =>
    selectors.map((selector) => page.container.querySelector(selector) !== null);

  it('draws no box without a transfer valve failure', () => {
    page = renderSdPage(<FuelPage />);
    expect(boxesShown(FOB_HALF_BOX, LEFT_OUTER_BOX, RIGHT_OUTER_BOX, CENTRE_BOX)).toEqual([false, false, false, false]);
  });

  it('boxes the outer quantity of the wing whose outer tank transfer valves failed, and half-boxes the FOB', () => {
    page = renderSdPage(<FuelPage />, { 'L:A32NX_FUEL_L_OUTER_XFR_CLOSED': 1 });
    expect(boxesShown(FOB_HALF_BOX, LEFT_OUTER_BOX, RIGHT_OUTER_BOX, CENTRE_BOX)).toEqual([true, true, false, false]);
    page.unmount();

    page = renderSdPage(<FuelPage />, { 'L:A32NX_FUEL_R_OUTER_XFR_CLOSED': 1 });
    expect(boxesShown(FOB_HALF_BOX, LEFT_OUTER_BOX, RIGHT_OUTER_BOX, CENTRE_BOX)).toEqual([true, false, true, false]);
  });

  it('boxes the centre tank quantity and half-boxes the FOB when both centre tank valves failed closed, not with one', () => {
    page = renderSdPage(<FuelPage />, { 'L:A32NX_FUEL_CTR_TK_L_XFR_VALVE_FAILED_CLOSED': 1 });
    expect(boxesShown(CENTRE_BOX, FOB_HALF_BOX)).toEqual([false, false]);
    page.unmount();

    page = renderSdPage(<FuelPage />, { 'L:A32NX_FUEL_CTR_TK_R_XFR_VALVE_FAILED_CLOSED': 1 });
    expect(boxesShown(CENTRE_BOX, FOB_HALF_BOX)).toEqual([false, false]);
    page.unmount();

    page = renderSdPage(<FuelPage />, {
      'L:A32NX_FUEL_CTR_TK_L_XFR_VALVE_FAILED_CLOSED': 1,
      'L:A32NX_FUEL_CTR_TK_R_XFR_VALVE_FAILED_CLOSED': 1,
    });
    expect(boxesShown(CENTRE_BOX, FOB_HALF_BOX)).toEqual([true, true]);
  });
});
