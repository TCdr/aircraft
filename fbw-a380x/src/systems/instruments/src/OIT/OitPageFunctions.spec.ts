// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Subject } from '@microsoft/msfs-sdk';
import {
  isHomeDisabled,
  isPageFunctionAvailable,
  OitPageFunctions,
  PageFunctionAvailability,
} from './OitPageFunctions';

/*
 * Which functions of the menu bars are active depends on the application: the others stay greyed.
 */
describe('OIS page functions (PRINT, STORE, UPDATE, UNDO, REDO)', () => {
  it('greys a function the page does not have', () => {
    expect(isPageFunctionAvailable({}, 'print')).toBe(false);
    expect(isPageFunctionAvailable({ print: { run: () => {} } }, 'print')).toBe(true);
    expect(isPageFunctionAvailable({ print: { run: () => {} } }, 'store')).toBe(false);
  });

  it('follows the page and what it can do now', () => {
    const functions = Subject.create<OitPageFunctions>({});
    const printAvailability = new PageFunctionAvailability(functions, 'print');
    expect(printAvailability.available.get()).toBe(false);

    const messageSelected = Subject.create(false);
    functions.set({ print: { run: () => {}, available: messageSelected } });
    expect(printAvailability.available.get()).toBe(false);
    messageSelected.set(true);
    expect(printAvailability.available.get()).toBe(true);

    // another page: the previous page's state no longer counts
    functions.set({});
    expect(printAvailability.available.get()).toBe(false);
    messageSelected.set(false);
    messageSelected.set(true);
    expect(printAvailability.available.get()).toBe(false);

    functions.set({ print: { run: () => {} } });
    expect(printAvailability.available.get()).toBe(true);
    printAvailability.destroy();
  });
});

describe('HOME of the FLT OPS FUNCTIONS list', () => {
  it('is greyed on the home page of an application and outside applications', () => {
    expect(isHomeDisabled('ops-library', 'ops-library', false)).toBe(true);
    expect(isHomeDisabled(null, 'menu', false)).toBe(true);
    expect(isHomeDisabled('ops-library', 'ops-library/unit', false)).toBe(false);
  });

  it('is active on the home page while the page has a way home of its own', () => {
    expect(isHomeDisabled('ops-library', 'ops-library', true)).toBe(false);
  });

  it('follows what the page can do now', () => {
    const consulting = Subject.create(false);
    const functions = Subject.create<OitPageFunctions>({ home: { run: () => {}, available: consulting } });
    const home = new PageFunctionAvailability(functions, 'home');
    expect(isHomeDisabled('ops-library', 'ops-library', home.available.get())).toBe(true);
    consulting.set(true);
    expect(isHomeDisabled('ops-library', 'ops-library', home.available.get())).toBe(false);
    home.destroy();
  });
});
