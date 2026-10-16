// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { WxPbAutoDeselectLogic, wxPbPushEvent } from './WxPbAutoDeselect';

/** Runs the logic for that many seconds at 10 updates per second, returns every push it asked for */
function run(
  logic: WxPbAutoDeselectLogic,
  seconds: number,
  onGround: boolean,
  wxLeft = true,
  wxRight = true,
): ('L' | 'R')[] {
  const pushes: ('L' | 'R')[] = [];
  for (let i = 0; i < seconds * 10; i++) {
    pushes.push(...logic.update(onGround, 0.1, wxLeft, wxRight));
  }
  return pushes;
}

/* A380 FCOM DSC-34-20-30 (a380_fcom.txt l.92444-92447): 60 s after touchdown, the WX pb is automatically deselected */
describe('WX pb deselected 60 s after touchdown', () => {
  it('both WX pbs pushed once, 60 s after touchdown', () => {
    const logic = new WxPbAutoDeselectLogic();
    run(logic, 5, false);
    expect(run(logic, 59.5, true)).toEqual([]);
    expect(run(logic, 1, true)).toEqual(['L', 'R']);
    // once only: the crew can select it again on ground
    expect(run(logic, 120, true)).toEqual([]);
  });

  it('only the selected WX pbs', () => {
    const logic = new WxPbAutoDeselectLogic();
    run(logic, 1, false);
    expect(run(logic, 61, true, false, true)).toEqual(['R']);
  });

  it('nothing after a spawn on the ground', () => {
    const logic = new WxPbAutoDeselectLogic();
    expect(run(logic, 120, true)).toEqual([]);
  });

  it('a lift-off before the 60 s (touch and go) cancels the count', () => {
    const logic = new WxPbAutoDeselectLogic();
    run(logic, 1, false);
    run(logic, 30, true);
    expect(run(logic, 60, false)).toEqual([]);
    expect(run(logic, 61, true)).toEqual(['L', 'R']);
  });

  it('pushes the FCU event of the EFIS CP', () => {
    expect(wxPbPushEvent('L')).toBe('K:A32NX.FCU_EFIS_L_WX_PUSH');
    expect(wxPbPushEvent('R')).toBe('K:A32NX.FCU_EFIS_R_WX_PUSH');
  });
});
