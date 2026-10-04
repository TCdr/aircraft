// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  centreTransferNotClosedLines,
  centreTransferNotOpenLines,
  centreTransferValveAlerts,
  isCrossFeedMemoShown,
  isCrossFeedValveDisagree,
  wingTankPumpAlerts,
  wingTankPumps1And2Lines,
} from './FuelPumpValveFaults';

describe('FUEL L(R) TK PUMP LO PR cautions (FCOM PRO-ABN-FUEL)', () => {
  it('gives nothing with both pumps delivering', () => {
    expect(wingTankPumpAlerts(false, false)).toEqual({ pump1LoPr: false, pump2LoPr: false, pumps1And2LoPr: false });
  });

  it('gives the single pump caution for one pump', () => {
    expect(wingTankPumpAlerts(true, false)).toEqual({ pump1LoPr: true, pump2LoPr: false, pumps1And2LoPr: false });
    expect(wingTankPumpAlerts(false, true)).toEqual({ pump1LoPr: false, pump2LoPr: true, pumps1And2LoPr: false });
  });

  it('gives only the 1 + 2 caution for both pumps', () => {
    expect(wingTankPumpAlerts(true, true)).toEqual({ pump1LoPr: false, pump2LoPr: false, pumps1And2LoPr: true });
  });
});

describe('FUEL X FEED VALVE FAULT condition (FCOM PRO-ABN-FUEL)', () => {
  it('is false when the valve follows the pb-sw', () => {
    expect(isCrossFeedValveDisagree(100, true)).toBe(false);
    expect(isCrossFeedValveDisagree(0, false)).toBe(false);
  });

  it('is true when the valve stays closed with the pb-sw ON, or open with it OFF', () => {
    expect(isCrossFeedValveDisagree(0, true)).toBe(true);
    expect(isCrossFeedValveDisagree(100, false)).toBe(true);
  });
});

describe('FUEL X FEED memo (FCOM DSC-28-20)', () => {
  it('shows with the X FEED pb-sw ON and the valve not fully closed', () => {
    expect(isCrossFeedMemoShown(true, 100)).toBe(true);
    expect(isCrossFeedMemoShown(true, 30)).toBe(true);
  });

  it('does not show with the valve jammed closed and the pb-sw ON, nor with the pb-sw OFF', () => {
    expect(isCrossFeedMemoShown(true, 0)).toBe(false);
    expect(isCrossFeedMemoShown(false, 100)).toBe(false);
  });
});

describe('FUEL L(R) TK PUMP 1 + 2 LO PR lines', () => {
  const inputs = { crossFeedOn: false, engModeSelIgn: false, pump1On: true, pump2On: true, aboveFl150: true };

  it('asks for X FEED ON, IGN and both pumps OFF above FL 150', () => {
    expect(wingTankPumps1And2Lines(inputs)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      true,
      true,
    ]);
  });

  it('removes the actions once done', () => {
    expect(
      wingTankPumps1And2Lines({
        crossFeedOn: true,
        engModeSelIgn: true,
        pump1On: false,
        pump2On: false,
        aboveFl150: true,
      }),
    ).toEqual([true, true, false, false, false, false, true, true, false, true, true]);
  });

  it('asks for X FEED OFF below FL 150', () => {
    expect(wingTankPumps1And2Lines({ ...inputs, crossFeedOn: true, aboveFl150: false })[2]).toBe(false);
    expect(wingTankPumps1And2Lines({ ...inputs, crossFeedOn: true, aboveFl150: false })[8]).toBe(true);
  });
});

describe('FUEL CTR XFR FAULT cautions (FCOM PRO-ABN-FUEL, jet pump variant)', () => {
  const ok = { notFullyClosed: false, notFullyOpen: false };
  const failedOpen = { notFullyClosed: true, notFullyOpen: false };
  const failedClosed = { notFullyClosed: false, notFullyOpen: true };
  const none = {
    leftNotFullyClosed: false,
    rightNotFullyClosed: false,
    bothNotFullyClosed: false,
    leftNotFullyOpen: false,
    rightNotFullyOpen: false,
    bothNotFullyOpen: false,
  };

  it('gives nothing while both valves follow their command', () => {
    expect(centreTransferValveAlerts(ok, ok)).toEqual(none);
  });

  it('gives the single caution of the valve that failed', () => {
    expect(centreTransferValveAlerts(failedOpen, ok)).toEqual({ ...none, leftNotFullyClosed: true });
    expect(centreTransferValveAlerts(ok, failedClosed)).toEqual({ ...none, rightNotFullyOpen: true });
  });

  it('gives the L + R caution instead of the two single cautions of the same kind', () => {
    expect(centreTransferValveAlerts(failedOpen, failedOpen)).toEqual({ ...none, bothNotFullyClosed: true });
    expect(centreTransferValveAlerts(failedClosed, failedClosed)).toEqual({ ...none, bothNotFullyOpen: true });
  });

  it('gives both single cautions when one valve failed open and the other closed', () => {
    expect(centreTransferValveAlerts(failedOpen, failedClosed)).toEqual({
      ...none,
      leftNotFullyClosed: true,
      rightNotFullyOpen: true,
    });
  });

  const inputs = {
    ctrTkXfrOn: true,
    modeSelMan: false,
    crossFeedOn: false,
    pump1On: true,
    pump2On: true,
    centreTankEmpty: false,
  };

  it('VALVE NOT FULLY CLOSED: CTR TK XFR OFF, X FEED ON, TK PUMPS OFF while the centre tank has fuel', () => {
    expect(centreTransferNotClosedLines(inputs)).toEqual([true, true, true, true, true, true, true, true, true]);
    expect(
      centreTransferNotClosedLines({ ...inputs, ctrTkXfrOn: false, crossFeedOn: true, pump1On: false, pump2On: false }),
    ).toEqual([true, false, false, false, false, true, true, true, true]);
  });

  it('VALVE NOT FULLY CLOSED: TK PUMPS ON and X FEED OFF once the centre tank is empty', () => {
    const empty = {
      ...inputs,
      ctrTkXfrOn: false,
      crossFeedOn: true,
      pump1On: false,
      pump2On: false,
      centreTankEmpty: true,
    };
    expect(centreTransferNotClosedLines(empty)).toEqual([true, false, false, false, false, true, true, true, true]);
    expect(centreTransferNotClosedLines({ ...empty, crossFeedOn: false, pump1On: true, pump2On: true })).toEqual([
      true,
      false,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
    ]);
  });

  it('VALVE NOT FULLY OPEN: MODE SEL MAN, then IF UNSUCCESSFUL the wing feed while the centre tank has fuel', () => {
    expect(centreTransferNotOpenLines(inputs)).toEqual([true, true, true, true, true, true, true, true, true, true]);
    expect(centreTransferNotOpenLines({ ...inputs, modeSelMan: true, crossFeedOn: true })).toEqual([
      true,
      false,
      true,
      false,
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(centreTransferNotOpenLines({ ...inputs, centreTankEmpty: true, pump1On: false })).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
      true,
      true,
      false,
      false,
    ]);
  });
});
