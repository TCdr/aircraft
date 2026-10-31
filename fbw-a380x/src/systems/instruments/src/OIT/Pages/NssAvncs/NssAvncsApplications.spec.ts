// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  createNssAvncsOpenApplications,
  isPageOfRenderedApplication,
  nssAvncsApplicationName,
  nssAvncsApplicationOf,
} from './NssAvncsApplications';

describe('NSS AVNCS applications', () => {
  it('names the applications of the NSS AVNCS menu on the task bar', () => {
    expect(
      ['nss-avncs/logbook', 'nss-avncs/company-com', 'nss-avncs/refuel', 'nss-avncs/a380x-systems'].map(
        nssAvncsApplicationName,
      ),
    ).toEqual(['LOGBOOK', 'COMPANY COM', 'REFUEL', 'A380X SYSTEMS']);
  });

  it('finds the application of a page, none on the menu page and the FLT OPS side', () => {
    expect(nssAvncsApplicationOf('nss-avncs/logbook/open-items')).toBe('nss-avncs/logbook');
    expect(nssAvncsApplicationOf('nss-avncs/company-com/inbox')).toBe('nss-avncs/company-com');
    expect(nssAvncsApplicationOf('nss-avncs')).toBeNull();
    expect(nssAvncsApplicationOf('flt-ops/to-perf')).toBeNull();
  });
});

/*
 * The task bar shows the open applications in the order they were opened (COMPANY COM, then LOGBOOK), the active one
 * highlighted; CLOSE closes the active one.
 */
describe('NSS AVNCS open applications (task bar)', () => {
  it('opens each application once, in the order they were opened, on all its keys', () => {
    const apps = createNssAvncsOpenApplications();
    apps.show('nss-avncs');
    expect(apps.open.get()).toEqual([]);
    expect(apps.active.get()).toBeNull();

    apps.show('nss-avncs/company-com/inbox');
    apps.show('nss-avncs/logbook/status');
    apps.show('nss-avncs/refuel');
    apps.show('nss-avncs/logbook/history');
    expect(apps.open.get()).toEqual(['nss-avncs/company-com', 'nss-avncs/logbook', 'nss-avncs/refuel']);
    expect(apps.shown.get()).toEqual(apps.open.get());
    expect(apps.active.get()).toBe('nss-avncs/logbook');
    expect(apps.pageOf('nss-avncs/logbook')).toBe('nss-avncs/logbook/history');
    expect(apps.canScrollRight.get()).toBe(false);
  });

  it('closes the active application with CLOSE, and all of them at the log-off', () => {
    const apps = createNssAvncsOpenApplications();
    apps.show('nss-avncs/company-com/inbox');
    apps.show('nss-avncs/logbook');
    expect(apps.closeActive()).toBe('nss-avncs/logbook');
    expect(apps.open.get()).toEqual(['nss-avncs/company-com']);

    apps.show('nss-avncs');
    expect(apps.closeActive()).toBeNull();

    apps.reset();
    expect(apps.open.get()).toEqual([]);
  });
});

describe('pages of an application that is already drawn', () => {
  it('are left to the application for company-com, a380x-systems and logbook', () => {
    expect(isPageOfRenderedApplication('nss-avncs/company-com/inbox', 'nss-avncs/company-com')).toBe(true);
    expect(isPageOfRenderedApplication('nss-avncs/a380x-systems/debug-data', 'nss-avncs/a380x-systems')).toBe(true);
    expect(isPageOfRenderedApplication('nss-avncs/logbook/status', 'nss-avncs/logbook')).toBe(true);
  });

  it('are drawn by the container for the other applications and after a change of application', () => {
    expect(isPageOfRenderedApplication('nss-avncs/refuel/anything', 'nss-avncs/refuel')).toBe(false);
    expect(isPageOfRenderedApplication('nss-avncs/logbook/status', 'nss-avncs/company-com')).toBe(false);
    expect(isPageOfRenderedApplication('nss-avncs/logbook', 'nss-avncs/logbook')).toBe(false);
  });
});
