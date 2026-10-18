// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FLT_OPS_MENU_URI, XOisFunction, fltOpsPageCode, fltOpsPageUri } from './XOisFunction';

describe('FLT OPS page codes of the OITs', () => {
  it('codes every FLT OPS page and back, 0 for other pages', () => {
    for (const uri of ['flt-ops', 'flt-ops/sts', 'flt-ops/to-perf', 'flt-ops/ldg-perf', 'flt-ops/charts']) {
      expect(fltOpsPageUri(fltOpsPageCode(uri))).toBe(uri);
    }
    expect(fltOpsPageCode('nss-avncs/company-com')).toBe(0);
    expect(fltOpsPageUri(0)).toBeNull();
    expect(fltOpsPageUri(99)).toBeNull();
  });
});

describe('OIS MENU key (A380 FCOM DSC-46-20-20-50, a380_fcom.txt l.103028-103029)', () => {
  it('displays the FLT OPS Menu page', () => {
    expect(new XOisFunction().onOisMenuKey()).toBe(FLT_OPS_MENU_URI);
  });

  it('ends X-OIS', () => {
    const xOis = new XOisFunction();
    xOis.onOisXfrKey('flt-ops/sts', fltOpsPageCode('flt-ops/charts'));
    expect(xOis.onOisMenuKey()).toBe(FLT_OPS_MENU_URI);
    expect(xOis.isActive()).toBe(false);
  });
});

describe('OIS XFR key, X-OIS (A380 FCOM DSC-46-20-30, a380_fcom.txt l.104889-104895)', () => {
  it('displays the current page of the other OIT, "X-OIS Activated", and follows it', () => {
    const xOis = new XOisFunction();
    expect(xOis.onOisXfrKey('flt-ops/sts', fltOpsPageCode('flt-ops/to-perf'))).toBe('flt-ops/to-perf');
    expect(xOis.isActive()).toBe(true);
    expect(xOis.onOtherOitPage(fltOpsPageCode('flt-ops/charts'))).toBe('flt-ops/charts');
  });

  it('pressed again: deactivated, the own page comes back', () => {
    const xOis = new XOisFunction();
    xOis.onOisXfrKey('flt-ops/sts', fltOpsPageCode('flt-ops/to-perf'));
    expect(xOis.onOisXfrKey('flt-ops/to-perf', fltOpsPageCode('flt-ops/to-perf'))).toBe('flt-ops/sts');
    expect(xOis.isActive()).toBe(false);
    expect(xOis.onOtherOitPage(fltOpsPageCode('flt-ops/charts'))).toBeNull();
  });

  it('keeps publishing its own page while in X-OIS, so that two OITs in X-OIS do not follow each other', () => {
    const xOis = new XOisFunction();
    expect(xOis.publishedUri('flt-ops/sts')).toBe('flt-ops/sts');
    xOis.onOisXfrKey('flt-ops/sts', fltOpsPageCode('flt-ops/to-perf'));
    expect(xOis.publishedUri('flt-ops/to-perf')).toBe('flt-ops/sts');
  });

  it('stays on its page when the other OIT shows no FLT OPS page', () => {
    const xOis = new XOisFunction();
    expect(xOis.onOisXfrKey('flt-ops/sts', 0)).toBeNull();
    expect(xOis.isActive()).toBe(true);
  });
});
