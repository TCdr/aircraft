// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';

vi.mock('./A320_Neo_CDU_AOC_Menu', () => ({ CDUAocMenu: { ShowPage: vi.fn() } }));
vi.mock('./A320_Neo_CDU_ATC_Menu', () => ({ CDUAtcMenu: { ShowPage: vi.fn() } }));
vi.mock('./A320_Neo_CDU_ATSU_DatalinkStatus', () => ({ CDUAtsuDatalinkStatus: { ShowPage: vi.fn() } }));
vi.mock('./A320_Neo_CDU_Comm_Menu', () => ({ CDUCommMenu: { ShowPage: vi.fn() } }));

import { CDUAtsuMenu } from './A320_Neo_CDU_ATSU_Menu';
import { CDUAocMenu } from './A320_Neo_CDU_AOC_Menu';
import { CDUCommMenu } from './A320_Neo_CDU_Comm_Menu';

/** The parts of the MCDU the page uses */
function fakeMcdu() {
  return {
    template: [] as string[][],
    page: { Current: 0, ATSUMenu: 68 },
    activeSystem: '',
    leftInputDelay: [] as (() => number)[],
    onLeftInput: [] as (() => void)[],
    rightInputDelay: [] as (() => number)[],
    onRightInput: [] as (() => void)[],
    clearDisplay() {},
    setTemplate(template: string[][]) {
      this.template = template;
    },
    getDelaySwitchPage() {
      return 0;
    },
  };
}

describe('MCDU ATSU DATALINK page (A320 FCOM l.59174-59175)', () => {
  it('shows AOC MENU on 1R and opens the AOC MENU page from 1R', () => {
    const mcdu = fakeMcdu();
    CDUAtsuMenu.ShowPage(mcdu as any);
    // line 1 of the page: template row 2
    expect(mcdu.template[2]).toEqual(['<ATC MENU', 'AOC MENU>']);
    expect(mcdu.template[4]).toEqual(['']);
    mcdu.onRightInput[0]();
    expect(CDUAocMenu.ShowPage).toHaveBeenCalledTimes(1);
    expect(mcdu.onRightInput[1]).toBe(undefined);
  });

  it('keeps COMM MENU on 6R', () => {
    const mcdu = fakeMcdu();
    CDUAtsuMenu.ShowPage(mcdu as any);
    expect(mcdu.template[12]).toEqual(['', 'COMM MENU>']);
    mcdu.onRightInput[5]();
    expect(CDUCommMenu.ShowPage).toHaveBeenCalledTimes(1);
  });
});
