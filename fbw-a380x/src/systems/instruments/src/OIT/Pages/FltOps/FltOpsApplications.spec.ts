// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { fltOpsApplicationName, fltOpsApplicationOf, FltOpsOpenApplications } from './FltOpsApplications';

describe('FLT OPS application names', () => {
  it('names every application of the MENU drop-down list and of the FLT OPS MENU page', () => {
    expect(
      [
        'flt-ops',
        'flt-ops/flt-folder',
        'flt-ops/charts',
        'flt-ops/ops-library',
        'flt-ops/to-perf',
        'flt-ops/loadsheet',
        'flt-ops/ldg-perf',
        'flt-ops/in-flt-perf',
        'flt-ops/sts',
        'flt-ops/load-box',
        'flt-ops/export-box',
      ].map(fltOpsApplicationName),
    ).toEqual([
      'FLT OPS MENU',
      'FLT FOLDER',
      'CHARTS',
      'OPS LIBRARY',
      'T.O PERF',
      'LOADSHEET',
      'LDG PERF',
      'IN-FLT PERF',
      'FLT OPS STS',
      'LOAD BOX',
      'EXPORT BOX',
    ]);
  });

  it('names the pages inside an application after it, and never shows a placeholder', () => {
    expect(fltOpsApplicationName('flt-ops/ops-library/fcom/dsc-46')).toBe('OPS LIBRARY');
    expect(fltOpsApplicationName('flt-ops/new-app')).toBe('NEW APP');
    expect(fltOpsApplicationOf('flt-ops')).toBeNull();
    expect(fltOpsApplicationOf('nss-avncs/company-com')).toBeNull();
    expect(fltOpsApplicationOf('flt-ops/to-perf/results')).toBe('flt-ops/to-perf');
  });
});

/*
 * The switching bar shows the open applications with the active one highlighted; HIDE SWITCHING BAR hides it, CLOSE
 * APPLICATION closes the active application.
 */
describe('FLT OPS open applications (switching bar)', () => {
  it('opens an application when one of its pages is displayed, in the order they were opened', () => {
    const apps = new FltOpsOpenApplications(5);
    apps.startSession(['flt-ops/sts']);
    expect(apps.open.get()).toEqual(['flt-ops/sts']);
    expect(apps.active.get()).toBeNull();

    apps.show('flt-ops/flt-folder');
    apps.show('flt-ops/charts');
    apps.show('flt-ops/flt-folder');
    expect(apps.open.get()).toEqual(['flt-ops/sts', 'flt-ops/flt-folder', 'flt-ops/charts']);
    expect(apps.active.get()).toBe('flt-ops/flt-folder');

    // the FLT OPS MENU page is not an application
    apps.show('flt-ops');
    expect(apps.active.get()).toBeNull();
    expect(apps.open.get()).toHaveLength(3);
  });

  it('goes back to the last page shown of an application', () => {
    const apps = new FltOpsOpenApplications(5);
    apps.show('flt-ops/ops-library/fcom');
    apps.show('flt-ops');
    expect(apps.pageOf('flt-ops/ops-library')).toBe('flt-ops/ops-library/fcom');
  });

  it('CLOSE APPLICATION closes the active application only', () => {
    const apps = new FltOpsOpenApplications(5);
    apps.show('flt-ops/sts');
    apps.show('flt-ops/charts');
    expect(apps.closeActive()).toBe('flt-ops/charts');
    expect(apps.open.get()).toEqual(['flt-ops/sts']);
    expect(apps.isOpen('flt-ops/charts')).toBe(false);
    expect(apps.active.get()).toBeNull();
    expect(apps.closeActive()).toBeNull();
  });

  it('scrolls with the arrows when more applications are open than the bar has keys', () => {
    const apps = new FltOpsOpenApplications(2);
    apps.show('flt-ops/sts');
    apps.show('flt-ops/charts');
    expect(apps.shown.get()).toEqual(['flt-ops/sts', 'flt-ops/charts']);
    expect(apps.canScrollLeft.get()).toBe(false);
    expect(apps.canScrollRight.get()).toBe(false);

    // the displayed application stays on the bar
    apps.show('flt-ops/flt-folder');
    expect(apps.shown.get()).toEqual(['flt-ops/charts', 'flt-ops/flt-folder']);
    expect(apps.canScrollLeft.get()).toBe(true);

    apps.scroll(-1);
    expect(apps.shown.get()).toEqual(['flt-ops/sts', 'flt-ops/charts']);
    expect(apps.canScrollRight.get()).toBe(true);
    apps.scroll(-1);
    expect(apps.shown.get()).toEqual(['flt-ops/sts', 'flt-ops/charts']);

    apps.scroll(1);
    apps.scroll(1);
    expect(apps.shown.get()).toEqual(['flt-ops/charts', 'flt-ops/flt-folder']);

    // closing one pulls the bar back
    apps.closeActive();
    expect(apps.shown.get()).toEqual(['flt-ops/sts', 'flt-ops/charts']);
  });
});
