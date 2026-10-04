// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
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
