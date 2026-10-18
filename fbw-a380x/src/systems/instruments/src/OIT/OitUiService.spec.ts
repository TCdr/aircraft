// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { OitUiService } from './OitUiService';
import { OisLaptopData } from './OisLaptop';

/*
 * EXIT SESSION goes back to the Login page and clears the FLT OPS STS page of the laptops for the next flight; it is
 * not possible while the FLT FOLDER application is open.
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
