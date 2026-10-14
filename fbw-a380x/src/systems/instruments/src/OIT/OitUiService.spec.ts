// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { OitUiService } from './OitUiService';
import { OisLaptopData } from './OisLaptop';

/*
 * A380 FCOM DSC-46-20-50-10 HOW TO EXIT THE OIS SESSION (a380_fcom.txt l.105900-105907): "exit the current session and
 * return to the Login page [...] The flight crew cannot exit the OIS session when the FLT FOLDER application is open."
 * PRO-NOR-SOP (l.127590-127591): "The exit session initializes again the FLT OPS STS page on the laptops for the next
 * flight."
 */
describe('OIS EXIT SESSION', () => {
  const sessionOn = (uri: string) => {
    const ui = new OitUiService('CAPT');
    const data = new OisLaptopData();
    ui.onFltOpsSessionExit(() => data.reset());
    data.fltNumber.set('FBW123');
    data.fromAirport.set('EGLL');
    data.toAirport.set('KJFK');
    ui.fltOpsLoginScreenVisible.set(false);
    ui.activeUri.set(ui.parseUri(uri));
    return { ui, data };
  };

  it('returns to the Login page and clears the FLT OPS STS page', () => {
    const { ui, data } = sessionOn('flt-ops');
    expect(ui.exitFltOpsSession()).toBe(true);
    expect(ui.fltOpsLoginScreenVisible.get()).toBe(true);
    expect(ui.activeUri.get().uri).toBe('flt-ops');
    expect(data.fltNumber.get()).toBeNull();
    expect(data.fromAirport.get()).toBeNull();
    expect(data.toAirport.get()).toBeNull();
  });

  it('cannot exit while the FLT FOLDER is open', () => {
    const { ui, data } = sessionOn('flt-ops/flt-folder');
    expect(ui.exitFltOpsSession()).toBe(false);
    expect(ui.fltOpsLoginScreenVisible.get()).toBe(false);
    expect(data.fltNumber.get()).toBe('FBW123');
  });
});
