// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { join } from 'path';
import JSON5 from 'json5';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { A32NX_FUEL_PUMP_PB_SELECTIONS, checkA32NXFuelPumpsOff } from './CheckItemStates';
import { ChecklistJsonDefinition } from './ChecklistInterfaces';

describe('A32NX FUEL PUMPS OFF checklist item', () => {
  const simVars = new Map<string, number>();

  afterEach(() => {
    simVars.clear();
    vi.restoreAllMocks();
  });

  const mockSimVars = () =>
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => simVars.get(name) ?? 0);

  it('is done when every pump pb-sw is OFF, even though a pump still runs', () => {
    mockSimVars();
    simVars.set('FUELSYSTEM PUMP ACTIVE:2', 1);
    expect(checkA32NXFuelPumpsOff()).toBe(true);
  });

  it('is not done while a pb-sw is ON, even though its pump does not run (failed, or its tank empty)', () => {
    mockSimVars();
    simVars.set('L:A32NX_OVHD_FUEL_PUMP_6_PB_IS_ON', 1);
    expect(checkA32NXFuelPumpsOff()).toBe(false);
  });

  it('does not wait for the CTR TK L and R XFR pb-sw, which stay ON at parking (FCOM: items of their own)', () => {
    mockSimVars();
    simVars.set('L:A32NX_OVHD_FUEL_CTR_TK_L_XFR_PB_IS_ON', 1);
    simVars.set('L:A32NX_OVHD_FUEL_CTR_TK_R_XFR_PB_IS_ON', 1);
    expect(checkA32NXFuelPumpsOff()).toBe(true);
    expect(A32NX_FUEL_PUMP_PB_SELECTIONS).toHaveLength(4);
  });

  it('is checked on the same pb-sw selections by the flyPad checklist file', () => {
    const file = join(
      process.cwd(),
      'fbw-a32nx/src/base/flybywire-aircraft-a320-neo/config/a32nx/a320-251n/checklists.json5',
    );
    const checklists: ChecklistJsonDefinition[] = JSON5.parse(readFileSync(file, 'utf8')).checklists;
    const items = checklists.flatMap((checklist) => checklist.items).filter((item) => item.item === 'FUEL PUMPS');
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.condition?.map((condition) => condition.varName)).toEqual(A32NX_FUEL_PUMP_PB_SELECTIONS);
      expect(item.condition?.every((condition) => condition.result === 0)).toBe(true);
    }
  });
});
