// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeAll, describe, expect, it } from 'vitest';
import { Subject } from '@microsoft/msfs-sdk';
import { OitUiService } from './OitUiService';
import { OisLaptopData } from './OisLaptop';

beforeAll(() => {
  // the sim browser call that unfocuses the entry fields before a navigation
  (Coherent as unknown as { trigger: () => void }).trigger = () => {};
});

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

  it('cannot exit while the FLT FOLDER is open on the switching bar, can once it is closed', () => {
    const { ui } = sessionOn('flt-ops');
    ui.fltOpsApplications.show('flt-ops/flt-folder');
    ui.fltOpsApplications.show('flt-ops');
    expect(ui.exitFltOpsSession()).toBe(false);

    ui.fltOpsApplications.show('flt-ops/flt-folder');
    ui.fltOpsApplications.closeActive();
    expect(ui.exitFltOpsSession()).toBe(true);
    expect(ui.fltOpsApplications.open.get()).toEqual([]);
  });

  it('starts the FLT OPS STS application at each login', () => {
    const ui = new OitUiService('CAPT');
    ui.fltOpsLoginScreenVisible.set(false);
    expect(ui.fltOpsApplications.open.get()).toEqual(['flt-ops/sts']);
    ui.fltOpsApplications.show('flt-ops/charts');
    ui.exitFltOpsSession();
    ui.fltOpsLoginScreenVisible.set(false);
    expect(ui.fltOpsApplications.open.get()).toEqual(['flt-ops/sts']);
  });
});

describe('NSS AVNCS log-on', () => {
  it('starts COMPANY COM and the LOGBOOK, and closes all applications at the log-off', () => {
    const ui = new OitUiService('CAPT');
    expect(ui.nssAvncsApplications.open.get()).toEqual([]);
    ui.nssAvncsLoginScreenVisible.set(false);
    expect(ui.nssAvncsApplications.open.get()).toEqual(['nss-avncs/company-com', 'nss-avncs/logbook']);
    ui.nssAvncsLoginScreenVisible.set(true);
    expect(ui.nssAvncsApplications.open.get()).toEqual([]);
  });
});

describe('OIT navigation', () => {
  it('opens COMPANY COM on its Inbox, so that BACK never shows an empty COMPANY COM page', () => {
    const ui = new OitUiService('CAPT');
    ui.navigateTo('nss-avncs');
    ui.navigateTo('nss-avncs/company-com');
    expect(ui.activeUri.get().uri).toBe('nss-avncs/company-com/inbox');
    ui.navigateTo('nss-avncs/company-com/sent');
    ui.navigateTo('back');
    expect(ui.activeUri.get().uri).toBe('nss-avncs/company-com/inbox');
    ui.navigateTo('back');
    expect(ui.activeUri.get().uri).toBe('nss-avncs');
  });

  it('greys BACK / PREVIOUS and FORWARD / NEXT when there is no page to go to', () => {
    const ui = new OitUiService('CAPT');
    ui.navigateTo('flt-ops');
    expect(ui.backAvailable.get()).toBe(false);
    expect(ui.forwardAvailable.get()).toBe(false);
    ui.navigateTo('flt-ops/sts');
    expect(ui.backAvailable.get()).toBe(true);
    ui.navigateTo('back');
    expect(ui.backAvailable.get()).toBe(false);
    expect(ui.forwardAvailable.get()).toBe(true);
    ui.navigateTo('forward');
    expect(ui.activeUri.get().uri).toBe('flt-ops/sts');
    expect(ui.forwardAvailable.get()).toBe(false);
  });

  it('runs the functions the displayed page registered, and drops them at the next page', () => {
    const ui = new OitUiService('CAPT');
    ui.navigateTo('nss-avncs/company-com/inbox');
    let printed = 0;
    const messageSelected = Subject.create(false);
    ui.registerPageFunctions({ print: { run: () => printed++, available: messageSelected } });

    expect(ui.runPageFunction('print')).toBe(false);
    messageSelected.set(true);
    expect(ui.runPageFunction('print')).toBe(true);
    expect(ui.runPageFunction('store')).toBe(false);
    expect(printed).toBe(1);

    ui.navigateTo('nss-avncs/company-com/sent');
    expect(ui.runPageFunction('print')).toBe(false);
    expect(printed).toBe(1);
  });

  it('runs a shortcut of the displayed page first, then of the menu bars, only while its button could be clicked', () => {
    const ui = new OitUiService('CAPT');
    ui.navigateTo('flt-ops/to-perf');
    const calls: string[] = [];
    const enabled = Subject.create(false);
    ui.registerMenuShortcuts({
      'CTRL+P': { run: () => calls.push('menu print') },
      F8: { run: () => calls.push('menu') },
    });
    ui.registerPageShortcuts({ F8: { run: () => calls.push('compute'), available: enabled } });

    expect(ui.runShortcut('F8')).toBe(false);
    enabled.set(true);
    expect(ui.runShortcut('F8')).toBe(true);
    expect(ui.runShortcut('CTRL+P')).toBe(true);
    expect(ui.runShortcut('F6')).toBe(false);
    expect(calls).toEqual(['compute', 'menu print']);

    ui.navigateTo('flt-ops/loadsheet');
    expect(ui.runShortcut('F8')).toBe(true);
    expect(calls[2]).toBe('menu');
  });

  it('UPDATE shows the displayed page again, without a new BACK step', () => {
    const ui = new OitUiService('CAPT');
    ui.navigateTo('nss-avncs');
    ui.navigateTo('nss-avncs/company-com/inbox');
    const shown: string[] = [];
    ui.activeUri.sub((uri) => shown.push(uri.uri));
    ui.reloadActivePage();
    expect(shown).toEqual(['nss-avncs/company-com/inbox']);
    ui.navigateTo('back');
    expect(ui.activeUri.get().uri).toBe('nss-avncs');
  });
});
