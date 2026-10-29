// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { FLT_OPS_MENU_URI, XOisFunction, fltOpsPageCode, fltOpsPageUri } from './XOisFunction';

describe('FLT OPS page codes of the OITs', () => {
  it('codes every FLT OPS page and back, 0 for other pages', () => {
    for (const uri of [
      'flt-ops',
      'flt-ops/sts',
      'flt-ops/to-perf',
      'flt-ops/ldg-perf',
      'flt-ops/charts',
      'flt-ops/loadsheet',
    ]) {
      expect(fltOpsPageUri(fltOpsPageCode(uri))).toBe(uri);
    }
    expect(fltOpsPageCode('nss-avncs/company-com')).toBe(0);
    expect(fltOpsPageUri(0)).toBeNull();
    expect(fltOpsPageUri(99)).toBeNull();
  });

  it('keeps the code of each page, the new pages after the older ones', () => {
    expect(
      [
        'flt-ops',
        'flt-ops/sts',
        'flt-ops/to-perf',
        'flt-ops/ldg-perf',
        'flt-ops/charts',
        'flt-ops/flt-folder',
        'flt-ops/loadsheet',
        'flt-ops/in-flt-perf',
        'flt-ops/load-box',
        'flt-ops/export-box',
        'flt-ops/ops-library',
      ].map(fltOpsPageCode),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('codes the OPS LIBRARY 11 and takes it back to its page', () => {
    expect(fltOpsPageCode('flt-ops/ops-library')).toBe(11);
    expect(fltOpsPageUri(11)).toBe('flt-ops/ops-library');
  });

  it('codes every FLT OPS page of the page directory, each with its own code', () => {
    const directory = readFileSync(resolve(__dirname, '../OitPageDirectory.tsx'), 'utf-8');
    const pages = (directory.match(/case 'flt-ops\/[a-z-]+'/g) ?? []).map((match) => match.slice(6, -1));
    expect(pages.length).toBeGreaterThanOrEqual(9);
    const codes = pages.map(fltOpsPageCode);
    expect(codes).not.toContain(0);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('OIS MENU key', () => {
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

describe('OIS XFR key, X-OIS', () => {
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
