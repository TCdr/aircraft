// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CDUIRSStatus } from './A320_Neo_CDU_IRSStatus';

const IRS_STATUS_PAGE = 7;

/** One MCDU screen: the per-screen fields of the real MCDU with their initial values, spies for the display. */
function createScreen() {
  const screen: any = {
    page: { Current: 0, IRSStatus: IRS_STATUS_PAGE },
    onLeftInput: [] as Array<() => void>,
    onRightInput: [] as Array<() => void>,
    rightInputDelay: [],
    onUnload: () => {},
    SelfPtr: false,
    PageTimeout: { Default: 2000 },
    irsStatusFrozen: false,
    clearDisplay: vi.fn(),
    setTemplate: vi.fn(),
    getDelaySwitchPage: () => 0,
  };
  return screen;
}

const titleOf = (screen: any): string =>
  screen.setTemplate.mock.calls[screen.setTemplate.mock.calls.length - 1][0][0][0];

describe('the IRS STATUS page', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as any).SimVar = {
      GetSimVarValue: () => 0,
      GetSimVarValueFastReg: () => 0,
      GetGlobalVarValue: () => 36000,
      SetSimVarValue: () => Promise.resolve(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('freezing IRS STATUS on one MCDU leaves the other one live', () => {
    const cpt = createScreen();
    const fo = createScreen();
    CDUIRSStatus.ShowPage(cpt, 1);
    CDUIRSStatus.ShowPage(fo, 1);
    fo.setTemplate.mockClear();

    // [6L] FREEZE
    cpt.onLeftInput[5]();
    expect(titleOf(cpt)).toContain('FROZEN');

    CDUIRSStatus.ShowPage(fo, 1);
    expect(fo.setTemplate).toHaveBeenCalledTimes(1);
    expect(titleOf(fo)).not.toContain('FROZEN');

    // the F/O leaving the page does not release the CPT freeze
    fo.onUnload();
    CDUIRSStatus.ShowPage(cpt, 1, '1000');
    expect(titleOf(cpt)).toContain('FROZEN');
    cpt.onUnload();
  });
});
